const { getTelemetrySnapshot } = require('../lib/telemetry');

module.exports = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const snapshot = getTelemetrySnapshot();
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

  const interval = setInterval(() => {
    try {
      const data = getTelemetrySnapshot();
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      clearInterval(interval);
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
};
