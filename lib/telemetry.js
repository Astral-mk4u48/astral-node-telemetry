const os = require('os');

function getCpuSnapshot() {
  const cpus = os.cpus() || [];
  const cores = cpus.map((cpu, index) => {
    let total = 0;
    const times = cpu.times || { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    for (const key of Object.keys(times)) {
      total += times[key];
    }
    return {
      coreIndex: index,
      model: cpu.model || 'Generic CPU',
      speedMHz: cpu.speed || 0,
      idle: times.idle || 0,
      total
    };
  });

  const totalIdle = cores.reduce((sum, c) => sum + c.idle, 0);
  const totalAll = cores.reduce((sum, c) => sum + c.total, 0);
  return { totalIdle, totalAll, cores };
}

let lastSnapshot = getCpuSnapshot();

function calculateCpuUsage(prev, curr) {
  const idleDiff = curr.totalIdle - prev.totalIdle;
  const totalDiff = curr.totalAll - prev.totalAll;
  const totalUsage = totalDiff > 0
    ? Math.max(0, Math.min(100, ((totalDiff - idleDiff) / totalDiff) * 100))
    : 0;

  const perCore = curr.cores.map((core, i) => {
    const prevCore = prev.cores[i] || { idle: 0, total: 0 };
    const cIdleDiff = core.idle - prevCore.idle;
    const cTotalDiff = core.total - prevCore.total;
    const usage = cTotalDiff > 0
      ? Math.max(0, Math.min(100, ((cTotalDiff - cIdleDiff) / cTotalDiff) * 100))
      : 0;
    return {
      coreIndex: i,
      model: core.model,
      speedMHz: core.speedMHz,
      usagePercent: Number(usage.toFixed(1))
    };
  });

  return {
    usagePercent: Number(totalUsage.toFixed(1)),
    cores: perCore
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function getTelemetrySnapshot() {
  const nextSnapshot = getCpuSnapshot();
  const cpuData = calculateCpuUsage(lastSnapshot, nextSnapshot);
  lastSnapshot = nextSnapshot;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;
  const memProc = process.memoryUsage();

  return {
    timestamp: new Date().toISOString(),
    epoch: Date.now(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      type: os.type()
    },
    cpu: {
      usagePercent: cpuData.usagePercent,
      cores: cpuData.cores,
      coreCount: cpuData.cores.length,
      model: cpuData.cores[0]?.model || 'Intel / AMD Processor',
      loadAvg: os.loadavg().map(v => Number(v.toFixed(2)))
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      totalGB: Number((totalMem / (1024 ** 3)).toFixed(2)),
      freeGB: Number((freeMem / (1024 ** 3)).toFixed(2)),
      usedGB: Number((usedMem / (1024 ** 3)).toFixed(2)),
      usagePercent: Number(memUsagePercent.toFixed(1))
    },
    uptime: {
      systemSeconds: Math.floor(os.uptime()),
      systemFormatted: formatUptime(os.uptime()),
      processSeconds: Math.floor(process.uptime()),
      processFormatted: formatUptime(process.uptime())
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      rssMB: Number((memProc.rss / (1024 ** 2)).toFixed(1)),
      heapTotalMB: Number((memProc.heapTotal / (1024 ** 2)).toFixed(1)),
      heapUsedMB: Number((memProc.heapUsed / (1024 ** 2)).toFixed(1))
    }
  };
}

module.exports = {
  getTelemetrySnapshot,
  formatUptime
};
