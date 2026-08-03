import docker from '../config/docker';
import prisma from '../config/database';

export class DockerService {
  async getSystemSummary() {
    const [containers, allContainers, images, volumesData, networks, version, info, stacksCount] = await Promise.all([
      docker.listContainers(),
      docker.listContainers({ all: true }),
      docker.listImages(),
      docker.listVolumes(),
      docker.listNetworks(),
      docker.version(),
      docker.info(),
      prisma.stack.count(),
    ]);

    const runningContainersCount = containers.length;
    const stoppedContainersCount = allContainers.length - runningContainersCount;
    const imagesCount = images.length;
    const volumesCount = (volumesData.Volumes || []).length;
    const networksCount = networks.length;

    return {
      dockerVersion: version.Version,
      apiVersion: version.ApiVersion,
      osType: info.OSType,
      architecture: info.Architecture,
      ncpu: info.NCPU,
      memTotal: info.MemTotal,
      kernelVersion: info.KernelVersion,
      operatingSystem: info.OperatingSystem,
      counts: {
        containers: allContainers.length,
        runningContainers: runningContainersCount,
        stoppedContainers: stoppedContainersCount,
        images: imagesCount,
        volumes: volumesCount,
        networks: networksCount,
        stacks: stacksCount,
      },
    };
  }
}
export default DockerService;
