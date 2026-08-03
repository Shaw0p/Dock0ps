import { Socket, Server as SocketServer } from 'socket.io';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import docker from '../config/docker';
import { getIO } from '../config/socket';


// Helper to demux docker logs
export function parseDockerLogs(chunk: Buffer): { stream: 'stdout' | 'stderr'; text: string }[] {
  const logs: { stream: 'stdout' | 'stderr'; text: string }[] = [];
  let offset = 0;
  
  while (offset < chunk.length) {
    if (offset + 8 > chunk.length) break;
    const streamType = chunk.readUInt8(offset);
    const size = chunk.readUInt32BE(offset + 4);
    
    if (offset + 8 + size > chunk.length) {
      // Partial frame
      const text = chunk.slice(offset + 8).toString('utf8');
      logs.push({ stream: streamType === 2 ? 'stderr' : 'stdout', text });
      break;
    }
    
    const text = chunk.slice(offset + 8, offset + 8 + size).toString('utf8');
    logs.push({ stream: streamType === 2 ? 'stderr' : 'stdout', text });
    offset += 8 + size;
  }
  
  if (logs.length === 0 && chunk.length > 0) {
    // Fallback for TTY enabled (no headers)
    logs.push({ stream: 'stdout', text: chunk.toString('utf8') });
  }
  
  return logs;
}

export class SocketStreamService {
  // Store active streams per socket: socketId -> { type: 'logs' | 'stats' | 'terminal', id: string, stream: any }[]
  private activeStreams: Map<string, { type: 'logs' | 'stats' | 'terminal'; targetId: string; stream: any }[]> = new Map();
  private static eventsStream: any = null;

  init(io: SocketServer) {
    io.on('connection', (socket: Socket) => {
      this.activeStreams.set(socket.id, []);

      // Logs Subscription
      socket.on('subscribe-logs', async ({ containerId, tail = 100 }) => {
        await this.handleLogSubscription(socket, containerId, tail);
      });

      socket.on('unsubscribe-logs', ({ containerId }) => {
        this.clearSocketStream(socket.id, 'logs', containerId);
      });

      // Stats Subscription
      socket.on('subscribe-stats', async ({ containerId }) => {
        await this.handleStatsSubscription(socket, containerId);
      });

      socket.on('unsubscribe-stats', ({ containerId }) => {
        this.clearSocketStream(socket.id, 'stats', containerId);
      });

      // Terminal Subscription (exec shell stream)
      socket.on('subscribe-terminal', async ({ containerId, shell = '/bin/bash' }) => {
        await this.handleTerminalSubscription(socket, containerId, shell);
      });

      socket.on('unsubscribe-terminal', ({ containerId }) => {
        this.clearSocketStream(socket.id, 'terminal', containerId);
      });

      // Stack Logs Subscription (combined docker-compose logs)
      socket.on('subscribe-stack-logs', async ({ name }) => {
        socket.join(`stack-logs:${name}`);
        await this.handleStackLogSubscription(socket, name);
      });

      socket.on('unsubscribe-stack-logs', ({ name }) => {
        socket.leave(`stack-logs:${name}`);
        this.clearSocketStream(socket.id, 'stack-logs' as any, name);
      });


      // Terminal Key stroke input
      socket.on('terminal-input', ({ containerId, input }) => {
        const streams = this.activeStreams.get(socket.id) || [];
        const termStream = streams.find(s => s.type === 'terminal' && s.targetId === containerId);
        if (termStream && termStream.stream) {
          try {
            termStream.stream.write(input);
          } catch (e) {
            // Stream closed
          }
        }
      });

      // Disconnect cleanup
      socket.on('disconnect', () => {
        this.clearAllSocketStreams(socket.id);
        this.activeStreams.delete(socket.id);
      });
    });

    // Start global Docker events streaming
    this.startGlobalEventsStreaming(io);
  }

  private async handleLogSubscription(socket: Socket, containerId: string, tail: number) {
    try {
      // Clear existing log stream for this container if any
      this.clearSocketStream(socket.id, 'logs', containerId);

      const container = docker.getContainer(containerId);
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });

      // Register stream
      this.activeStreams.get(socket.id)?.push({
        type: 'logs',
        targetId: containerId,
        stream,
      });

      stream.on('data', (chunk: Buffer) => {
        const parsed = parseDockerLogs(chunk);
        socket.emit(`container-logs:${containerId}`, parsed);
      });

      stream.on('end', () => {
        socket.emit(`container-logs-end:${containerId}`);
        this.clearSocketStream(socket.id, 'logs', containerId);
      });

