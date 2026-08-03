import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import prisma from '../config/database';
import docker from '../config/docker';

const STACKS_DIR = process.env.STACKS_DIR || path.join(__dirname, '../../data/stacks');

// Initialize stacks directory and .gitignore
if (!fs.existsSync(STACKS_DIR)) {
  fs.mkdirSync(STACKS_DIR, { recursive: true });
}
const gitignorePath = path.join(STACKS_DIR, '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  fs.writeFileSync(gitignorePath, '*\n', 'utf8');
}

export class ComposeService {
  /**
   * Helper to strictly validate stack/project names and retrieve directory path
   */
  getStackDir(stackName: string): string {
    if (!/^[a-z0-9-_]+$/i.test(stackName)) {
      throw new Error('Invalid stack name. Only alphanumeric characters, dashes, and underscores are allowed.');
    }
    const resolvedPath = path.resolve(STACKS_DIR, stackName);
    
    // Path traversal check
    if (!resolvedPath.startsWith(path.resolve(STACKS_DIR))) {
      throw new Error('Invalid stack directory path. Directory traversal attempt detected.');
    }
    return resolvedPath;
  }

  /**
   * Validates Compose YAML content using `docker compose config`
   */
  async validateComposeYAML(stackName: string, yamlContent: string): Promise<{ valid: boolean; error?: string }> {
    const stackDir = this.getStackDir(stackName);
    const tempDir = path.join(stackDir, '_temp_validation');
    
    if (!fs.existsSync(stackDir)) {
      fs.mkdirSync(stackDir, { recursive: true });
    }
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, 'docker-compose.yml');
    fs.writeFileSync(tempFilePath, yamlContent, 'utf8');

