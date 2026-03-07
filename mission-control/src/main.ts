/**
 * Abyssal Twin — Mission Control Dashboard
 * Real-time data, customizable widgets, export capabilities
 * 
 * Features:
 * - Auto-detects demo mode (GitHub Pages) vs real API
 * - Simulates realistic AUV mission data with lawnmower patterns
 * - Real-time WebSocket-like updates every 2 seconds
 * - Visual demo mode indicator
 */

import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import type { FleetStatus, Vehicle, StateVector, ResearchMetrics, SystemEvent, DashboardState } from './types';
import { DemoDataEngine, DemoWebSocket, shouldUseDemoMode } from './demo-data';

// Configuration - uses environment variables for deployment flexibility
const CONFIG = {
  API_BASE: import.meta.env.VITE_API_BASE || 'https://staging.abyssal-twin.dev',
  WS_URL: import.meta.env.VITE_WS_URL || 'wss://staging.abyssal-twin.dev/ws/live',
  SSE_URL: import.meta.env.VITE_SSE_URL || 'https://staging.abyssal-twin.dev/api/v1/fleet/stream',
  REFRESH_INTERVAL: 5000,
  MAX_EVENTS: 50,
};

class DashboardManager {
  private state: DashboardState;
  private ws: WebSocket | DemoWebSocket | null = null;
  private eventSource: EventSource | null = null;
  private refreshTimer: number | null = null;
  private charts: Map<string, Chart> = new Map();
  private demoEngine: DemoDataEngine | null = null;
  
  constructor() {
    this.state = {
      fleetStatus: null,
      metrics: null,
      events: [],
      connectionStatus: 'connecting',
      isDemoMode: false,
      selectedTimeRange: '24h',
      autoRefresh: true,
      theme: 'dark',
    };
    
    this.init();
  }
  
  private init() {
    this.loadUserPreferences();
    this.detectMode();
    this.initializeWidgets();
    this.setupRealtimeConnection();
    this.startAutoRefresh();
    this.updateTimestamp();
    
    // Global functions for HTML onclick handlers
    (window as any).refreshAll = () => this.refreshAll();
    (window as any).toggleSettings = () => this.toggleSettings();
    (window as any).toggleTheme = () => this.toggleTheme();
    (window as any).addWidget = () => this.addWidget();
    (window as any).openExport = () => this.openExport();
    (window as any).closeExport = () => this.closeExport();
    (window as any).exportData = () => this.exportData();
    (window as any).saveSettings = () => this.saveSettings();
    (window as any).setLayout = (layout: string) => this.setLayout(layout);
    (window as any).updateTimeRange = () => this.updateTimeRange();
    (window as any).removeWidget = (widgetId: string) => this.removeWidget(widgetId);
  }

  /**
   * Detect whether to use demo mode or real API
   */
  private detectMode() {
    this.state.isDemoMode = shouldUseDemoMode();
    
    if (this.state.isDemoMode) {
      console.log('🎮 DEMO MODE: Using simulated AUV data');
      this.addEvent('system', '🎮 Demo Mode Active — Simulating AUV fleet data', 'info');
      this.updateConnectionStatus('connected');
    } else {
      console.log('🔌 LIVE MODE: Connecting to real API');
    }
  }
  
  private setupRealtimeConnection() {
    if (this.state.isDemoMode) {
      // Use demo WebSocket simulation
      this.demoEngine = new DemoDataEngine();
      this.demoEngine.start((fleet, metrics, event) => {
        this.state.fleetStatus = fleet;
        this.state.metrics = metrics;
        this.updateFleetWidget(fleet);
        this.updateMetricsWidget(metrics);
        this.updateCharts(fleet);
        
        if (event) {
          this.state.events.unshift(event);
          if (this.state.events.length > CONFIG.MAX_EVENTS) {
            this.state.events.pop();
          }
          this.updateEventsWidget();
        }
      });
      
      // Simulate WebSocket for event handling
      this.ws = new DemoWebSocket(`${CONFIG.WS_URL}?vesselId=control`);
      this.ws.on('open', () => {
        this.updateConnectionStatus('connected');
      });
      this.ws.on('message', (event: any) => {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      });
    } else {
      // Use real connections
      this.connectWebSocket();
      this.connectSSE();
    }
  }
  
