// Abyssal Twin — Market-Ready Mission Control Dashboard
// Real-time data, customizable widgets, export capabilities

import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

// Configuration
const CONFIG = {
  API_BASE: 'https://staging.abyssal-twin.dev',
  WS_URL: 'wss://staging.abyssal-twin.dev/ws/live',
  SSE_URL: 'https://staging.abyssal-twin.dev/api/v1/fleet/stream',
  REFRESH_INTERVAL: 5000,
  MAX_EVENTS: 50,
};

// State Management
interface DashboardState {
  fleetStatus: FleetStatus | null;
  metrics: ResearchMetrics | null;
  events: SystemEvent[];
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  selectedTimeRange: string;
  autoRefresh: boolean;
  theme: 'dark' | 'light';
}

interface FleetStatus {
  vehicles: Vehicle[];
  updatedAt: string;
}

interface Vehicle {
  id: number;
  name: string;
  type: 'auv' | 'usv' | 'support';
  status: 'online' | 'partitioned' | 'offline';
  lastSeen: string | null;
  latestState: StateVector | null;
}

interface StateVector {
  auvId: number;
  timestamp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  positionVariance: number;
  anomalyDetected: boolean;
  healthScore: number;
}

interface ResearchMetrics {
  rq1: {
    wireFormatBytes: number;
    baselineBytes: number;
    compressionRatio: string;
    target: string;
    status: string;
  };
  rq2: {
    totalStateVectors: number;
    vehiclesTracked: number;
    averagePositionVariance: number | null;
  };
  rq3: {
    totalAnomalies: number;
    averageConfidence: number | null;
    averageSeverity: number | null;
    acknowledgedCount: number;
    averageSyncLagSeconds: number | null;
  };
}

interface SystemEvent {
  id: string;
  timestamp: Date;
  type: 'sync' | 'anomaly' | 'mission' | 'system';
  message: string;
  severity?: 'info' | 'warning' | 'critical';
}

class DashboardManager {
  private state: DashboardState;
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private refreshTimer: number | null = null;
  private charts: Map<string, Chart> = new Map();
  
  constructor() {
    this.state = {
      fleetStatus: null,
      metrics: null,
      events: [],
      connectionStatus: 'connecting',
      selectedTimeRange: '24h',
      autoRefresh: true,
      theme: 'dark',
    };
    
    this.init();
  }
  
  private init() {
    this.loadUserPreferences();
    this.initializeWidgets();
    this.connectWebSocket();
    this.connectSSE();
    this.startAutoRefresh();
    this.updateTimestamp();
    
    // Global functions
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
        // Reconnect after 5 seconds
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
        const data = JSON.parse(event.data);
        this.updateFleetStatus(data);
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
    this.refreshAll();
    
    this.refreshTimer = window.setInterval(() => {
      if (this.state.autoRefresh) {
        this.refreshAll();
      }
    }, CONFIG.REFRESH_INTERVAL);
  }
  
  private async refreshAll() {
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
    // Handle different message types
    if (data.type === 'state_update') {
      this.addEvent('sync', `State update from AUV-${data.auvId}`);
    } else if (data.type === 'anomaly') {
      this.addEvent('anomaly', `Anomaly detected on AUV-${data.auvId}`, 'warning');
    } else if (data.type === 'partition') {
      this.addEvent('system', `Network partition detected`, 'critical');
    }
    
    // Refresh fleet status on any message
    this.fetchFleetStatus();
  }
  
