const os = require('os');
const fs = require('fs');
const path = require('path');

// Load .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  } else {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('❌ Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in environment.');
  process.exit(1);
}

let prevCpus = os.cpus();

function calculateCpuDelta(prev, curr) {
  let totalIdle = 0;
  let totalTick = 0;

  const cores = curr.map((core, i) => {
    const prevCore = prev[i] || core;
    let prevCoreTotal = 0;
    let currCoreTotal = 0;

    for (const k of Object.keys(core.times)) {
      currCoreTotal += core.times[k];
      prevCoreTotal += prevCore.times[k] || 0;
    }

    const idleDiff = core.times.idle - prevCore.times.idle;
    const coreDiff = currCoreTotal - prevCoreTotal;
    const usage = coreDiff > 0 ? Math.max(0, Math.min(100, ((coreDiff - idleDiff) / coreDiff) * 100)) : 0;

    totalIdle += idleDiff;
    totalTick += coreDiff;

    return {
      coreIndex: i,
      model: core.model,
      speedMHz: core.speed,
      usagePercent: Number(usage.toFixed(1))
    };
  });

  const overall = totalTick > 0 ? Math.max(0, Math.min(100, ((totalTick - totalIdle) / totalTick) * 100)) : 0;

  return {
    overallUsagePercent: Number(overall.toFixed(1)),
    cores
  };
}

async function publishTelemetry() {
  const currCpus = os.cpus();
  const delta = calculateCpuDelta(prevCpus, currCpus);
  prevCpus = currCpus;

  const payload = {
    timestamp: Date.now(),
    host: os.hostname(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    cpus: currCpus,
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuUsagePercent: delta.overallUsagePercent,
    coresUsage: delta.cores
  };

  try {
    const res = await fetch(`${REDIS_URL}/set/astral_metrics`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error(`[${new Date().toISOString()}] Upstash returned HTTP ${res.status}`);
    } else {
      console.log(`[${new Date().toISOString()}] 📡 Telemetry posted -> CPU: ${delta.overallUsagePercent}% | Free RAM: ${(payload.freeMem / (1024 ** 3)).toFixed(2)} GB`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to publish telemetry:`, err.message);
  }
}

console.log(`⚡ Astral Node Telemetry Daemon active on ${os.hostname()} (sampling interval: 3s)`);
publishTelemetry();
const interval = setInterval(publishTelemetry, 3000);

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\nDaemon stopped.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  process.exit(0);
});
