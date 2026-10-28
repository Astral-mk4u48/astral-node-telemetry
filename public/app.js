// Astral Node Telemetry - Upstash Redis Live Client
(function () {
  'use strict';

  // Constants
  const MAX_HISTORY = 30;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 50; // ~314.159
  const POLL_CADENCE_MS = 3000;

  // State
  let isPaused = false;
  let pollTimer = null;
  const historyData = [];

  // DOM Elements
  const elStatusLabel = document.getElementById('status-label');
  const elStreamStatus = document.getElementById('stream-status');
  const elToggleStreamBtn = document.getElementById('toggle-stream-btn');
  const elPauseBtnText = document.getElementById('pause-btn-text');

  // Headers & System
  const elSystemHostname = document.getElementById('system-hostname');
  const elSystemPlatform = document.getElementById('system-platform');
  const elSystemKernel = document.getElementById('system-kernel');

  // CPU
  const elCpuPercent = document.getElementById('cpu-percent');
  const elCpuRingFill = document.getElementById('cpu-ring-fill');
  const elCpuLoadAvg = document.getElementById('cpu-load-avg');
  const elCpuModel = document.getElementById('cpu-model');
  const elCpuCoreCount = document.getElementById('cpu-core-count');

  // RAM
  const elRamPercent = document.getElementById('ram-percent');
  const elRamRingFill = document.getElementById('ram-ring-fill');
  const elRamUsedTag = document.getElementById('ram-used-tag');
  const elRamBreakdown = document.getElementById('ram-breakdown');
  const elMemoryBarFill = document.getElementById('memory-bar-fill');

  // Uptime & Node Process
  const elSystemUptime = document.getElementById('system-uptime');
  const elProcessUptime = document.getElementById('process-uptime');
  const elProcessPid = document.getElementById('process-pid');
  const elRelayHost = document.getElementById('relay-host');
  const elRelayAge = document.getElementById('relay-age');
  const elRedisStatusBadge = document.getElementById('redis-status-badge');
  const elArchDisplay = document.getElementById('arch-display');

  // Specs & Cores
  const elCoresContainer = document.getElementById('cores-container');
  const elCoreCountTag = document.getElementById('core-count-tag');
  const elSpecHostname = document.getElementById('spec-hostname');
  const elSpecPlatform = document.getElementById('spec-platform');
  const elSpecRelease = document.getElementById('spec-release');
  const elSpecArch = document.getElementById('spec-arch');
  const elSpecNode = document.getElementById('spec-node');
  const elSpecRam = document.getElementById('spec-ram');
  const elLastUpdatedTime = document.getElementById('last-updated-time');

  // Canvas
  const canvas = document.getElementById('telemetryChart');
  const ctx = canvas.getContext('2d');

  function setProgress(circleEl, percent) {
    if (!circleEl) return;
    const clamped = Math.max(0, Math.min(100, percent));
    const offset = CIRCLE_CIRCUMFERENCE - (clamped / 100) * CIRCLE_CIRCUMFERENCE;
    circleEl.style.strokeDashoffset = offset.toFixed(2);
  }

  function updateDashboard(data) {
    if (!data || isPaused) return;

    // Host & System Header
    const hostname = data.host || 'astral-node';
    if (elSystemHostname) elSystemHostname.textContent = hostname;
    if (elSystemPlatform) elSystemPlatform.textContent = `${data.platform || 'Linux'} ${data.arch || 'x64'}`;
    if (elSystemKernel) elSystemKernel.textContent = data.release || 'Verified';

    if (elSpecHostname) elSpecHostname.textContent = hostname;
    if (elSpecPlatform) elSpecPlatform.textContent = `${data.platform || 'linux'} (${data.arch || 'x64'})`;
    if (elSpecRelease) elSpecRelease.textContent = data.release || '--';
    if (elSpecArch) elSpecArch.textContent = data.arch || 'x64';
    if (elSpecNode) elSpecNode.textContent = data.cpuModel || 'Intel i5-6300U';
    if (elSpecRam) elSpecRam.textContent = `${data.totalGB} GB (${data.freeGB} GB Free)`;

    // CPU Metrics
    const cpuVal = typeof data.cpuPercent === 'number' ? data.cpuPercent : 0;
    if (elCpuPercent) elCpuPercent.innerHTML = `${cpuVal.toFixed(1)}<small>%</small>`;
    setProgress(elCpuRingFill, cpuVal);

    if (elCpuCoreCount) elCpuCoreCount.textContent = `${data.coresCount || 4} Cores`;
    if (elCoreCountTag) elCoreCountTag.textContent = `${data.coresCount || 4} Logical Cores`;
    if (elCpuModel) elCpuModel.textContent = data.cpuModel || 'Intel Processor';

    if (elCpuLoadAvg && Array.isArray(data.loadavg)) {
      elCpuLoadAvg.textContent = data.loadavg.map(n => Number(n).toFixed(2)).join(' • ');
    }

    if (data.coresUsage) {
      renderCores(data.coresUsage);
    }

    // Memory (RAM) Metrics
    const ramVal = typeof data.ramPercent === 'number' ? data.ramPercent : 0;
    if (elRamPercent) elRamPercent.innerHTML = `${ramVal.toFixed(1)}<small>%</small>`;
    setProgress(elRamRingFill, ramVal);

    if (elRamUsedTag) elRamUsedTag.textContent = `${data.usedGB} GB Used`;
    if (elRamBreakdown) elRamBreakdown.textContent = `${data.usedGB} / ${data.totalGB} GB`;
    if (elMemoryBarFill) elMemoryBarFill.style.width = `${Math.min(100, ramVal)}%`;

    // Uptime
    if (elSystemUptime) elSystemUptime.textContent = data.uptimeFormatted || `${Math.floor(data.uptime)}s`;
    if (elProcessUptime) elProcessUptime.textContent = `${data.ageSeconds ?? 0}s latency`;
    if (elProcessPid) elProcessPid.textContent = 'Upstash REST';

    // Redis Relay
    if (elRelayHost) elRelayHost.textContent = hostname;
    if (elRelayAge) elRelayAge.textContent = `${data.ageSeconds ?? 0}s ago`;
    if (elRedisStatusBadge) {
      if ((data.ageSeconds ?? 0) <= 6) {
        elRedisStatusBadge.textContent = 'Live Synced';
        elRedisStatusBadge.className = 'badge success';
      } else {
        elRedisStatusBadge.textContent = `${data.ageSeconds}s ago`;
        elRedisStatusBadge.className = 'badge';
      }
    }
    if (elArchDisplay) elArchDisplay.textContent = data.arch || 'x64';

    // History data for canvas chart
    const now = new Date(data.timestamp || Date.now());
    historyData.push({
      time: now,
      cpu: cpuVal,
      ram: ramVal
    });

    if (historyData.length > MAX_HISTORY) {
      historyData.shift();
    }

    drawChart();

    // Footer
    if (elLastUpdatedTime) {
      elLastUpdatedTime.textContent = `Redis sync: ${now.toLocaleTimeString()}`;
    }

    // Status label
    if (elStatusLabel) {
      elStatusLabel.textContent = 'SYNCED (REDIS 3s)';
      elStreamStatus.style.color = 'var(--accent-emerald)';
      elStreamStatus.style.background = 'rgba(16, 185, 129, 0.1)';
      elStreamStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    }
  }

  function renderCores(cores) {
    if (!cores || !cores.length || !elCoresContainer) return;

    elCoresContainer.innerHTML = '';
    cores.forEach((core) => {
      const item = document.createElement('div');
      item.className = 'core-item';

      let barColor = 'var(--accent-emerald)';
      if (core.usagePercent > 80) {
        barColor = 'var(--accent-rose)';
      } else if (core.usagePercent > 50) {
        barColor = 'var(--accent-amber)';
      }

      item.innerHTML = `
        <div class="core-header-row">
          <div>
            <span class="core-name">Core #${core.coreIndex}</span>
            <span class="core-speed">${core.speedMHz || '--'} MHz</span>
          </div>
          <span class="core-percent" style="color: ${barColor}">${core.usagePercent.toFixed(1)}%</span>
        </div>
        <div class="core-bar-track">
          <div class="core-bar-fill" style="width: ${Math.min(100, core.usagePercent)}%; background-color: ${barColor}"></div>
        </div>
      `;
      elCoresContainer.appendChild(item);
    });
  }

  function setupCanvasDPI() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 220 * dpr;
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
  }

  function drawChart() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = 220;

    ctx.clearRect(0, 0, width, height);

    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    // Y Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    [0, 25, 50, 75, 100].forEach((level) => {
      const y = padTop + chartH - (level / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(`${level}%`, padLeft - 8, y + 3);
    });

    if (historyData.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText('Collecting Upstash Redis telemetry...', width / 2, height / 2);
      return;
    }

    const stepX = chartW / (MAX_HISTORY - 1);
    const startOffset = MAX_HISTORY - historyData.length;

    function plotSeries(key, strokeColor, glowColor, fillGradientTop, fillGradientBottom) {
      const points = historyData.map((d, i) => {
        const x = padLeft + (startOffset + i) * stepX;
        const val = Math.max(0, Math.min(100, d[key]));
        const y = padTop + chartH - (val / 100) * chartH;
        return { x, y };
      });

      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      grad.addColorStop(0, fillGradientTop);
      grad.addColorStop(1, fillGradientBottom);

      ctx.beginPath();
      ctx.moveTo(points[0].x, padTop + chartH);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = glowColor;

      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      const latest = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(latest.x, latest.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Plot RAM
    plotSeries('ram', '#a855f7', 'rgba(168, 85, 247, 0.5)', 'rgba(168, 85, 247, 0.25)', 'rgba(168, 85, 247, 0.0)');

    // Plot CPU
    plotSeries('cpu', '#00f0ff', 'rgba(0, 240, 255, 0.6)', 'rgba(0, 240, 255, 0.3)', 'rgba(0, 240, 255, 0.0)');

    // X Time Markers
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    const firstPoint = historyData[0];
    const lastPoint = historyData[historyData.length - 1];
    if (firstPoint && lastPoint) {
      ctx.fillText(firstPoint.time.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }), padLeft, height - 10);
      ctx.fillText(lastPoint.time.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }), width - padRight, height - 10);
    }
  }

  async function fetchTelemetry() {
    if (isPaused) return;
    try {
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        updateDashboard(data);
      } else {
        console.warn('Telemetry request returned HTTP', res.status);
      }
    } catch (err) {
      console.error('Failed to fetch /api/telemetry:', err);
    }
  }

  // Toggle pause/resume
  if (elToggleStreamBtn) {
    elToggleStreamBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      if (isPaused) {
        if (elPauseBtnText) elPauseBtnText.textContent = 'Resume';
        if (elStatusLabel) elStatusLabel.textContent = 'PAUSED';
        elStreamStatus.style.color = 'var(--text-muted)';
        elStreamStatus.style.background = 'rgba(255, 255, 255, 0.05)';
        elStreamStatus.style.borderColor = 'var(--border-subtle)';
      } else {
        if (elPauseBtnText) elPauseBtnText.textContent = 'Pause';
        if (elStatusLabel) elStatusLabel.textContent = 'SYNCING';
        fetchTelemetry();
      }
    });
  }

  window.addEventListener('resize', () => {
    setupCanvasDPI();
    drawChart();
  });

  // Start polling
  setupCanvasDPI();
  fetchTelemetry();
  pollTimer = setInterval(fetchTelemetry, POLL_CADENCE_MS);
})();
