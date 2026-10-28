# astral-node-telemetry

A high-performance live system status dashboard streaming real-time CPU, RAM, and server telemetry for astral-node.

## Architecture & Features

- **Real-Time Telemetry Engine**: I engineered a native Node.js metrics collector in `lib/telemetry.js` that samples CPU delta ticks from `os.cpus()` across all logical cores and tracks memory allocations with zero external dependencies.
- **Server-Sent Events (SSE) Stream**: I implemented an event-driven push architecture over `/api/stream` delivering instantaneous server telemetry to connected clients, with automatic fallback to `/api/metrics` polling.
- **Live Canvas Waveform**: I designed a high-DPI HTML5 canvas chart rendering dual glowing waveforms for rolling 30-sample CPU and memory history.
- **Per-Core Visualization**: Dynamic load bars and clock frequency trackers for each logical processor core with automated severity thresholds.
- **Vercel Serverless Integration**: Configured modular routing and rewrites in `vercel.json` and `server.js` allowing seamless execution both as a persistent local daemon and across cloud edge environments.
- **Dark Glassmorphic UI**: Curated obsidian dark aesthetic with radial cyan and violet ambient light layers, responsive CSS grid layout, and accessible semantic components.

## Local Setup

```bash
git clone https://github.com/Astral-mk4u48/astral-node-telemetry.git
cd astral-node-telemetry
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the live dashboard.

## Deployment

The live production deployment is active on Vercel:
- **Production URL**: [https://astral-node-telemetry.vercel.app](https://astral-node-telemetry.vercel.app)
- **Health Check**: [https://astral-node-telemetry.vercel.app/health](https://astral-node-telemetry.vercel.app/health)
- **JSON Telemetry API**: [https://astral-node-telemetry.vercel.app/api/metrics](https://astral-node-telemetry.vercel.app/api/metrics)

## License

MIT