  // WebSocket Connection for Real-time Updates
  private connectWebSocket() {
    try {
      this.ws = new WebSocket(`${CONFIG.WS_URL}?vesselId=control`);
      
      this.ws.onopen = () => {
        this.updateConnectionStatus('connected');
        this.addEvent('system', 'WebSocket connected');
      };
      
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      };
      
      this.ws.onerror = () => {
        this.updateConnectionStatus('disconnected');
      };
      
      this.ws.onclose = () => {
        this.updateConnectionStatus('disconnected');
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (e) {
      console.warn('WebSocket connection failed:', e);
      this.updateConnectionStatus('disconnected');
    }
  }
  
  // Server-Sent Events for Fleet Stream
  private connectSSE() {
    try {
      this.eventSource = new EventSource(CONFIG.SSE_URL);
      
      this.eventSource.onmessage = (event) => {
        try {
          const data: FleetStatus = JSON.parse(event.data);
          this.state.fleetStatus = data;
          this.updateFleetWidget(data);
        } catch (e) {
          console.warn('Failed to parse SSE data:', e);
        }
      };
      
      this.eventSource.onerror = () => {
        console.warn('SSE connection error');
      };
    } catch (e) {
      console.warn('SSE not supported or failed:', e);
    }
  }
  
  // Auto-refresh for REST API polling
  private startAutoRefresh() {
    if (!this.state.isDemoMode) {
      this.refreshAll();
      
      this.refreshTimer = window.setInterval(() => {
        if (this.state.autoRefresh) {
          this.refreshAll();
        }
      }, CONFIG.REFRESH_INTERVAL);
    }
  }
  
  private async refreshAll() {
    if (this.state.isDemoMode) return; // Demo mode handles its own updates
    
    await Promise.all([
      this.fetchFleetStatus(),
      this.fetchMetrics(),
    ]);
  }
  
  private async fetchFleetStatus() {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/v1/fleet/status`);
      if (response.ok) {
        const data: FleetStatus = await response.json();
        this.state.fleetStatus = data;
        this.updateFleetWidget(data);
      }
    } catch (e) {
      console.warn('Failed to fetch fleet status:', e);
    }
  }
  
  private async fetchMetrics() {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/v1/export/summary`);
      if (response.ok) {
        const data: ResearchMetrics = await response.json();
        this.state.metrics = data;
        this.updateMetricsWidget(data);
      }
    } catch (e) {
      console.warn('Failed to fetch metrics:', e);
    }
  }
  
  private handleWebSocketMessage(data: any) {
    if (data.type === 'state_update') {
      this.addEvent('sync', `State update from AUV-${data.auvId}`);
    } else if (data.type === 'anomaly') {
      this.addEvent('anomaly', `Anomaly detected on AUV-${data.auvId}`, 'warning');
    } else if (data.type === 'partition') {
      this.addEvent('system', `Network partition detected`, 'critical');
    }
    
    if (!this.state.isDemoMode) {
      this.fetchFleetStatus();
    }
  }
  
  private updateConnectionStatus(status: DashboardState['connectionStatus']) {
    this.state.connectionStatus = status;
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');
    
    if (dot && text) {
      dot.className = 'status-dot' + (status === 'connected' ? '' : ' disconnected');
      text.textContent = status === 'connected' 
        ? (this.state.isDemoMode ? 'Demo Mode' : 'Live') 
        : 'Reconnecting...';
    }
  }
  
  private addEvent(type: SystemEvent['type'], message: string, severity: SystemEvent['severity'] = 'info') {
    const event: SystemEvent = {
      id: Date.now().toString(),
      timestamp: new Date(),
      type,
      message,
      severity,
    };
    
    this.state.events.unshift(event);
    if (this.state.events.length > CONFIG.MAX_EVENTS) {
      this.state.events.pop();
    }
    
    this.updateEventsWidget();
    
    const notifyCheckbox = document.getElementById('notifyAnomalies') as HTMLInputElement | null;
    if (severity === 'critical' && notifyCheckbox?.checked) {
      this.showNotification('Abyssal Twin Alert', message);
    }
  }
  
  private showNotification(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
  
  // Widget Management
  private initializeWidgets() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;
    
    dashboard.innerHTML = `
      ${this.createDemoBanner()}
      ${this.createFleetWidget()}
      ${this.createMetricsWidget()}
      ${this.createCompressionWidget()}
      ${this.createAnomalyWidget()}
      ${this.createChartWidget()}
      ${this.createEventsWidget()}
    `;
    
    setTimeout(() => this.initializeCharts(), 100);
  }

  private createDemoBanner(): string {
    if (!this.state.isDemoMode) return '';
    
    return `
      <div class="demo-banner" id="demoBanner">
        <span class="demo-pulse">🎮</span>
        <span class="demo-text">
          <strong>DEMO MODE</strong> — Simulated AUV fleet data. 
          <button onclick="disableDemoAndReload()" class="demo-link">Connect to real API →</button>
        </span>
        <button class="demo-close" onclick="document.getElementById('demoBanner').style.display='none'">×</button>
      </div>
      <script>
        function disableDemoAndReload() {
          localStorage.removeItem('demo_mode');
          localStorage.setItem('use_real_api', 'true');
          window.location.reload();
        }
      </script>
    `;
  }
  
  private createFleetWidget(): string {
    return `
      <div class="widget" data-widget="fleet">
        <div class="widget-header">
          <span class="widget-title">🤖 Fleet Status</span>
          <div class="widget-controls">
            <button onclick="refreshAll()" title="Refresh">🔄</button>
            <button onclick="removeWidget('fleet')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="loading" id="fleet-loading">
            <div class="spinner"></div>
            ${this.state.isDemoMode ? 'Initializing demo fleet...' : 'Loading fleet data...'}
          </div>
          <div class="fleet-grid" id="fleet-content" style="display: none;"></div>
        </div>
      </div>
    `;
  }
  
  private createMetricsWidget(): string {
    return `
      <div class="widget" data-widget="metrics">
        <div class="widget-header">
          <span class="widget-title">📊 Research Metrics</span>
          <div class="widget-controls">
            <button onclick="openExport()" title="Export">📥</button>
            <button onclick="removeWidget('metrics')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="loading" id="metrics-loading">
            <div class="spinner"></div>
            Loading metrics...
          </div>
          <div class="metrics-content" id="metrics-content" style="display: none;"></div>
        </div>
      </div>
    `;
  }
  
  private createCompressionWidget(): string {
    return `
      <div class="widget" data-widget="compression">
        <div class="widget-header">
          <span class="widget-title">🗜️ RQ1: Compression</span>
          <div class="widget-controls">
            <button onclick="removeWidget('compression')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="compression-stats" id="compression-stats">
            <div class="stat-row">
              <span class="stat-label">Wire Format:</span>
              <span class="stat-value" id="wire-bytes">-- bytes</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Baseline:</span>
              <span class="stat-value" id="baseline-bytes">-- bytes</span>
            </div>
            <div class="stat-row highlight">
              <span class="stat-label">Ratio:</span>
              <span class="stat-value" id="compression-ratio">--x</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Target:</span>
              <span class="stat-value" id="compression-target">>10x</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Status:</span>
              <span class="stat-value" id="compression-status">--</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  private createAnomalyWidget(): string {
    return `
      <div class="widget" data-widget="anomaly">
        <div class="widget-header">
          <span class="widget-title">⚠️ RQ3: Anomalies</span>
          <div class="widget-controls">
            <button onclick="removeWidget('anomaly')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="anomaly-stats" id="anomaly-stats">
            <div class="stat-row">
              <span class="stat-label">Total:</span>
              <span class="stat-value" id="anomaly-total">--</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Confidence:</span>
              <span class="stat-value" id="anomaly-confidence">--%</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Severity:</span>
              <span class="stat-value" id="anomaly-severity">--</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Sync Lag:</span>
              <span class="stat-value" id="sync-lag">--s</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  private createChartWidget(): string {
    return `
      <div class="widget widget-wide" data-widget="chart">
        <div class="widget-header">
          <span class="widget-title">📈 Fleet Depth History</span>
          <div class="widget-controls">
            <select id="timeRange" onchange="updateTimeRange()">
              <option value="1h">1 Hour</option>
              <option value="24h" selected>24 Hours</option>
              <option value="7d">7 Days</option>
            </select>
            <button onclick="removeWidget('chart')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <canvas id="depthChart"></canvas>
        </div>
      </div>
    `;
  }
  
  private createEventsWidget(): string {
    return `
      <div class="widget widget-tall" data-widget="events">
        <div class="widget-header">
          <span class="widget-title">📋 Event Log</span>
          <div class="widget-controls">
            <button onclick="removeWidget('events')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="events-list" id="events-list"></div>
        </div>
      </div>
    `;
  }
  
  // Update methods
  private updateFleetWidget(fleet: FleetStatus) {
    const loading = document.getElementById('fleet-loading');
    const content = document.getElementById('fleet-content');
    
    if (loading) loading.style.display = 'none';
    if (content) {
      content.style.display = '';  // let CSS fleet-grid class control display
      content.innerHTML = fleet.vehicles.map(v => this.createAUVCard(v)).join('');
    }
  }
  
  private createAUVCard(vehicle: Vehicle): string {
    const state = vehicle.latestState;
    const statusColor = vehicle.status === 'online' ? 'var(--accent-success)' :
                       vehicle.status === 'partitioned' ? 'var(--accent-warning)' :
                       'var(--accent-danger)';

    // Battery colour thresholds
    const bat = state?.batteryPct ?? state?.healthScore ?? 0;
    const batColor = bat > 50 ? 'var(--accent-success)' : bat > 20 ? 'var(--accent-warning)' : 'var(--accent-danger)';

    // Depth: format with thousands separator (e.g. "3,042.5")
    const depthDisplay = state?.depthM !== undefined
      ? state.depthM.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '--';

    // Derived fallbacks: if new fields absent, compute from raw z / yaw
    const pressureDisplay = state?.pressureBar !== undefined
      ? state.pressureBar.toFixed(1)
      : (state?.z !== undefined ? Math.abs(state.z / 10).toFixed(1) : '--');

    const headingDisplay = state?.heading !== undefined
      ? state.heading.toFixed(1)
      : (state?.yaw !== undefined ? (((state.yaw * 180 / Math.PI) + 360) % 360).toFixed(1) : '--');

    const batDisplay = state?.batteryPct !== undefined
      ? state.batteryPct.toFixed(1)
      : (state?.healthScore?.toFixed(0) ?? '--');

    return `
      <div class="auv-card ${vehicle.status}" data-auv-id="${vehicle.id}">
        <div class="auv-header">
          <span class="auv-name">${vehicle.name}</span>
          <span class="auv-status" style="color: ${statusColor}">
            ${vehicle.status === 'online' ? '🟢' : vehicle.status === 'partitioned' ? '🟡' : '🔴'}
          </span>
        </div>
        <div class="auv-telemetry">
          <div class="telem-row">
            <span class="telem-label">Depth</span>
            <span class="telem-value">${depthDisplay} m</span>
          </div>
          <div class="telem-row">
            <span class="telem-label">Pressure</span>
            <span class="telem-value">${pressureDisplay} bar</span>
          </div>
          <div class="telem-row">
            <span class="telem-label">Heading</span>
            <span class="telem-value">${headingDisplay}°</span>
          </div>
          <div class="telem-row telem-battery">
            <span class="telem-label">Battery</span>
            <div class="battery-bar">
              <div class="battery-fill" style="width: ${Math.min(100, bat).toFixed(1)}%; background: ${batColor}"></div>
            </div>
            <span class="telem-value">${batDisplay}%</span>
          </div>
        </div>
        ${state?.anomalyDetected ? `
          <div class="auv-alert">
            ⚠️ Anomaly detected
          </div>
        ` : ''}
      </div>
    `;
  }
  
  private updateMetricsWidget(metrics: ResearchMetrics) {
    const loading = document.getElementById('metrics-loading');
    const content = document.getElementById('metrics-content');
    
    if (loading) loading.style.display = 'none';
    if (content) {
      content.style.display = 'block';
      
      // Update compression stats
      const wireBytes = document.getElementById('wire-bytes');
      const baselineBytes = document.getElementById('baseline-bytes');
      const compressionRatio = document.getElementById('compression-ratio');
      const compressionStatus = document.getElementById('compression-status');
      
      if (wireBytes) wireBytes.textContent = `${metrics.rq1.wireFormatBytes} bytes`;
      if (baselineBytes) baselineBytes.textContent = `${metrics.rq1.baselineBytes} bytes`;
      if (compressionRatio) compressionRatio.textContent = metrics.rq1.compressionRatio;
      if (compressionStatus) {
        compressionStatus.textContent = metrics.rq1.status;
        compressionStatus.className = 'stat-value ' + (metrics.rq1.status === 'PASS' ? 'status-pass' : 'status-fail');
      }
      
      // Update anomaly stats
      const anomalyTotal = document.getElementById('anomaly-total');
      const anomalyConfidence = document.getElementById('anomaly-confidence');
      const anomalySeverity = document.getElementById('anomaly-severity');
      const syncLag = document.getElementById('sync-lag');
      
      if (anomalyTotal) anomalyTotal.textContent = metrics.rq3.totalAnomalies.toString();
      if (anomalyConfidence) anomalyConfidence.textContent = `${Math.round((metrics.rq3.averageConfidence || 0) * 100)}%`;
      if (anomalySeverity) anomalySeverity.textContent = (metrics.rq3.averageSeverity || 0).toFixed(1);
      if (syncLag) syncLag.textContent = `${(metrics.rq3.averageSyncLagSeconds || 0).toFixed(2)}s`;
    }
  }
  
  private updateEventsWidget() {
    const container = document.getElementById('events-list');
    if (!container) return;
    
    container.innerHTML = this.state.events.map(event => `
      <div class="event-item event-${event.type} event-severity-${event.severity}">
        <div class="event-time">${event.timestamp.toLocaleTimeString()}</div>
        <div class="event-message">${event.message}</div>
      </div>
    `).join('');
    
    // Scroll to top
    container.scrollTop = 0;
  }
  
  private updateCharts(fleet: FleetStatus) {
    const depthChart = this.charts.get('depth');
    if (!depthChart) return;
    
    // Update with latest depth data
    const now = Date.now();
    fleet.vehicles.forEach((v, idx) => {
      if (v.latestState) {
        depthChart.data.datasets[idx].data.push({
          x: now,
          y: Math.abs(v.latestState.z),
        });
        
        // Keep last 50 points
        if (depthChart.data.datasets[idx].data.length > 50) {
          depthChart.data.datasets[idx].data.shift();
        }
      }
    });
    
    depthChart.update('none'); // Update without animation for performance
  }
  
  private initializeCharts() {
    const ctx = document.getElementById('depthChart') as HTMLCanvasElement | null;
    if (!ctx) return;
    
    const depthChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          { label: 'AUV-01', data: [], borderColor: '#64d2ff', backgroundColor: 'rgba(100, 210, 255, 0.1)', tension: 0.4 },
          { label: 'AUV-02', data: [], borderColor: '#4ade80', backgroundColor: 'rgba(74, 222, 128, 0.1)', tension: 0.4 },
          { label: 'USV-01', data: [], borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)', tension: 0.4 },
          { label: 'AUV-03', data: [], borderColor: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.1)', tension: 0.4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: { displayFormats: { second: 'HH:mm:ss' } },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#8b9dc3' },
          },
          y: {
            title: { display: true, text: 'Depth (m)', color: '#8b9dc3' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#8b9dc3' },
            reverse: true, // Depth increases downward
          },
        },
        plugins: {
          legend: {
            labels: { color: '#e0e6ed' },
          },
        },
      },
    });
    
    this.charts.set('depth', depthChart);
  }
  
  // User interaction handlers
  private toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) {
      panel.classList.toggle('open');
    }
  }
  
  private toggleTheme() {
    this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.state.theme);
    localStorage.setItem('theme', this.state.theme);
  }
  
  private addWidget() {
    // Show widget selection modal
    console.log('Add widget clicked');
  }
  
  private removeWidget(widgetId: string) {
    const widget = document.querySelector(`[data-widget="${widgetId}"]`);
    if (widget) {
      widget.remove();
    }
  }
  
  private setLayout(layout: string) {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;
    
    dashboard.className = 'dashboard layout-' + layout;
    localStorage.setItem('layout', layout);
  }
  
  private openExport() {
    const modal = document.getElementById('exportModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }
  
  private closeExport() {
    const modal = document.getElementById('exportModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  private exportData() {
    const format = (document.getElementById('exportFormat') as HTMLSelectElement)?.value || 'json';
    const range = (document.getElementById('exportRange') as HTMLSelectElement)?.value || '24h';
    
    // Generate export data
    const data = {
      timestamp: new Date().toISOString(),
      range,
      format,
      fleet: this.state.fleetStatus,
      metrics: this.state.metrics,
      events: this.state.events.slice(0, 100),
    };
    
    // Download file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abyssal-twin-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.closeExport();
    this.addEvent('system', `Data exported (${format.toUpperCase()})`);
  }
  
  private saveSettings() {
    const refreshRate = (document.getElementById('refreshRate') as HTMLSelectElement)?.value;
    const notifyAnomalies = (document.getElementById('notifyAnomalies') as HTMLInputElement)?.checked;
    
    if (refreshRate) {
      localStorage.setItem('refreshRate', refreshRate);
    }
    if (notifyAnomalies !== undefined) {
      localStorage.setItem('notifyAnomalies', notifyAnomalies.toString());
    }
    
    this.toggleSettings();
    this.addEvent('system', 'Settings saved');
  }
  
  private updateTimeRange() {
    const range = (document.getElementById('timeRange') as HTMLSelectElement)?.value;
    if (range) {
      this.state.selectedTimeRange = range;
      this.refreshAll();
    }
  }
  
  private updateTimestamp() {
    const el = document.getElementById('lastUpdated');
    if (el) {
      el.textContent = new Date().toLocaleTimeString();
    }
    setTimeout(() => this.updateTimestamp(), 1000);
  }
  
  private loadUserPreferences() {
    // Load theme
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      this.state.theme = savedTheme;
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    // Load layout
    const savedLayout = localStorage.getItem('layout');
    if (savedLayout) {
      this.setLayout(savedLayout);
    }
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new DashboardManager();
});
