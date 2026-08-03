import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal as XTerm } from 'xterm';
import 'xterm/css/xterm.css';
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Copy,
  Terminal,
  Activity,
  Search,
  Download,
  Pause,
  ArrowLeft
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export const ContainerDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socket = useSocket();

  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'stats' | 'terminal' | 'env' | 'volumes' | 'networks' | 'processes' | 'inspect'>('overview');
  
  // CLI Command display state
  const [activeCliCommand, setActiveCliCommand] = useState(`docker inspect ${id?.slice(0, 12)}`);

  // Logs States
  const [logLogs, setLogLogs] = useState<string[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [isLogsPaused, setIsLogsPaused] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Stats States
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [latestStats, setLatestStats] = useState<any>(null);

  // Terminal States
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<XTerm | null>(null);

  // Processes State
  const [processesList, setProcessesList] = useState<{ titles: string[]; rows: string[][] }>({ titles: [], rows: [] });

  // Fetch Container details
  const { data: container } = useQuery({
    queryKey: ['containerInspect', id],
    queryFn: async () => {
      const res = await api.get(`/containers/${id}`);
      return res;
    },
    refetchInterval: 5000,
  });

  // Fetch historical metrics from database
  const { data: dbMetricsHistory = [] } = useQuery<any[]>({
    queryKey: ['containerMetricsHistory', id],
    queryFn: () => api.get(`/containers/${id}/metrics/history`),
    enabled: activeTab === 'stats',
    refetchInterval: activeTab === 'stats' ? 30000 : false,
  });

  const isRunning = container?.State?.Running;

  // Actions mutation
  const actionMutation = useMutation({
    mutationFn: async ({ action }: { action: 'start' | 'stop' | 'restart' | 'delete' | 'duplicate' }) => {
      if (action === 'delete') {
        await api.delete(`/containers/${id}?force=true`);
        return { action };
      }
      if (action === 'duplicate') {
        const res = await api.post(`/containers/duplicate/${id}`);
        return { action, duplicateId: res.duplicateId };
      }
      const res = await api.patch(`/containers/${action}/${id}`);
      return res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['containerInspect', id] });
      queryClient.invalidateQueries({ queryKey: ['containersList'] });
      if (data.action === 'delete') {
        navigate('/containers');
      } else if (data.action === 'duplicate' && data.duplicateId) {
        navigate(`/containers/${data.duplicateId}`);
      }
    },
  });

  // Fetch processes inside container (docker top)
  useEffect(() => {
    if (activeTab === 'processes' && isRunning) {
      api.get(`/containers/${id}/processes`)
        .then(res => {
          setProcessesList({
            titles: res.Titles || [],
            rows: res.Processes || []
          });
        })
        .catch(err => console.error('Failed to get processes', err));
    }
  }, [activeTab, id, isRunning]);

  // Logs WebSockets subscription
  useEffect(() => {
    if (!socket || activeTab !== 'logs') return;

    const handleLogChunk = (data: string) => {
      if (isLogsPaused) return;
      setLogLogs((prev) => [...prev, data].slice(-1000));
    };

    socket.emit('subscribe-logs', { containerId: id, tail: 200 });
    socket.on(`logs:${id}`, handleLogChunk);

    return () => {
      socket.emit('unsubscribe-logs', { containerId: id });
      socket.off(`logs:${id}`, handleLogChunk);
    };
  }, [socket, activeTab, id, isLogsPaused]);

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'logs' && !isLogsPaused) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logLogs, activeTab, isLogsPaused]);

  // Stats WebSockets subscription
  useEffect(() => {
    if (!socket || activeTab !== 'stats' || !isRunning) return;

    const handleStats = (data: any) => {
      setLatestStats(data);
      setMetricsHistory((prev) => {
        const next = [...prev, data];
        if (next.length > 20) next.shift();
        return next;
      });
    };

    socket.emit('subscribe-stats', { containerId: id });
    socket.on(`stats:${id}`, handleStats);

    return () => {
      socket.emit('unsubscribe-stats', { containerId: id });
      socket.off(`stats:${id}`, handleStats);
    };
  }, [socket, activeTab, id, isRunning]);

  // Terminal WebSockets mounting (xterm)
  useEffect(() => {
    if (activeTab !== 'terminal' || !termContainerRef.current || !socket || !isRunning) return;

    // Instantiate XTerm
    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#0B0D10',
        foreground: '#f4f4f5',
        cursor: '#0db7ed',
        black: '#121418',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#fafafa',
      },
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace',
      rows: 20,
      cols: 80,
    });

    termInstanceRef.current = term;
    term.open(termContainerRef.current);
    term.writeln('Connecting to container terminal execution socket...');

    // Subscribe to backend exec stream
    socket.emit('subscribe-terminal', { containerId: id, shell: '/bin/bash' });

    const handleTermOutput = (data: string) => {
      term.write(data);
    };

    socket.on(`terminal-output:${id}`, handleTermOutput);

    term.onData((data) => {
      socket.emit('terminal-input', { containerId: id, input: data });
    });

    return () => {
      socket.emit('unsubscribe-terminal', { containerId: id });
      socket.off(`terminal-output:${id}`, handleTermOutput);
      term.dispose();
      termInstanceRef.current = null;
    };
  }, [activeTab, id, socket, isRunning]);

  const handleDownloadLogs = () => {
    const text = logLogs.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `container-${id}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getCLICommand = (action: string) => {
    const shortId = id?.slice(0, 12);
    switch (action) {
      case 'start': return `docker start ${shortId}`;
      case 'stop': return `docker stop ${shortId}`;
      case 'restart': return `docker restart ${shortId}`;
      case 'delete': return `docker rm -f ${shortId}`;
      case 'duplicate': return `docker run -d --name ${container?.Name?.replace(/^\//, '')}-copy --network ${container?.HostConfig?.NetworkMode || 'bridge'} ${container?.Config?.Image}`;
      default: return `docker inspect ${shortId}`;
    }
  };

  const updateCommandDisplay = (action: string) => {
    setActiveCliCommand(getCLICommand(action));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto font-sans p-6 text-white">
      {/* Back link & Header */}
      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate('/containers')}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-xs font-bold transition-all cursor-pointer self-start"
        >
          <ArrowLeft size={13} /> Return to Services
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-[rgba(255,255,255,0.06)]">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-white tracking-tight">
                {container?.Name?.replace(/^\//, '') || 'Container Details'}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide flex items-center gap-1.5 ${
                isRunning ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`}></span>
                {container?.State?.Status || 'Stopped'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono select-all font-semibold">
              ID: {id}
            </p>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-2">
            {isRunning ? (
              <button
                onClick={() => { actionMutation.mutate({ action: 'stop' }); updateCommandDisplay('stop'); }}
                onMouseEnter={() => updateCommandDisplay('stop')}
                className="flex items-center gap-2 px-4 py-2 border border-red-500/20 bg-red-950/10 hover:bg-red-950/20 text-red-400 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Square size={12} /> Stop Node
              </button>
            ) : (
              <button
                onClick={() => { actionMutation.mutate({ action: 'start' }); updateCommandDisplay('start'); }}
                onMouseEnter={() => updateCommandDisplay('start')}
                className="flex items-center gap-2 px-4 py-2 border border-green-500/20 bg-green-950/10 hover:bg-green-950/20 text-green-400 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Play size={12} /> Start Node
              </button>
            )}

            <button
              onClick={() => { actionMutation.mutate({ action: 'restart' }); updateCommandDisplay('restart'); }}
              onMouseEnter={() => updateCommandDisplay('restart')}
              className="flex items-center gap-2 px-4 py-2 border border-white/[0.06] bg-[#121418] hover:bg-zinc-900 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <RotateCw size={12} /> Restart
            </button>

            <button
              onClick={() => { actionMutation.mutate({ action: 'duplicate' }); updateCommandDisplay('duplicate'); }}
              onMouseEnter={() => updateCommandDisplay('duplicate')}
              className="flex items-center gap-2 px-4 py-2 border border-white/[0.06] bg-[#121418] hover:bg-zinc-900 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Copy size={12} /> Duplicate
            </button>

            <button
              onClick={() => { actionMutation.mutate({ action: 'delete' }); updateCommandDisplay('delete'); }}
              onMouseEnter={() => updateCommandDisplay('delete')}
              className="flex items-center gap-2 px-4 py-2 border border-red-500/40 bg-red-950/30 hover:bg-red-950/50 text-red-300 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Docker CLI Command Transparency Display (Requirement) */}
      <div className="bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#0db7ed]" />
          <div>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-550 block">Orchestrator CLI Transparency</span>
            <span className="text-[10px] text-zinc-400 font-medium">Hover/click actions to expose corresponding Docker CLI commands</span>
          </div>
        </div>
        <div className="flex-1 max-w-xl">
          <pre className="text-[9px] font-mono text-zinc-300 bg-[#0B0D10] border border-white/[0.04] p-2.5 px-4 rounded-lg overflow-x-auto whitespace-pre no-scrollbar">
            {activeCliCommand}
          </pre>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 border-b border-[rgba(255,255,255,0.06)] overflow-x-auto no-scrollbar">
        {(['overview', 'logs', 'stats', 'terminal', 'env', 'volumes', 'networks', 'processes', 'inspect'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === tab
                ? 'border-[#0db7ed] text-[#0db7ed]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              <div className="md:col-span-2 space-y-6">
                <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Node Configuration</h3>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/[0.02]">
                      <span className="text-[9px] text-zinc-500 uppercase block">IMAGE</span>
                      <span className="text-zinc-200 block mt-1 break-all">{container?.Config?.Image}</span>
                    </div>
                    <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/[0.02]">
                      <span className="text-[9px] text-zinc-550 uppercase block">COMMAND</span>
                      <span className="text-zinc-200 block mt-1 break-all">{container?.Config?.Cmd?.join(' ') || '—'}</span>
                    </div>
                    <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/[0.02]">
                      <span className="text-[9px] text-zinc-550 uppercase block">ENTRYPOINT</span>
                      <span className="text-zinc-200 block mt-1 break-all">{container?.Config?.Entrypoint?.join(' ') || '—'}</span>
                    </div>
                    <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/[0.02]">
                      <span className="text-[9px] text-zinc-550 uppercase block">WORKING DIR</span>
                      <span className="text-zinc-200 block mt-1 break-all">{container?.Config?.WorkingDir || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Health logs */}
                <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Health Check Status</h3>
                  {container?.State?.Health ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-500">Status</span>
                        <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded ${
                          container.State.Health.Status === 'healthy' ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'
                        }`}>
                          {container.State.Health.Status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-500">Streak failures</span>
                        <span className="font-mono text-zinc-300">{container.State.Health.FailingStreak}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500 italic">No health checks defined in this container node.</p>
                  )}
                </div>
              </div>

              {/* Sidebar specs */}
              <div className="space-y-6">
                <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4 text-xs">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Node Infrastructure</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between pb-2 border-b border-white/[0.03]">
                      <span className="text-zinc-550">Created At</span>
                      <span className="font-mono text-zinc-300 text-[10px]">{new Date(container?.Created).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-white/[0.03]">
                      <span className="text-zinc-550">Restart Policy</span>
                      <span className="font-mono text-zinc-300 text-[10px]">{container?.HostConfig?.RestartPolicy?.Name || 'no'}</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-white/[0.03]">
                      <span className="text-zinc-550">RAM Limit</span>
                      <span className="font-mono text-zinc-300 text-[10px]">{container?.HostConfig?.Memory ? `${container.HostConfig.Memory / 1024 / 1024} MB` : 'Unlimited'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-550">CPU NanoCpus</span>
                      <span className="font-mono text-zinc-300 text-[10px]">{container?.HostConfig?.NanoCpus ? `${container.HostConfig.NanoCpus / 1e9} Cores` : 'Unlimited'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4 flex flex-col h-[550px]"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative flex-1 max-w-md w-full">
                  <Search size={13} className="absolute left-3 top-3 text-zinc-550" />
                  <input
                    type="text"
                    placeholder="Search logs pattern..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-200 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => setIsLogsPaused(!isLogsPaused)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.04] text-xs font-semibold cursor-pointer transition-colors ${
                      isLogsPaused ? 'bg-yellow-950/20 text-yellow-400 border-yellow-500/20' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <Pause size={12} /> {isLogsPaused ? 'Resume' : 'Pause'}
                  </button>

                  <button
                    onClick={handleDownloadLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/[0.04] text-xs font-semibold text-zinc-300 rounded-lg cursor-pointer"
                  >
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>

              {/* Logs terminal box */}
              <div className="flex-1 bg-[#0B0D10]/95 border border-[rgba(255,255,255,0.06)] rounded-xl p-4 overflow-y-auto font-mono text-[10px] space-y-1.5 shadow-inner no-scrollbar text-zinc-300">
                {logLogs
                  .filter((log) => log.toLowerCase().includes(logSearch.toLowerCase()))
                  .map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed">
                      {log}
                    </div>
                  ))}
                {logLogs.length === 0 && (
                  <div className="text-zinc-650 italic text-[11px]">Streaming Docker container logs...</div>
                )}
                <div ref={logEndRef} />
              </div>
            </motion.div>
          )}

          {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {!isRunning ? (
                <div className="h-64 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col items-center justify-center text-zinc-500 text-xs">
                  <Activity size={24} className="text-zinc-700 mb-2" />
                  <p className="font-semibold text-zinc-400">Container is not active.</p>
                  <p className="text-[10px] text-zinc-600 mt-1">Start the container to begin streaming performance telemetry.</p>
                </div>
              ) : metricsHistory.length === 0 ? (
                <div className="h-64 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex items-center justify-center text-xs font-mono text-zinc-650">
                  Subscribed. Awaiting telemetry stream...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* CPU & RAM Charts */}
                  <div className="lg:col-span-2 p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Container Performance Load</h3>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metricsHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="timestamp" stroke="#27272a" fontSize={8} tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
                          <YAxis stroke="#27272a" fontSize={8} domain={[0, 100]} />
                          <Tooltip contentStyle={{ backgroundColor: '#0B0D10', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '6px' }} itemStyle={{ fontSize: '10px', fontFamily: 'monospace', color: '#ffffff' }} />
                          <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: '9px' }} />
                          <Area type="monotone" dataKey="cpuPercent" name="CPU (%)" stroke="#3b82f6" strokeWidth={1.5} fill="rgba(59, 130, 246, 0.05)" />
                          <Area type="monotone" dataKey="memoryPercent" name="RAM (%)" stroke="#a855f7" strokeWidth={1.5} fill="rgba(168, 85, 247, 0.05)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                      {/* Readout stats */}
                      <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 mb-4">Runtime Metrics</h3>
                        <div className="grid grid-cols-2 gap-4 font-mono text-[10px] text-zinc-550 flex-1">
                          <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/[0.02]">
                            <span className="uppercase text-[8px] font-bold block">RAM Used</span>
                            <span className="text-zinc-250 font-bold block mt-1">{formatBytes(latestStats?.memoryUsage || 0)}</span>
                          </div>
                          <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/[0.02]">
                            <span className="uppercase text-[8px] font-bold block">Network RX</span>
                            <span className="text-zinc-250 font-bold block mt-1">{formatBytes(latestStats?.networkRx || 0)}</span>
                          </div>
                          <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/[0.02]">
                            <span className="uppercase text-[8px] font-bold block">Network TX</span>
                            <span className="text-zinc-250 font-bold block mt-1">{formatBytes(latestStats?.networkTx || 0)}</span>
                          </div>
                          <div className="p-3 bg-zinc-900/50 rounded-lg border border-white/[0.02]">
                            <span className="uppercase text-[8px] font-bold block">Disk reads</span>
                            <span className="text-zinc-250 font-bold block mt-1">{formatBytes(latestStats?.diskRead || 0)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Historical performance from database */}
                      <div className="lg:col-span-3 p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4">
                        <div>
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Historical Performance (Last 1 Hour)</h3>
                          <p className="text-[9px] text-zinc-550 mt-1 uppercase font-bold tracking-wider font-mono">Data polled at 30s intervals</p>
                        </div>
                        {dbMetricsHistory.length === 0 ? (
                          <div className="h-28 flex items-center justify-center text-[10px] text-zinc-650 font-mono italic">
                            No historical metrics logged in database yet.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">CPU & Memory History</h4>
                              <div className="h-44 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={dbMetricsHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                                    <XAxis dataKey="timestamp" stroke="#27272a" fontSize={8} tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                                    <YAxis stroke="#27272a" fontSize={8} domain={[0, 100]} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0B0D10', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '6px' }} itemStyle={{ fontSize: '10px', fontFamily: 'monospace', color: '#ffffff' }} />
                                    <Area type="monotone" dataKey="cpu" name="CPU (%)" stroke="#3b82f6" strokeWidth={1} fill="rgba(59, 130, 246, 0.01)" />
                                    <Area type="monotone" dataKey="memory" name="RAM (%)" stroke="#a855f7" strokeWidth={1} fill="rgba(168, 85, 247, 0.01)" />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Network & Disk I/O (MB)</h4>
                              <div className="h-44 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={dbMetricsHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                                    <XAxis dataKey="timestamp" stroke="#27272a" fontSize={8} tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                                    <YAxis stroke="#27272a" fontSize={8} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0B0D10', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '6px' }} itemStyle={{ fontSize: '10px', fontFamily: 'monospace', color: '#ffffff' }} />
                                    <Area type="monotone" dataKey="networkRx" name="Net Rx (MB)" stroke="#10b981" strokeWidth={1} fill="rgba(16, 185, 129, 0.01)" />
                                    <Area type="monotone" dataKey="diskRead" name="Disk Rd (MB)" stroke="#f59e0b" strokeWidth={1} fill="rgba(245, 158, 11, 0.01)" />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
          )}

          {activeTab === 'terminal' && (
            <motion.div
              key="terminal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col"
            >
              {!isRunning ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-500 text-xs">
                  <Terminal size={24} className="text-zinc-700 mb-2" />
                  <p className="font-semibold text-zinc-400">Terminal offline.</p>
                  <p className="text-[10px] text-zinc-650 mt-1">Start container to attach interactive TTY exec shells.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Interactive TTY Terminal (/bin/bash)</span>
                    <span className="text-[9px] text-zinc-600 font-mono">Press Ctrl+C to terminate processes</span>
                  </div>
                  <div className="p-4 bg-[#0B0D10] rounded-xl border border-[rgba(255,255,255,0.08)] shadow-inner">
                    <div ref={termContainerRef} className="overflow-hidden min-h-[300px]" />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'env' && (
            <motion.div
              key="env"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4"
            >
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Environment Variables</h3>
              <div className="space-y-2 font-mono text-xs">
                {container?.Config?.Env?.map((variable: string, i: number) => {
                  const [key, ...valParts] = variable.split('=');
                  const val = valParts.join('=');
                  return (
                    <div key={i} className="flex justify-between border-b border-white/[0.03] py-2">
                      <span className="text-zinc-400 font-bold">{key}</span>
                      <span className="text-zinc-200 select-all truncate max-w-md" title={val}>{val}</span>
                    </div>
                  );
                }) || <p className="text-[11px] text-zinc-550 italic">No environment configurations parsed.</p>}
              </div>
            </motion.div>
          )}

          {activeTab === 'volumes' && (
            <motion.div
              key="volumes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4"
            >
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Mounted Volumes & Bindings</h3>
              <div className="space-y-4 font-mono text-xs">
                {container?.Mounts?.map((mount: any, i: number) => (
                  <div key={i} className="p-4 bg-zinc-900/50 rounded-xl border border-white/[0.02] space-y-2">
                    <p className="flex justify-between">
                      <span className="text-zinc-500 font-medium uppercase text-[9px]">Type</span>
                      <span className="text-zinc-200 font-bold">{mount.Type}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-zinc-500 font-medium uppercase text-[9px]">Source</span>
                      <span className="text-zinc-200 break-all select-all font-bold text-right">{mount.Source}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-zinc-500 font-medium uppercase text-[9px]">Destination</span>
                      <span className="text-zinc-200 break-all select-all font-bold text-right">{mount.Destination}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-zinc-500 font-medium uppercase text-[9px]">Mode</span>
                      <span className="text-zinc-200 font-bold">{mount.Mode || 'rw'}</span>
                    </p>
                  </div>
                )) || <p className="text-[11px] text-zinc-550 italic">No mounts configured.</p>}
              </div>
            </motion.div>
          )}

          {activeTab === 'networks' && (
            <motion.div
              key="networks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4"
            >
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Network Interfaces</h3>
              <div className="space-y-4 font-mono text-xs">
                {Object.entries<any>(container?.NetworkSettings?.Networks || {}).map(([netName, net], i) => (
                  <div key={i} className="p-4 bg-zinc-900/50 rounded-xl border border-white/[0.02] space-y-2">
                    <p className="flex justify-between pb-1.5 border-b border-white/[0.03]">
                      <span className="text-zinc-550 uppercase text-[9px] font-bold">Network Name</span>
                      <span className="text-indigo-400 font-bold">{netName}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-zinc-550 uppercase text-[9px] font-bold">IP Address</span>
                      <span className="text-zinc-200 font-bold">{net.IPAddress || '—'}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-zinc-550 uppercase text-[9px] font-bold">Gateway</span>
                      <span className="text-zinc-200 font-bold">{net.Gateway || '—'}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-zinc-550 uppercase text-[9px] font-bold">Mac Address</span>
                      <span className="text-zinc-200 font-bold">{net.MacAddress || '—'}</span>
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'processes' && (
            <motion.div
              key="processes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4"
            >
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">Processes Running inside Node</h3>
              {!isRunning ? (
                <div className="text-[11px] text-zinc-500 italic">Container is offline. No active processes.</div>
              ) : (
                <div className="overflow-x-auto no-scrollbar font-mono text-[10px] text-zinc-300">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {processesList.titles.map((title, idx) => (
                          <th key={idx} className="py-2.5 font-bold uppercase text-zinc-550 tracking-wider pr-4">{title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processesList.rows.map((row, idx) => (
                        <tr key={idx} className="border-b border-white/[0.03] hover:bg-zinc-900/50">
                          {row.map((cell, cidx) => (
                            <td key={cidx} className="py-2 pr-4">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'inspect' && (
            <motion.div
              key="inspect"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col h-[500px]"
            >
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 mb-3">Raw Node Inspection Details</h3>
              <pre className="flex-1 bg-[#0B0D10]/95 border border-[rgba(255,255,255,0.06)] rounded-xl p-4 overflow-y-auto font-mono text-[9px] text-zinc-300 no-scrollbar select-all">
                {JSON.stringify(container, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
export default ContainerDetails;