    return new Promise((resolve) => {
      // Use explicit arguments array
      const child = spawn('docker', ['compose', '-f', tempFilePath, 'config'], {
        cwd: tempDir,
        shell: process.platform === 'win32'
      });

      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        // Cleanup temp validation folder
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
        } catch (err) {
          // ignore cleanup errors
        }

        if (code === 0) {
          resolve({ valid: true });
        } else {
          resolve({ valid: false, error: stderr.trim() || 'Invalid docker-compose configuration' });
        }
      });
    });
  }

  /**
   * Create or update a stack configuration on disk and in database
   */
  async saveStack(name: string, yamlContent: string) {
    const stackDir = this.getStackDir(name);
    
    // 1. Run YAML check
    const validation = await this.validateComposeYAML(name, yamlContent);
    if (!validation.valid) {
      throw new Error(`YAML Validation failed: ${validation.error}`);
    }

    // 2. Save on disk
    if (!fs.existsSync(stackDir)) {
      fs.mkdirSync(stackDir, { recursive: true });
    }
    fs.writeFileSync(path.join(stackDir, 'docker-compose.yml'), yamlContent, 'utf8');

    // 3. Upsert DB entry
    return prisma.stack.upsert({
      where: { name },
      update: { yamlContent },
      create: { name, yamlContent, status: 'STOPPED' },
    });
  }

  /**
   * Spawns docker compose commands in the stack's CWD
   */
  async executeComposeCommand(
    name: string, 
    args: string[], 
    onData: (data: string) => void, 
    onError: (data: string) => void
  ): Promise<number> {
    const stackDir = this.getStackDir(name);
    if (!fs.existsSync(path.join(stackDir, 'docker-compose.yml'))) {
      throw new Error('docker-compose.yml configuration file not found.');
    }

    return new Promise((resolve, reject) => {
      const child = spawn('docker', ['compose', ...args], {
        cwd: stackDir,
        shell: process.platform === 'win32'
      });

      child.stdout.on('data', (data) => {
        onData(data.toString());
      });

      child.stderr.on('data', (data) => {
        onError(data.toString());
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        resolve(code || 0);
      });
    });
  }

  /**
   * Run deployment pipeline (docker compose up -d)
   */
  async deploy(name: string, emitLog?: (msg: string) => void) {
    const emit = emitLog || console.log;
    emit(`[Compose Engine] Initiating deployment for stack "${name}"...\n`);
    
    await prisma.stack.update({
      where: { name },
      data: { status: 'DEPLOYING' }
    });

    try {
      const code = await this.executeComposeCommand(
        name,
        ['up', '-d', '--remove-orphans'],
        (data) => emit(data),
        (data) => emit(data)
      );

      if (code === 0) {
        emit(`\n[Compose Engine] Stack "${name}" deployed successfully!\n`);
        await prisma.stack.update({
          where: { name },
          data: { status: 'RUNNING' }
        });
        return { success: true };
      } else {
        throw new Error(`Docker Compose exited with code ${code}`);
      }
    } catch (err: any) {
      emit(`\n[Compose Engine] [ERROR] Deployment failed: ${err.message}\n`);
      await prisma.stack.update({
        where: { name },
        data: { status: 'FAILED' }
      });
      throw err;
    }
  }

  /**
   * Stop Stack (docker compose down)
   */
  async stop(name: string, emitLog?: (msg: string) => void) {
    const emit = emitLog || console.log;
    emit(`[Compose Engine] Stopping stack "${name}"...\n`);

    try {
      const code = await this.executeComposeCommand(
        name,
        ['down'],
        (data) => emit(data),
        (data) => emit(data)
      );

      if (code === 0) {
        emit(`\n[Compose Engine] Stack "${name}" stopped.\n`);
        await prisma.stack.update({
          where: { name },
          data: { status: 'STOPPED' }
        });
        return { success: true };
      } else {
        throw new Error(`Docker Compose down failed with code ${code}`);
      }
    } catch (err: any) {
      emit(`\n[Compose Engine] [ERROR] Stop failed: ${err.message}\n`);
      throw err;
    }
  }

  /**
   * Restart Stack (docker compose restart)
   */
  async restart(name: string, emitLog?: (msg: string) => void) {
    const emit = emitLog || console.log;
    emit(`[Compose Engine] Restarting services for stack "${name}"...\n`);

    try {
      const code = await this.executeComposeCommand(
        name,
        ['restart'],
        (data) => emit(data),
        (data) => emit(data)
      );

      if (code === 0) {
        emit(`\n[Compose Engine] Stack "${name}" restarted.\n`);
        await prisma.stack.update({
          where: { name },
          data: { status: 'RUNNING' }
        });
        return { success: true };
      } else {
        throw new Error(`Docker Compose restart failed with code ${code}`);
      }
    } catch (err: any) {
      emit(`\n[Compose Engine] [ERROR] Restart failed: ${err.message}\n`);
      throw err;
    }
  }

  /**
   * Rebuild Stack (docker compose up -d --build)
   */
  async rebuild(name: string, emitLog?: (msg: string) => void) {
    const emit = emitLog || console.log;
    emit(`[Compose Engine] Rebuilding services for stack "${name}"...\n`);

    try {
      const code = await this.executeComposeCommand(
        name,
        ['up', '-d', '--build'],
        (data) => emit(data),
        (data) => emit(data)
      );

      if (code === 0) {
        emit(`\n[Compose Engine] Stack "${name}" rebuilt and running.\n`);
        await prisma.stack.update({
          where: { name },
          data: { status: 'RUNNING' }
        });
        return { success: true };
      } else {
        throw new Error(`Docker Compose rebuild failed with code ${code}`);
      }
    } catch (err: any) {
      emit(`\n[Compose Engine] [ERROR] Rebuild failed: ${err.message}\n`);
      throw err;
    }
  }

  /**
   * Pull Stack Images (docker compose pull)
   */
  async pull(name: string, emitLog?: (msg: string) => void) {
    const emit = emitLog || console.log;
    emit(`[Compose Engine] Pulling latest images for stack "${name}"...\n`);

    try {
      const code = await this.executeComposeCommand(
        name,
        ['pull'],
        (data) => emit(data),
        (data) => emit(data)
      );

      if (code === 0) {
        emit(`\n[Compose Engine] Images pulled successfully.\n`);
        return { success: true };
      } else {
        throw new Error(`Docker Compose pull failed with code ${code}`);
      }
    } catch (err: any) {
      emit(`\n[Compose Engine] [ERROR] Pull failed: ${err.message}\n`);
      throw err;
    }
  }

  /**
   * Delete Stack (removes database record and files, downing containers)
   */
  async deleteStack(name: string, removeVolumes: boolean = false) {
    const stackDir = this.getStackDir(name);

    try {
      // Down containers first
      if (fs.existsSync(path.join(stackDir, 'docker-compose.yml'))) {
        const downArgs = removeVolumes ? ['down', '-v'] : ['down'];
        await this.executeComposeCommand(name, downArgs, () => {}, () => {});
      }
    } catch (err) {
      console.warn(`[Compose Service] Warning during compose down for deletion:`, err);
    }

    // Delete folder from CWD
    try {
      if (fs.existsSync(stackDir)) {
        fs.rmSync(stackDir, { recursive: true, force: true });
      }
    } catch (err: any) {
      console.error(`[Compose Service] Failed to remove folder from disk:`, err);
    }

    // Remove from Prisma DB
    return prisma.stack.delete({
      where: { name },
    });
  }

  /**
   * List all stacks from DB
   */
  async listStacks() {
    return prisma.stack.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get stack details, including list of containers matching compose project label
   */
  async getStackDetails(name: string) {
    const dbStack = await prisma.stack.findUnique({
      where: { name }
    });

    if (!dbStack) {
      throw new Error('Stack not found in database');
    }

    // Retrieve active containers with compose project labels
    let composeContainers: any[] = [];
    try {
      const allContainers = await docker.listContainers({ all: true });
      composeContainers = allContainers
        .filter((c) => c.Labels && c.Labels['com.docker.compose.project'] === name)
        .map((c) => ({
          id: c.Id,
          name: c.Names[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
          service: c.Labels['com.docker.compose.service'] || 'unknown',
          state: c.State,
          status: c.Status,
          ports: c.Ports,
        }));
    } catch (error: any) {
      console.error('[Compose Service] Failed to list containers from daemon:', error.message);
    }

    return {
      ...dbStack,
      containers: composeContainers,
    };
  }
}
export default ComposeService;
