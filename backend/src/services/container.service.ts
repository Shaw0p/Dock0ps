import docker from '../config/docker';

export class ContainerService {
  async listContainers(all: boolean = true) {
    const containers = await docker.listContainers({ all });
    return containers.map(c => ({
      id: c.Id,
      names: c.Names,
      image: c.Image,
      state: c.State,      // e.g. "running", "exited"
      status: c.Status,    // e.g. "Up 2 hours", "Exited (0) 5 minutes ago"
      ports: c.Ports,
      created: c.Created,
    }));
  }

  async inspectContainer(id: string) {
    const container = docker.getContainer(id);
    const data = await container.inspect();
    console.log(`[Docker Service] Raw Container Inspect Data for ${id}:`, JSON.stringify(data, null, 2));
    return data;
  }

  async startContainer(id: string) {
    const container = docker.getContainer(id);
    const inspect = await container.inspect();
    if (inspect.State.Running) {
      console.log(`[Docker Service] Container ${id} is already running. Skipping start.`);
      return { id, action: 'start', status: 'success', message: 'Container is already running' };
    }
    await container.start();
    return { id, action: 'start', status: 'success' };
  }

  async stopContainer(id: string) {
    const container = docker.getContainer(id);
    await container.stop();
    return { id, action: 'stop', status: 'success' };
  }

  async restartContainer(id: string) {
    const container = docker.getContainer(id);
    await container.restart();
    return { id, action: 'restart', status: 'success' };
  }

  async deleteContainer(id: string, force: boolean = false) {
    const container = docker.getContainer(id);
    await container.remove({ force, v: true }); // delete volumes associated if needed
    return { id, action: 'delete', status: 'success' };
  }

  async renameContainer(id: string, newName: string) {
    const container = docker.getContainer(id);
    await container.rename({ name: newName });
    return { id, action: 'rename', name: newName, status: 'success' };
  }

  async duplicateContainer(id: string) {
    const container = docker.getContainer(id);
    const data = await container.inspect();

    // Prepare config for the duplicate
    const newName = `${data.Name.replace(/^\//, '')}-copy-${Date.now().toString().slice(-4)}`;
    
    const createConfig: any = {
      name: newName,
      Image: data.Config.Image,
      Cmd: data.Config.Cmd,
      Env: data.Config.Env,
      Entrypoint: data.Config.Entrypoint,
      WorkingDir: data.Config.WorkingDir,
      User: data.Config.User,
      Labels: data.Config.Labels,
      ExposedPorts: data.Config.ExposedPorts,
      HostConfig: {
        PortBindings: data.HostConfig.PortBindings,
        Binds: data.HostConfig.Binds,
        RestartPolicy: data.HostConfig.RestartPolicy,
        NetworkMode: data.HostConfig.NetworkMode,
        Memory: data.HostConfig.Memory,
        CpuPercent: data.HostConfig.CpuPercent,
      },
    };

    const duplicate = await docker.createContainer(createConfig);
    return {
      originalId: id,
      duplicateId: duplicate.id,
      name: newName,
      status: 'created',
    };
  }

  async createContainer(config: any) {
    const {
      name,
      image,
      hostname,
      labels = {},
      entrypoint,
      cmd,
      networkMode = 'bridge',
      portMappings = [],
      volumes = [],
      env = [],
      restartPolicy = 'no',
      memoryLimit,
      cpuLimit,
    } = config;

    // 1. Process Ports
    const exposedPorts: Record<string, any> = {};
    const portBindings: Record<string, any> = {};

    for (const mapping of portMappings) {
      const containerPortKey = `${mapping.containerPort}/${mapping.protocol || 'tcp'}`;
      exposedPorts[containerPortKey] = {};
      if (mapping.hostPort) {
        portBindings[containerPortKey] = [{ HostPort: String(mapping.hostPort) }];
      }
    }

    // 2. Process Volumes
    const binds: string[] = [];
    for (const vol of volumes) {
      const source = vol.type === 'bind' ? vol.hostPath : vol.volumeName;
      if (source && vol.containerPath) {
        const roSuffix = vol.readOnly ? ':ro' : '';
        binds.push(`${source}:${vol.containerPath}${roSuffix}`);
      }
    }

    // 3. Process Env
    const envStrings = env.map((item: any) => `${item.key}=${item.value}`);

    // 4. Build Configuration
    const createOpts: any = {
      name,
      Image: image,
      Hostname: hostname || undefined,
      Labels: Object.keys(labels).length > 0 ? labels : undefined,
      Entrypoint: entrypoint ? (typeof entrypoint === 'string' ? entrypoint.split(' ') : entrypoint) : undefined,
      Cmd: cmd ? (typeof cmd === 'string' ? cmd.split(' ') : cmd) : undefined,
      Env: envStrings.length > 0 ? envStrings : undefined,
      ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
      HostConfig: {
        PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
        Binds: binds.length > 0 ? binds : undefined,
        NetworkMode: networkMode,
        RestartPolicy: {
          Name: restartPolicy === 'never' ? '' : restartPolicy,
        },
        Memory: memoryLimit ? Number(memoryLimit) * 1024 * 1024 : undefined,
        NanoCpus: cpuLimit ? Number(cpuLimit) * 1e9 : undefined,
      },
    };

    const container = await docker.createContainer(createOpts);
    await container.start();
    return {
      id: container.id,
      name,
      status: 'running',
    };
  }

  async getProcesses(id: string) {
    const container = docker.getContainer(id);
    return container.top();
  }

  async getHealth(id: string) {
    const container = docker.getContainer(id);
    const inspect = await container.inspect();
    return inspect.State.Health || { Status: 'none', Log: [] };
  }
}
export default ContainerService;
