const fs = require('fs');
const path = require('path');

// Helper to load .env in local dev if not populated
function ensureEnv() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return;
  }
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === 'function') {
      try { process.loadEnvFile(envPath); } catch {}
    } else {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
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

module.exports = async (req, res) => {
  ensureEnv();

  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error: 'Upstash Redis environment variables are not configured',
      status: 'error'
    });
    return;
  }

  try {
    const upstreamRes = await fetch(`${REDIS_URL}/get/astral_metrics`, {
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`
      }
    });

    if (!upstreamRes.ok) {
      res.status(upstreamRes.status).json({
        error: `Upstash returned HTTP ${upstreamRes.status}`,
        status: 'error'
      });
      return;
    }

    const json = await upstreamRes.json();
    if (!json.result) {
      res.status(200).json({
        status: 'waiting',
        message: 'No telemetry cached yet in Upstash Redis',
        host: 'astral-node'
      });
      return;
    }

    const payload = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;

    const totalMem = payload.totalMem || 0;
    const freeMem = payload.freeMem || 0;
    const usedMem = Math.max(0, totalMem - freeMem);
    const ramUsagePercent = totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(1)) : 0;

    const enriched = {
      timestamp: payload.timestamp,
      host: payload.host || 'astral-node',
      uptime: payload.uptime || 0,
      uptimeFormatted: formatUptime(payload.uptime || 0),
      loadavg: payload.loadavg || [0, 0, 0],
      totalMem,
      freeMem,
      usedMem,
      totalGB: Number((totalMem / (1024 ** 3)).toFixed(2)),
      freeGB: Number((freeMem / (1024 ** 3)).toFixed(2)),
      usedGB: Number((usedMem / (1024 ** 3)).toFixed(2)),
      ramPercent: ramUsagePercent,
      cpuPercent: payload.cpuUsagePercent ?? 0,
      cpus: payload.cpus || [],
      coresCount: payload.cpus ? payload.cpus.length : 0,
      cpuModel: payload.cpus?.[0]?.model || 'Intel / AMD Processor',
      coresUsage: payload.coresUsage || [],
      platform: payload.platform || 'linux',
      release: payload.release || '',
      arch: payload.arch || 'x64',
      ageSeconds: Math.floor((Date.now() - payload.timestamp) / 1000),
      status: 'active'
    };

    res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json({
      error: err.message,
      status: 'error'
    });
  }
};
