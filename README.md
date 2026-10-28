# astral-node-telemetry

A high-performance live system status dashboard streaming real-time CPU, RAM, and server telemetry for astral-node via Upstash Redis.

## Architecture & Features

- **Upstash Redis Relay**: I engineered a decoupled telemetry architecture where `daemon.js` samples native hardware metrics on `astral-node` every 3 seconds and syncs them to Upstash Redis via REST.
- **Serverless Telemetry API**: Implemented `/api/telemetry` in `api/telemetry.js` to retrieve and format the cached telemetry snapshot directly for the cloud-hosted frontend.
- **Real-Time Telemetry Engine**: I engineered a native Node.js metrics collector in `daemon.js` and `lib/telemetry.js` that samples CPU delta ticks from `os.cpus()` across all logical cores and tracks memory allocations with zero external dependencies.
- **Live Canvas Waveform**: I designed a high-DPI HTML5 canvas chart rendering dual glowing waveforms for rolling 30-sample CPU and memory history.
- **Per-Core Visualization**: Dynamic load bars and clock frequency trackers for each logical processor core with automated severity thresholds.
- **Dark Glassmorphic UI**: Curated obsidian dark aesthetic with radial cyan and violet ambient light layers, responsive CSS grid layout, and accessible semantic components.

## Local Setup

```bash
git clone https://github.com/Astral-mk4u48/astral-node-telemetry.git
cd astral-node-telemetry
npm install

# Start the astral-node telemetry daemon
npm run daemon

# In a separate terminal, start the web interface
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the live dashboard.

## Deployment

The live production deployment is active on Vercel:
- **Production URL**: [https://astral-node-telemetry.vercel.app](https://astral-node-telemetry.vercel.app)
- **Redis Telemetry API**: [https://astral-node-telemetry.vercel.app/api/telemetry](https://astral-node-telemetry.vercel.app/api/telemetry)
- **Health Check**: [https://astral-node-telemetry.vercel.app/health](https://astral-node-telemetry.vercel.app/health)

## License

MIT
