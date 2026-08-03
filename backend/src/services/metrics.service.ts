import { getIO } from '../config/socket';
import { getCPUUsage, getMemoryUsage } from '../utils/system';

let metricsIntervalId: NodeJS.Timeout | null = null;

export const startMetricsBroadcasting = (intervalMs: number = 2000) => {
  if (metricsIntervalId) return;

  console.log(`[Metrics Service] Starting host metrics broadcasting every ${intervalMs}ms`);

  metricsIntervalId = setInterval(() => {
    try {
      const io = getIO();
      const cpu = getCPUUsage();
      const mem = getMemoryUsage();

      io.emit('system-metrics', {
        cpu,
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          percentage: mem.percentage,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Quietly fail if socket is not initialized
    }
  }, intervalMs);
};

export const stopMetricsBroadcasting = () => {
  if (metricsIntervalId) {
    clearInterval(metricsIntervalId);
    metricsIntervalId = null;
    console.log('[Metrics Service] Stopped host metrics broadcasting');
  }
};