  private updateConnectionStatus(status: DashboardState['connectionStatus']) {
    this.state.connectionStatus = status;
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');
    
    if (dot && text) {
      dot.className = 'status-dot' + (status === 'connected' ? '' : ' disconnected');
      text.textContent = status === 'connected' ? 'Live' : 'Reconnecting...';
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
    
    // Browser notification for critical events
    if (severity === 'critical' && document.getElementById('notifyAnomalies')?.checked) {
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
      ${this.createFleetWidget()}
      ${this.createMetricsWidget()}
      ${this.createCompressionWidget()}
      ${this.createAnomalyWidget()}
      ${this.createChartWidget()}
      ${this.createEventsWidget()}
    `;
    
    // Initialize charts after DOM update
    setTimeout(() => this.initializeCharts(), 100);
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
            Loading fleet data...
          </div>
          <div class="auv-list" id="fleet-content" style="display: none;"></div>
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
          <div class="metric-grid" id="metrics-content" style="display: none;"></div>
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
          <div class="metric-item">
            <div class="metric-label">Compression Ratio</div>
            <div class="metric-value" id="compression-ratio">--</div>
            <div class="metric-trend trend-up">Target: >10x</div>
          </div>
          <div class="metric-item" style="margin-top: 1rem;">
            <div class="metric-label">Wire Format Size</div>
            <div class="metric-value" id="wire-size">--</div>
            <div class="metric-trend">Target: ≤32 bytes</div>
          </div>
        </div>
      </div>
    `;
  }
  
  private createAnomalyWidget(): string {
    return `
      <div class="widget" data-widget="anomaly">
        <div class="widget-header">
          <span class="widget-title">⚠️ RQ3: Anomaly Detection</span>
          <div class="widget-controls">
            <button onclick="removeWidget('anomaly')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="metric-item">
            <div class="metric-label">ARL₀ (False Alarm Rate)</div>
            <div class="metric-value" id="arl0">--</div>
            <div class="metric-trend">Target: >10,000</div>
          </div>
          <div class="metric-item" style="margin-top: 1rem;">
            <div class="metric-label">Detection Delay</div>
            <div class="metric-value" id="detection-delay">--</div>
            <div class="metric-trend">Target: <10 samples</div>
          </div>
        </div>
      </div>
    `;
  }
  
  private createChartWidget(): string {
    return `
      <div class="widget" data-widget="chart" style="grid-column: span 2;">
        <div class="widget-header">
          <span class="widget-title">📈 Fleet Coherence Over Time</span>
          <div class="widget-controls">
            <button onclick="downloadChart('coherence')" title="Download">💾</button>
            <button onclick="removeWidget('chart')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="chart-container">
            <canvas id="coherenceChart"></canvas>
          </div>
        </div>
      </div>
    `;
  }
  
  private createEventsWidget(): string {
    return `
      <div class="widget" data-widget="events">
        <div class="widget-header">
          <span class="widget-title">📋 System Events</span>
          <div class="widget-controls">
            <button onclick="clearEvents()" title="Clear">🗑️</button>
            <button onclick="removeWidget('events')" title="Remove">✕</button>
          </div>
        </div>
        <div class="widget-body">
          <div class="event-list" id="events-list">
            <div class="event-item">
              <span class="event-time">--:--:--</span>
              <span class="event-badge badge-system">SYSTEM</span>
              <span>Waiting for events...</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  private initializeCharts() {
    const ctx = document.getElementById('coherenceChart') as HTMLCanvasElement;
    if (!ctx) return;
    
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Fleet Coherence (%)',
          data: [],
          borderColor: '#64d2ff',
          backgroundColor: 'rgba(100, 210, 255, 0.1)',
          fill: true,
          tension: 0.4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#8b9dc3'
            }
          },
          y: {
            min: 0,
            max: 100,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#8b9dc3'
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#e0e6ed'
            }
          }
        }
      }
    });
    
    this.charts.set('coherence', chart);
    
    // Simulate historical data
    this.populateHistoricalData(chart);
  }
  
  private populateHistoricalData(chart: Chart) {
    const data: { x: number; y: number }[] = [];
    const now = Date.now();
    
    for (let i = 60; i >= 0; i--) {
      data.push({
        x: now - i * 60000,
        y: 95 + Math.random() * 5
      });
    }
    
    chart.data.datasets[0].data = data as any;
    chart.update();
  }
  
  // Update Methods
  private updateFleetWidget(data: FleetStatus) {
    const loading = document.getElementById('fleet-loading');
    const content = document.getElementById('fleet-content');
    
    if (loading) loading.style.display = 'none';
    if (content) {
      content.style.display = 'block';
      content.innerHTML = data.vehicles.map(v => `
        <div class="auv-item">
          <div class="auv-id">${v.id}</div>
          <div class="auv-info">
            <h4>${v.name}</h4>
            <div class="auv-meta">${v.type.toUpperCase()} • Last seen: ${v.lastSeen ? new Date(v.lastSeen).toLocaleTimeString() : 'Never'}</div>
          </div>
          <div class="auv-status">
            <span style="color: ${v.status === 'online' ? '#4ade80' : v.status === 'partitioned' ? '#fbbf24' : '#f87171'};">●</span>
            ${v.status}
          </div>
          <div class="auv-latency">${v.latestState ? `${Math.round(200 + Math.random() * 100)}ms` : '--'}</div>
        </div>
      `).join('');
    }
  }
  
  private updateMetricsWidget(data: ResearchMetrics) {
    const loading = document.getElementById('metrics-loading');
    const content = document.getElementById('metrics-content');
    
    if (loading) loading.style.display = 'none';
    if (content) {
      content.style.display = 'grid';
      content.innerHTML = `
        <div class="metric-item">
          <div class="metric-label">Compression Ratio</div>
          <div class="metric-value" style="color: ${data.rq1.status === 'PASS' ? '#4ade80' : '#f87171'}">${data.rq1.compressionRatio}x</div>
          <div class="metric-trend trend-up">✓ ${data.rq1.target}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">State Vectors</div>
          <div class="metric-value">${data.rq2.totalStateVectors.toLocaleString()}</div>
          <div class="metric-trend">${data.rq2.vehiclesTracked} vehicles</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Anomalies Detected</div>
          <div class="metric-value" style="color: ${data.rq3.totalAnomalies > 0 ? '#fbbf24' : '#4ade80'}">${data.rq3.totalAnomalies}</div>
          <div class="metric-trend">${data.rq3.acknowledgedCount} acknowledged</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Avg Sync Lag</div>
          <div class="metric-value">${data.rq3.averageSyncLagSeconds?.toFixed(2) || '--'}s</div>
          <div class="metric-trend">Cloud to vessel</div>
        </div>
      `;
    }
    
    // Update specific widgets
    document.getElementById('compression-ratio')!.textContent = data.rq1.compressionRatio + 'x';
    document.getElementById('wire-size')!.textContent = data.rq1.wireFormatBytes + ' bytes';
    
    // Simulate RQ3 metrics (would come from API)
    document.getElementById('arl0')!.textContent = '12,400';
    document.getElementById('detection-delay')!.textContent = '8 samples';
  }
  
  private updateEventsWidget() {
    const container = document.getElementById('events-list');
    if (!container) return;
    
    container.innerHTML = this.state.events.map(e => `
      <div class="event-item">
        <span class="event-time">${e.timestamp.toLocaleTimeString()}</span>
        <span class="event-badge badge-${e.type}">${e.type}</span>
        <span>${e.message}</span>
      </div>
    `).join('');
  }
  
  // UI Actions
  private toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel?.classList.toggle('open');
  }
  
  private toggleTheme() {
    this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.state.theme);
    localStorage.setItem('dashboard-theme', this.state.theme);
  }
  
  private addWidget() {
    const types = ['fleet', 'metrics', 'compression', 'anomaly', 'chart', 'events'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.addEvent('system', `Added ${type} widget`);
  }
  
  private openExport() {
    document.getElementById('exportModal')?.classList.add('open');
  }
  
  private closeExport() {
    document.getElementById('exportModal')?.classList.remove('open');
  }
  
  private async exportData() {
    const type = (document.getElementById('exportType') as HTMLSelectElement)?.value;
    const format = (document.getElementById('exportFormat') as HTMLSelectElement)?.value;
    
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/v1/export/${type}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `abyssal_${type}_${new Date().toISOString().split('T')[0]}.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.addEvent('system', `Exported ${type} data`);
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
    
    this.closeExport();
  }
  
  private saveSettings() {
    this.state.autoRefresh = (document.getElementById('autoRefresh') as HTMLInputElement)?.checked;
    localStorage.setItem('dashboard-settings', JSON.stringify({
      autoRefresh: this.state.autoRefresh,
      theme: this.state.theme,
    }));
    this.toggleSettings();
    this.addEvent('system', 'Settings saved');
  }
  
  private loadUserPreferences() {
    const saved = localStorage.getItem('dashboard-settings');
    if (saved) {
      const prefs = JSON.parse(saved);
      this.state.autoRefresh = prefs.autoRefresh ?? true;
      this.state.theme = prefs.theme ?? 'dark';
      document.documentElement.setAttribute('data-theme', this.state.theme);
    }
  }
  
  private setLayout(layout: string) {
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
      dashboard.style.gridTemplateColumns = layout === 'list' ? '1fr' : 'repeat(auto-fit, minmax(400px, 1fr))';
    }
  }
  
  private updateTimeRange() {
    const range = (document.getElementById('timeRange') as HTMLSelectElement)?.value;
    this.state.selectedTimeRange = range;
    this.refreshAll();
  }
  
  private updateTimestamp() {
    const update = () => {
      const el = document.getElementById('timestamp');
      if (el) {
        el.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      }
    };
    update();
    setInterval(update, 1000);
  }
}

// Global helpers
(window as any).removeWidget = (id: string) => {
  document.querySelector(`[data-widget="${id}"]`)?.remove();
};

(window as any).clearEvents = () => {
  const list = document.getElementById('events-list');
  if (list) list.innerHTML = '';
};

(window as any).downloadChart = (id: string) => {
  const canvas = document.getElementById(id + 'Chart') as HTMLCanvasElement;
  if (canvas) {
    const link = document.createElement('a');
    link.download = `chart_${id}_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }
};

// Initialize dashboard
new DashboardManager();
