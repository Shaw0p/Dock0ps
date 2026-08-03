import Docker from 'dockerode';
import os from 'os';

const socketPath = process.env.DOCKER_SOCKET_PATH || 
  (os.platform() === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock');

console.log(`[Docker Service] Connecting to Docker Daemon using socket path: ${socketPath}`);

export const docker = new Docker({ socketPath });

export default docker;
