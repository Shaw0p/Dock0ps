import os from 'os';

interface CPUStats {
  idle: number;
  total: number;
}

function getCPUInfo(): CPUStats {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;

  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }

  const total = user + nice + sys + idle + irq;
  return { idle, total };
}

let startMeasure = getCPUInfo();

// Call this periodically to get CPU load percentage since the last check
export const getCPUUsage = (): number => {
  const endMeasure = getCPUInfo();
  const idleDifference = endMeasure.idle - startMeasure.idle;
  const totalDifference = endMeasure.total - startMeasure.total;

  let percentage = 0;
  if (totalDifference > 0) {
    percentage = 100 - Math.floor((100 * idleDifference) / totalDifference);
  }

  startMeasure = endMeasure;
  return Math.min(100, Math.max(0, percentage));
};

export const getMemoryUsage = () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usagePercentage = Math.round((usedMem / totalMem) * 100);

  return {
    total: totalMem,
    used: usedMem,
    free: freeMem,
    percentage: usagePercentage,
  };
};
