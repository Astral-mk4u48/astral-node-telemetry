// Pulse Live Status Dashboard - Client Logic
(function () {
  'use strict';

  // Constants
  const MAX_HISTORY = 30;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 50; // ~314.159

  // State
  let isPaused = false;
  let eventSource = null;
  let fallbackInterval = null;
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
  const elNodeVersionBadge = document.getElementById('node-version-badge');
  const elHeapUsed = document.getElementById('heap-used');
  const elHeapTotal = document.getElementById('heap-total');
  const elHeapProgress = document.getElementById('heap-progress');
  const elProcessRss = document.getElementById('process-rss');
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

  // Helper: format percent offset for SVG circular rings
  function setProgress(circleEl, percent) {
    if (!circleEl) return;
    const clamped = Math.max(0, Math.min(100, percent));
    const offset = CIRCLE_CIRCUMFERENCE - (clamped / 100) * CIRCLE_CIRCUMFERENCE;
    circleEl.style.strokeDashoffset = offset.toFixed(2);
  }

  // Update UI with incoming metrics payload
  function updateDashboard(data) {
    if (isPaused || !data) return;

    // Header & Info
    if (data.system) {
      elSystemHostname.textContent = data.system.hostname;
      elSystemPlatform.textContent = `${data.system.platform} ${data.system.arch}`;
      elSystemKernel.textContent = data.system.release;

      elSpecHostname.textContent = data.system.hostname;
      elSpecPlatform.textContent = `${data.system.type} (${data.system.platform})`;
      elSpecRelease.textContent = data.system.release;
      elSpecArch.textContent = data.system.arch;
    }

    // CPU Metrics
    if (data.cpu) {
      const cpuUsage = data.cpu.usagePercent || 0;
      elCpuPercent.innerHTML = `${cpuUsage.toFixed(1)}<small>%</small>`;
      setProgress(elCpuRingFill, cpuUsage);

      elCpuCoreCount.textContent = `${data.cpu.coreCount} Cores`;
      elCoreCountTag.textContent = `${data.cpu.coreCount} Logical Cores`;
      elCpuModel.textContent = data.cpu.model;

      if (data.cpu.loadAvg) {
        elCpuLoadAvg.textContent = data.cpu.loadAvg.map(n => n.toFixed(2)).join(' • ');
      }

      // Render per-core cards
      renderCores(data.cpu.cores);
    }

    // Memory Metrics
    if (data.memory) {
      const ramUsage = data.memory.usagePercent || 0;
      elRamPercent.innerHTML = `${ramUsage.toFixed(1)}<small>%</small>`;
      setProgress(elRamRingFill, ramUsage);

      elRamUsedTag.textContent = `${data.memory.usedGB} GB Used`;
      elRamBreakdown.textContent = `${data.memory.usedGB} / ${data.memory.totalGB} GB`;
      elMemoryBarFill.style.width = `${Math.min(100, ramUsage)}%`;
      elSpecRam.textContent = `${data.memory.totalGB} GB (${data.memory.freeGB} GB Free)`;
    }

    // Uptime
    if (data.uptime) {
      elSystemUptime.textContent = data.uptime.systemFormatted;
      elProcessUptime.textContent = data.uptime.processFormatted;
    }

    // Process & Node info
    if (data.process) {
      elProcessPid.textContent = data.process.pid;
      elNodeVersionBadge.textContent = data.process.nodeVersion;
      elSpecNode.textContent = data.process.nodeVersion;
      elArchDisplay.textContent = data.system?.arch || 'x64';

      elHeapUsed.textContent = `${data.process.heapUsedMB} MB`;
      elHeapTotal.textContent = `${data.process.heapTotalMB} MB`;
      elProcessRss.textContent = `${data.process.rssMB} MB`;

      const heapPct = data.process.heapTotalMB > 0
        ? Math.round((data.process.heapUsedMB / data.process.heapTotalMB) * 100)
        : 10;
      elHeapProgress.style.width = `${Math.min(100, heapPct)}%`;
    }

    // Add to chart history
    const now = new Date(data.epoch || Date.now());
    historyData.push({
      time: now,
      cpu: data.cpu ? data.cpu.usagePercent : 0,
      ram: data.memory ? data.memory.usagePercent : 0
    });

    if (historyData.length > MAX_HISTORY) {
      historyData.shift();
    }

    drawChart();

    // Footer update
    elLastUpdatedTime.textContent = `Last update: ${now.toLocaleTimeString()}`;
  }

  // Render individual CPU cores
  function renderCores(cores) {
    if (!cores || !cores.length) return;

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
            <span class="core-speed">${core.speedMHz} MHz</span>
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

  // Canvas Telemetry Chart Drawing
  function setupCanvasDPI() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 220 * dpr;
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
  }

  function drawChart() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = 220;

    ctx.clearRect(0, 0, width, height);

    // Chart margins
    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    const yLevels = [0, 25, 50, 75, 100];
    yLevels.forEach((level) => {
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
      ctx.fillText('Collecting real-time data...', width / 2, height / 2);
      return;
    }

    const stepX = chartW / (MAX_HISTORY - 1);
    const startOffset = MAX_HISTORY - historyData.length;

    // Helper function to plot a metric line and gradient fill
    function plotSeries(key, strokeColor, glowColor, fillGradientTop, fillGradientBottom) {
      const points = historyData.map((d, i) => {
        const x = padLeft + (startOffset + i) * stepX;
        const val = Math.max(0, Math.min(100, d[key]));
        const y = padTop + chartH - (val / 100) * chartH;
        return { x, y };
      });

      // Area fill
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

      // Line stroke
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

      // Reset shadow
      ctx.shadowBlur = 0;

      // Draw latest endpoint pulse
      const latest = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(latest.x, latest.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Plot RAM (background)
    plotSeries(
      'ram',
      '#a855f7',
      'rgba(168, 85, 247, 0.5)',
      'rgba(168, 85, 247, 0.25)',
      'rgba(168, 85, 247, 0.0)'
    );

    // Plot CPU (foreground)
    plotSeries(
      'cpu',
      '#00f0ff',
      'rgba(0, 240, 255, 0.6)',
      'rgba(0, 240, 255, 0.3)',
      'rgba(0, 240, 255, 0.0)'
    );

    // X-Axis time markers
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    const firstPoint = historyData[0];
    const lastPoint = historyData[historyData.length - 1];
    if (firstPoint && lastPoint) {
      ctx.fillText(firstPoint.time.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }), padLeft, height - 10);
      ctx.fillText(lastPoint.time.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }), width - padRight, height - 10);
    }
  }

  // Setup Server-Sent Events stream
  function initSSE() {
    if (eventSource) {
      eventSource.close();
    }

    elStatusLabel.textContent = 'CONNECTING';
    elStreamStatus.style.background = 'rgba(245, 158, 11, 0.1)';
    elStreamStatus.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    elStreamStatus.style.color = 'var(--accent-amber)';

    eventSource = new EventSource('/api/stream');

    eventSource.onopen = function () {
      elStatusLabel.textContent = 'LIVE (SSE)';
      elStreamStatus.style.background = 'rgba(16, 185, 129, 0.1)';
      elStreamStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      elStreamStatus.style.color = 'var(--accent-emerald)';
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
    };

    eventSource.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        updateDashboard(data);
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    eventSource.onerror = function () {
      elStatusLabel.textContent = 'POLLING';
      elStreamStatus.style.background = 'rgba(245, 158, 11, 0.1)';
      elStreamStatus.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      elStreamStatus.style.color = 'var(--accent-amber)';

      // Switch to polling if SSE encounters issues
      if (!fallbackInterval) {
        fallbackInterval = setInterval(fetchMetrics, 1000);
      }
    };
  }

  // Fetch metrics via REST fallback
  async function fetchMetrics() {
    try {
      const res = await fetch('/api/metrics');
      if (res.ok) {
        const data = await res.json();
        updateDashboard(data);
      }
    } catch (e) {
      console.warn('Metrics polling error:', e);
    }
  }

  // Toggle pause/resume
  elToggleStreamBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      elPauseBtnText.textContent = 'Resume';
      elStatusLabel.textContent = 'PAUSED';
      elStreamStatus.style.color = 'var(--text-muted)';
      elStreamStatus.style.background = 'rgba(255, 255, 255, 0.05)';
      elStreamStatus.style.borderColor = 'var(--border-subtle)';
    } else {
      elPauseBtnText.textContent = 'Pause';
      elStatusLabel.textContent = 'LIVE (SSE)';
      elStreamStatus.style.color = 'var(--accent-emerald)';
      elStreamStatus.style.background = 'rgba(16, 185, 129, 0.1)';
      elStreamStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    }
  });

  // Handle window resize for canvas
  window.addEventListener('resize', () => {
    setupCanvasDPI();
    drawChart();
  });

  // Init
  setupCanvasDPI();
  initSSE();
})();
