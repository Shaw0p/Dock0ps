import docker from '../config/docker';
import prisma from '../config/database';
import { AlertingService } from './alerting.service';

export class MetricsCollectorService {
  private intervalId: NodeJS.Timeout | null = null;
  private isCollecting = false;
  private alertingService = new AlertingService();

  start() {
    if (this.intervalId) return;

    // Run every 30 seconds
    this.intervalId = setInterval(() => this.collect(), 30000);
    
    // Perform initial run in the background
    this.collect().catch((err) =>
      console.error('[Metrics Collector] Failed initial statistics collection:', err.message)
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async collect() {
    if (this.isCollecting) return;
    this.isCollecting = true;

    try {
      const runningContainers = await docker.listContainers();

      const metricsPromises = runningContainers.map(async (containerInfo) => {
        try {
          const container = docker.getContainer(containerInfo.Id);
          const stats = await container.stats({ stream: false });

          // Calculate CPU usage %
          let cpuPercent = 0;
          if (stats.cpu_stats && stats.precpu_stats) {
            const cpuDelta =
              (stats.cpu_stats.cpu_usage?.total_usage || 0) -
              (stats.precpu_stats.cpu_usage?.total_usage || 0);
            const systemDelta =
              (stats.cpu_stats.system_cpu_usage || 0) -
              (stats.precpu_stats.system_cpu_usage || 0);
            if (systemDelta > 0 && cpuDelta > 0) {
              const onlineCPUs =
                stats.cpu_stats.online_cpus ||
                stats.cpu_stats.cpu_usage?.percpu_usage?.length ||
                1;
              cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100;
            }
          }

          // Calculate Memory Usage %
          const memoryUsage = stats.memory_stats?.usage || 0;
          const memoryLimit = stats.memory_stats?.limit || 1;
          const memoryPercent = (memoryUsage / memoryLimit) * 100;

          // Network Rx/Tx (bytes to MB)
          let networkRx = 0;
          let networkTx = 0;
          if (stats.networks) {
            for (const key of Object.keys(stats.networks)) {
              networkRx += stats.networks[key].rx_bytes || 0;
              networkTx += stats.networks[key].tx_bytes || 0;
            }
          }

          // Blkio Disk Read/Write (bytes to MB)
          let diskRead = 0;
          let diskWrite = 0;
          if (stats.blkio_stats && stats.blkio_stats.io_service_bytes_recursive) {
            for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
              if (entry.op === 'Read') diskRead += entry.value || 0;
              if (entry.op === 'Write') diskWrite += entry.value || 0;
            }
          }

          // Save metric record
          await prisma.containerMetric.create({
            data: {
              containerId: containerInfo.Id,
              cpu: Math.min(Math.max(cpuPercent, 0), 100), // clamp 0-100
              memory: Math.min(Math.max(memoryPercent, 0), 100), // clamp 0-100
              networkRx: networkRx / 1024 / 1024, // MB
              networkTx: networkTx / 1024 / 1024, // MB
              diskRead: diskRead / 1024 / 1024, // MB
              diskWrite: diskWrite / 1024 / 1024, // MB
            },
          });
        } catch (err: any) {
          // Suppress single-container stat parsing failures
        }
      });

      await Promise.all(metricsPromises);

      // Prune stats older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      await prisma.containerMetric.deleteMany({
        where: {
          timestamp: {
            lt: sevenDaysAgo,
          },
        },
      });

      // Run alerting rules evaluation
      await this.alertingService.checkAlerts();
    } catch (err: any) {
      console.error('[Metrics Collector] Poll iteration failed:', err.message);
    } finally {
      this.isCollecting = false;
    }
  }
}
export default MetricsCollectorService;