      stream.on('error', (err: any) => {
        socket.emit(`container-logs-error:${containerId}`, { error: err.message });
        this.clearSocketStream(socket.id, 'logs', containerId);
      });

    } catch (error: any) {
      socket.emit(`container-logs-error:${containerId}`, { error: error.message });
    }
  }

  private async handleStatsSubscription(socket: Socket, containerId: string) {
    try {
      this.clearSocketStream(socket.id, 'stats', containerId);

      const container = docker.getContainer(containerId);
      const stream = await container.stats({ stream: true });

      this.activeStreams.get(socket.id)?.push({
        type: 'stats',
        targetId: containerId,
        stream,
      });

      stream.on('data', (chunk: Buffer) => {
        try {
          const rawStats = JSON.parse(chunk.toString('utf8'));
          const formattedStats = this.formatStats(rawStats);
          socket.emit(`container-stats:${containerId}`, formattedStats);
        } catch (e) {
          // Sometimes partial JSON is received, skip
        }
      });

      stream.on('end', () => {
        socket.emit(`container-stats-end:${containerId}`);
        this.clearSocketStream(socket.id, 'stats', containerId);
      });

      stream.on('error', (err: any) => {
        socket.emit(`container-stats-error:${containerId}`, { error: err.message });
        this.clearSocketStream(socket.id, 'stats', containerId);
      });

    } catch (error: any) {
      socket.emit(`container-stats-error:${containerId}`, { error: error.message });
    }
  }

  private async handleTerminalSubscription(socket: Socket, containerId: string, shell: string) {
    try {
      this.clearSocketStream(socket.id, 'terminal', containerId);

      const container = docker.getContainer(containerId);
      
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: [shell],
      });

      const stream = await exec.start({ stdin: true, hijack: true });

      this.activeStreams.get(socket.id)?.push({
        type: 'terminal',
        targetId: containerId,
        stream,
      });

      stream.on('data', (chunk: Buffer) => {
        socket.emit(`terminal-output:${containerId}`, chunk.toString('utf8'));
      });

      stream.on('end', () => {
        socket.emit(`terminal-end:${containerId}`);
        this.clearSocketStream(socket.id, 'terminal', containerId);
      });

      stream.on('error', (err: any) => {
        socket.emit(`terminal-error:${containerId}`, { error: err.message });
        this.clearSocketStream(socket.id, 'terminal', containerId);
      });

    } catch (error: any) {
      // Fallback from bash to sh
      if (shell === '/bin/bash') {
        console.log(`[Socket Stream Service] /bin/bash execution failed for ${containerId}, falling back to /bin/sh`);
        await this.handleTerminalSubscription(socket, containerId, '/bin/sh');
      } else {
        socket.emit(`terminal-error:${containerId}`, { error: error.message });
      }
    }
  }

  private startGlobalEventsStreaming(io: SocketServer) {
    if (SocketStreamService.eventsStream) return;

    docker.getEvents((err, stream) => {
      if (err) {
        console.error('[Socket Stream Service] Failed to start Docker events stream:', err);
        return;
      }

      console.log('[Socket Stream Service] Started global Docker events stream');
      SocketStreamService.eventsStream = stream;

      stream?.on('data', (chunk: Buffer) => {
        try {
          const rawString = chunk.toString('utf8');
          const lines = rawString.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              console.log('[Socket Stream Service] Docker Event JSON:', JSON.stringify(event));
              io.emit('docker-event', {
                action: event.Action || event.action || event.status || 'unknown',
                type: event.Type || event.type || 'container',
                actor: {
                  id: event.Actor?.ID || event.id || '',
                  name: event.Actor?.Attributes?.name || event.Actor?.Attributes?.image || event.from || '',
                  attributes: event.Actor?.Attributes || {},
                },
                time: event.time || Math.floor(Date.now() / 1000),
                timeNano: event.timeNano || 0,
              });
            } catch (innerErr) {
              console.error('[Socket Stream Service] Error parsing event line:', innerErr, 'Line was:', line);
            }
          }
        } catch (e) {
          console.error('[Socket Stream Service] Error parsing Docker event chunk:', e);
        }
      });

      stream?.on('end', () => {
        SocketStreamService.eventsStream = null;
        // Auto restart after a delay
        setTimeout(() => this.startGlobalEventsStreaming(io), 5000);
      });
    });
  }

  private formatStats(raw: any) {
    // RAM calculation
    const usage = raw.memory_stats?.usage || 0;
    const limit = raw.memory_stats?.limit || 0;
    const inactiveFile = raw.memory_stats?.stats?.inactive_file || 0;
    const workingSet = Math.max(0, usage - inactiveFile);
    const memoryPercentage = limit > 0 ? (workingSet / limit) * 100 : 0;

    // CPU calculation (multiplexed formula)
    let cpuPercentage = 0;
    const cpuDelta = (raw.cpu_stats?.cpu_usage?.total_usage || 0) - (raw.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = (raw.cpu_stats?.system_cpu_usage || 0) - (raw.precpu_stats?.system_cpu_usage || 0);
    const numCpus = raw.cpu_stats?.online_cpus || raw.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;

    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercentage = (cpuDelta / systemDelta) * numCpus * 100;
    }

    // Network IO
    let rxBytes = 0;
    let txBytes = 0;
    if (raw.networks) {
      for (const net of Object.values<any>(raw.networks)) {
        rxBytes += net.rx_bytes || 0;
        txBytes += net.tx_bytes || 0;
      }
    }

    // Disk IO (blkio_stats)
    let readBytes = 0;
    let writeBytes = 0;
    const ioServiceBytes = raw.blkio_stats?.io_service_bytes_recursive;
    if (Array.isArray(ioServiceBytes)) {
      for (const entry of ioServiceBytes) {
        if (entry.op === 'Read') readBytes += entry.value;
        if (entry.op === 'Write') writeBytes += entry.value;
      }
    }

    return {
      cpuPercent: parseFloat(cpuPercentage.toFixed(2)),
      memoryUsage: workingSet,
      memoryLimit: limit,
      memoryPercent: parseFloat(memoryPercentage.toFixed(2)),
      networkRx: rxBytes,
      networkTx: txBytes,
      diskRead: readBytes,
      diskWrite: writeBytes,
      timestamp: new Date().toISOString(),
    };
  }

  private async handleStackLogSubscription(socket: Socket, name: string) {
    try {
      this.clearSocketStream(socket.id, 'stack-logs' as any, name);

      // Require stack directory check
      const STACKS_DIR = process.env.STACKS_DIR || path.join(__dirname, '../../data/stacks');
      const stackDir = path.resolve(STACKS_DIR, name);
      
      if (!/^[a-z0-9-_]+$/i.test(name) || !stackDir.startsWith(path.resolve(STACKS_DIR))) {
        socket.emit(`stack-logs-error:${name}`, { error: 'Invalid stack name or path traversal detected.' });
        return;
      }

      if (!fs.existsSync(path.join(stackDir, 'docker-compose.yml'))) {
        socket.emit(`stack-logs-error:${name}`, { error: 'docker-compose.yml configuration not found' });
        return;
      }

      // Spawn docker compose logs -f
      const child = spawn('docker', ['compose', 'logs', '-f', '--tail=100'], {
        cwd: stackDir,
        shell: process.platform === 'win32'
      });

      this.activeStreams.get(socket.id)?.push({
        type: 'stack-logs' as any,
        targetId: name,
        stream: child
      });

      child.stdout.on('data', (data) => {
        socket.emit(`stack-logs:${name}`, data.toString());
      });

      child.stderr.on('data', (data) => {
        socket.emit(`stack-logs:${name}`, data.toString());
      });

      child.on('close', () => {
        socket.emit(`stack-logs-end:${name}`);
        this.clearSocketStream(socket.id, 'stack-logs' as any, name);
      });

    } catch (error: any) {
      socket.emit(`stack-logs-error:${name}`, { error: error.message });
    }
  }


  private clearSocketStream(socketId: string, type: 'logs' | 'stats' | 'terminal' | 'stack-logs', targetId: string) {
    const list = this.activeStreams.get(socketId) || [];
    const index = list.findIndex(s => s.type === type && s.targetId === targetId);

    if (index !== -1) {
      const { stream } = list[index];
      try {
        if (stream.kill) stream.kill();
        else if (stream.destroy) stream.destroy();
        else if (stream.end) stream.end();
      } catch (err) {
        // stream already closed
      }
      list.splice(index, 1);
    }
  }

  private clearAllSocketStreams(socketId: string) {
    const list = this.activeStreams.get(socketId) || [];
    for (const item of list) {
      try {
        if (item.stream.kill) item.stream.kill();
        else if (item.stream.destroy) item.stream.destroy();
        else if (item.stream.end) item.stream.end();
      } catch (err) {
        // stream already closed
      }
    }
    this.activeStreams.set(socketId, []);
  }

}

export const socketStreamService = new SocketStreamService();
export default socketStreamService;
