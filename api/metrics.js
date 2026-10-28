const { getTelemetrySnapshot } = require('../lib/telemetry');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const snapshot = getTelemetrySnapshot();
  res.status(200).json(snapshot);
};
