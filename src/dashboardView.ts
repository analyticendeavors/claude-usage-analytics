import * as vscode from 'vscode';
import { getUsageData, UsageData, SessionInfo } from './dataProvider';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'claudeUsage.dashboard';
    private _view?: vscode.WebviewView;
    private _activeTab: string = 'overview';
    private _chartView: 'messages' | 'cost' | 'tokens' = 'messages';  // Chart toggle state
    private _cachedData?: UsageData;  // Cache data to avoid re-fetching
    private _lastFetchTime: number = 0;
    private readonly CACHE_TTL = 30000;  // 30 second cache for data

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this.updateWebview();

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refresh':
                    this.refresh();
                    break;
                case 'switchTab':
                    this._activeTab = message.tab;
                    this.updateWebview();
                    break;
                case 'switchChartView':
                    this._chartView = message.view;
                    this.updateWebview();
                    break;
                case 'export':
                    vscode.commands.executeCommand('claudeUsage.exportData');
                    break;
            }
        });
    }

    // Re-read cache file (instant - cache-only mode)
    public refresh() {
        if (this._view) {
            this._cachedData = undefined;
            this._lastFetchTime = 0;
            this.updateWebview();
        }
    }

    public switchTab(tab: string) {
        this._activeTab = tab;
        if (this._view) {
            this._view.webview.postMessage({ command: 'setTab', tab });
        }
    }

    // Get data from cache (instant - cache-only mode)
    private getData(): UsageData {
        const now = Date.now();
        if (!this._cachedData || (now - this._lastFetchTime) > this.CACHE_TTL) {
            this._cachedData = getUsageData();
            this._lastFetchTime = now;
        }
        return this._cachedData;
    }

    private updateWebview() {
        if (!this._view) return;
        const data = this.getData();
        this._view.webview.html = this.getHtmlContent(data);
    }

    private formatNumber(num: number): string {
        return num.toLocaleString('en-US');
    }

    private formatNumberCompact(num: number): string {
        if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    private formatCost(cost: number): string {
        return '$' + cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Format cost with N/A for no data
    private formatCostOrNA(cost: number): string {
        if (cost === 0 || cost === undefined || cost === null) {
            return 'N/A';
        }
        return this.formatCost(cost);
    }

    // Format number with N/A for no data
    private formatNumberOrNA(num: number): string {
        if (num === 0 || num === undefined || num === null) {
            return 'N/A';
        }
        return this.formatNumber(num);
    }

    private getBarChartSvg(data: UsageData, chartView: 'messages' | 'cost' | 'tokens' = 'messages'): string {
        if (data.dailyHistory.length === 0) return '';

        const width = 280;
        const height = 95;  // Increased height to accommodate data labels
        const padding = 4;
        const barCount = Math.min(data.dailyHistory.length, 14);
        const barWidth = Math.max(12, (width - padding * 2) / barCount - 2);
        const labelSpace = 12;  // Space for data labels above bars

        // Colors based on chart view (matching icon colors)
        const colors: { [key: string]: string } = {
            messages: '#ff8800',  // Orange
            cost: '#2ed573',      // Green
            tokens: '#3498db'     // Blue
        };
        const barColor = colors[chartView];

        // Get the max value based on chart view
        const getValueForView = (d: { messages: number; cost: number; tokens: number }) => {
            switch (chartView) {
                case 'messages': return d.messages;
                case 'cost': return d.cost;
                case 'tokens': return d.tokens;
            }
        };

        // Get the most recent 14 days (slice from end, not beginning)
        const recentDays = data.dailyHistory.slice(-barCount);
        const values = recentDays.map(d => getValueForView(d));
        const maxValue = Math.max(...values, 1);

        // Only show labels on top 3 bars to avoid overlap
        const sortedValues = [...values].sort((a, b) => b - a);
        const labelThreshold = sortedValues[2] || 0;  // 3rd highest value

        let bars = '';
        for (let i = 0; i < recentDays.length; i++) {
            const d = recentDays[i];
            const value = getValueForView(d);
            const barHeight = Math.max(2, (value / maxValue) * (height - 20 - labelSpace));
            const x = padding + i * (barWidth + 2);
            const y = height - barHeight - 16;
            const dayLabel = d.date.slice(-2);

            // Only show data label on significant bars (top 3 values)
            let dataLabel = '';
            if (value > 0 && value >= labelThreshold) {
                if (chartView === 'cost') {
                    dataLabel = value >= 1000 ? `$${(value/1000).toFixed(1)}k` : `$${value.toFixed(0)}`;
                } else {
                    dataLabel = this.formatNumberCompact(value);
                }
            }

            // Format tooltip with all three values
            const tooltipMsgs = `${d.messages.toLocaleString()} msgs`;
            const tooltipCost = `$${d.cost.toFixed(2)}`;
            const tooltipTokens = this.formatNumberCompact(d.tokens) + ' tokens';
            const tooltip = `${d.date}&#10;${tooltipMsgs}&#10;${tooltipCost}&#10;${tooltipTokens}`;

            bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${barColor}" rx="2" opacity="0.8"><title>${tooltip}</title></rect>`;
            // Data label above bar (only for significant bars)
            if (dataLabel) {
                bars += `<text x="${x + barWidth/2}" y="${y - 2}" text-anchor="middle" fill="${barColor}" font-size="7" font-weight="600">${dataLabel}</text>`;
            }
            // Day label below bar
            bars += `<text x="${x + barWidth/2}" y="${height - 2}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="8">${dayLabel}</text>`;
        }

        return `<svg width="${width}" height="${height}" style="width:100%;">${bars}</svg>`;
    }

    // Helper to get local date string (YYYY-MM-DD) without timezone issues
    private getLocalDateString(date: Date = new Date()): string {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    private getActivityHeatmap(data: UsageData): string {
        // Generate GitHub-style activity heatmap for last 90 days
        const cellSize = 12;     // Slightly larger cells
        const cellGap = 2;
        const cols = 13;
        const rows = 7;
        const leftPadding = 16;  // Space for day labels (S, M, T, etc.)
        const topPadding = 16;   // Space for month labels

        const today = new Date();
        today.setHours(12, 0, 0, 0); // Use noon to avoid DST issues

        // Build a map of date -> message count
        const activityMap: { [date: string]: number } = {};
        let maxMessages = 0;
        for (const day of data.dailyHistory) {
            activityMap[day.date] = day.messages;
            if (day.messages > maxMessages) maxMessages = day.messages;
        }

        // Generate cells for last 91 days
        const cells: string[] = [];
        const monthLabels: string[] = [];
        const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];  // All 7 days
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Calculate start date (go back to the Sunday 13 weeks ago)
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - ((cols - 1) * 7 + today.getDay()));

        // Track which months we've labeled
        const labeledMonths = new Set<string>();

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                const cellDate = new Date(startDate);
                cellDate.setDate(cellDate.getDate() + col * 7 + row);

                if (cellDate > today) continue;

                const dateStr = this.getLocalDateString(cellDate);
                const messages = activityMap[dateStr] || 0;

                // Add month label at start of month (when day is 1-7 and it's Sunday row=0)
                if (row === 0) {
                    const monthKey = `${cellDate.getFullYear()}-${cellDate.getMonth()}`;
                    const dayOfMonth = cellDate.getDate();
                    if (dayOfMonth <= 7 && !labeledMonths.has(monthKey)) {
                        labeledMonths.add(monthKey);
                        const x = leftPadding + col * (cellSize + cellGap);
                        monthLabels.push(`<text x="${x}" y="10" font-size="9" fill="var(--vscode-descriptionForeground)">${months[cellDate.getMonth()]}</text>`);
                    }
                }

                // Calculate intensity (0-4 levels)
                let level = 0;
                if (maxMessages > 0 && messages > 0) {
                    const ratio = messages / maxMessages;
                    if (ratio > 0.75) level = 4;
                    else if (ratio > 0.5) level = 3;
                    else if (ratio > 0.25) level = 2;
                    else level = 1;
                }

                const colors = [
                    '#21262d',  // 0: no activity - visible dark gray
                    '#0e4429',  // 1: low
                    '#006d32',  // 2: medium-low
                    '#26a641',  // 3: medium-high
                    '#39d353'   // 4: high
                ];

                const x = leftPadding + col * (cellSize + cellGap);
                const y = topPadding + row * (cellSize + cellGap);

                // Format tooltip with readable date
                const tooltipDate = `${months[cellDate.getMonth()]} ${cellDate.getDate()}`;
                cells.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${colors[level]}"><title>${tooltipDate}: ${messages.toLocaleString()} msgs</title></rect>`);
            }
        }

        // Add day labels for all 7 days (S, M, T, W, T, F, S)
        const labels: string[] = [];
        for (let row = 0; row < rows; row++) {
            const y = topPadding + row * (cellSize + cellGap) + cellSize - 3;
            labels.push(`<text x="0" y="${y}" font-size="9" fill="var(--vscode-descriptionForeground)">${dayLabels[row]}</text>`);
        }

        const width = leftPadding + cols * (cellSize + cellGap);
        const height = topPadding + rows * (cellSize + cellGap);

        return `<svg width="${width}" height="${height}" style="display:block;margin:0 auto;">${monthLabels.join('')}${labels.join('')}${cells.join('')}</svg>`;
    }

    private getModelPieChart(data: UsageData): string {
        if (data.models.length === 0) return '';

        const size = 100;
        const cx = size / 2;
        const cy = size / 2;
        const r = 35;

        let paths = '';
        let startAngle = 0;

        for (const model of data.models) {
            const angle = (model.percentage / 100) * 360;
            const endAngle = startAngle + angle;

            const x1 = cx + r * Math.cos((startAngle - 90) * Math.PI / 180);
            const y1 = cy + r * Math.sin((startAngle - 90) * Math.PI / 180);
            const x2 = cx + r * Math.cos((endAngle - 90) * Math.PI / 180);
            const y2 = cy + r * Math.sin((endAngle - 90) * Math.PI / 180);

            const largeArc = angle > 180 ? 1 : 0;

            if (angle > 0.5) {
                paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${model.color}"><title>${model.name}: ${model.percentage.toFixed(1)}%</title></path>`;
            }

            startAngle = endAngle;
        }

        return `<svg width="${size}" height="${size}" style="display:block;margin:0 auto;">${paths}</svg>`;
    }

    private getOverviewTab(data: UsageData): string {
        const barChart = this.getBarChartSvg(data, this._chartView);
        const pieChart = this.getModelPieChart(data);

        return `
            <!-- API Cost Hero -->
            <div class="section">
                <div class="hero">
                    <div class="hero-value">${this.formatCost(data.allTime.cost)}</div>
                    <div class="hero-label">API Cost (Lifetime)</div>
                    <div class="hero-sublabel">Equivalent API pricing</div>
                </div>
            </div>

            <!-- Today Section -->
            <div class="section">
                <div class="section-header-bar today">Today</div>
                <div class="stat-row">
                    <div class="stat-box">
                        <div class="stat-value today">${this.formatCost(data.today.cost)}</div>
                        <div class="stat-label">Cost</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value messages">${this.formatNumberCompact(data.today.messages)}</div>
                        <div class="stat-label">Messages</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value tokens">${this.formatNumberCompact(data.today.tokens)}</div>
                        <div class="stat-label">Tokens</div>
                    </div>
                </div>
            </div>

            <!-- Lifetime Section -->
            <div class="section">
                <div class="section-header-bar lifetime">Lifetime</div>
                <div class="stat-row">
                    <div class="stat-box">
                        <div class="stat-value messages">${this.formatNumberCompact(data.allTime.messages)}</div>
                        <div class="stat-label">Messages</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value tokens">${this.formatNumberCompact(data.allTime.tokens)}</div>
                        <div class="stat-label">Tokens</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${data.allTime.sessions}</div>
                        <div class="stat-label">Sessions</div>
                    </div>
                </div>
            </div>
            <!-- Daily Activity Chart -->
            ${barChart ? `
            <div class="section">
                <div class="section-header">
                    <div class="section-title">${this._chartView === 'messages' ? 'Daily Messages' : this._chartView === 'cost' ? 'Daily Cost' : 'Daily Tokens'} (14 days)</div>
                    <div class="chart-toggle">
                        <button class="toggle-btn ${this._chartView === 'messages' ? 'active' : ''}" data-view="messages" style="--toggle-color: #ff8800" title="Messages">💬</button>
                        <button class="toggle-btn ${this._chartView === 'cost' ? 'active' : ''}" data-view="cost" style="--toggle-color: #2ed573" title="Cost">💰</button>
                        <button class="toggle-btn ${this._chartView === 'tokens' ? 'active' : ''}" data-view="tokens" style="--toggle-color: #3498db" title="Tokens">🔢</button>
                    </div>
                </div>
                <div class="chart-container">${barChart}</div>
            </div>` : ''}

            <!-- Models Pie Chart -->
            <div class="section">
                <div class="section-title">Models</div>
                ${pieChart}
                <div class="model-legend">
                    ${data.models.map(m => `
                        <div class="model-tag">
                            <span class="model-dot" style="background: ${m.color}"></span>
                            ${m.name} ${m.percentage.toFixed(0)}%
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Quick Fun Stats -->
            <div class="section">
                <div class="section-title">Quick Stats</div>
                <div class="fun-grid">
                    <div class="fun-item">
                        <div class="fun-value">${data.funStats.streak}</div>
                        <div class="fun-label">Day Streak</div>
                    </div>
                    <div class="fun-item">
                        <div class="fun-value">${this.formatCost(data.funStats.avgDayCost)}</div>
                        <div class="fun-label">Avg/Day</div>
                    </div>
                </div>
            </div>
        `;
    }

    private getCostTab(data: UsageData): string {
        const trendArrow = data.funStats.costTrend === 'up' ? '📈' :
                          data.funStats.costTrend === 'down' ? '📉' : '➡️';

        return `
            <!-- Cost Overview -->
            <div class="section">
                <div class="hero">
                    <div class="hero-value">${this.formatCost(data.allTime.cost)}</div>
                    <div class="hero-label">API Cost (Lifetime)</div>
                    <div class="hero-sublabel">Equivalent per-token API pricing</div>
                </div>
            </div>

            <!-- Today vs Yesterday -->
            <div class="section">
                <div class="section-title">Today</div>
                <div class="stat-row">
                    <div class="stat-box">
                        <div class="stat-value" style="color: #2ed573">${this.formatCost(data.today.cost)}</div>
                        <div class="stat-label">Today's Cost</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="color: #3498db">${this.formatCostOrNA(data.funStats.yesterdayCost)}</div>
                        <div class="stat-label">Yesterday</div>
                    </div>
                </div>
            </div>

            <!-- Cost Insights -->
            <div class="section">
                <div class="section-title">Cost Insights</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>${trendArrow} 7-Day Trend</span>
                        <span class="info-value">${data.funStats.costTrend}</span>
                    </div>
                    <div class="info-row">
                        <span>🏆 Highest Day</span>
                        <span class="info-value">${this.formatCost(data.funStats.highestDayCost)}</span>
                    </div>
                    <div class="info-row">
                        <span>📊 Average/Day</span>
                        <span class="info-value">${this.formatCost(data.funStats.avgDayCost)}</span>
                    </div>
                    <div class="info-row">
                        <span>🔮 Projected/Month</span>
                        <span class="info-value">${this.formatCost(data.funStats.projectedMonthlyCost)}</span>
                    </div>
                </div>
            </div>

            <!-- Cache Savings -->
            <div class="section">
                <div class="section-title">Cache Efficiency</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>📊 Cache Hit Ratio</span>
                        <span class="info-value">${data.funStats.cacheHitRatio}%</span>
                    </div>
                    <div class="info-row">
                        <span>💰 Cache Savings</span>
                        <span class="info-value" style="color: #2ed573">${this.formatCost(data.funStats.cacheSavings)}</span>
                    </div>
                    <div class="info-row">
                        <span>🗄️ Cached Tokens</span>
                        <span class="info-value">${this.formatNumberCompact(data.allTime.cacheTokens)}</span>
                    </div>
                </div>
            </div>

            <!-- Cost by Model -->
            <div class="section">
                <div class="section-title">Cost by Model</div>
                ${data.models.map(m => `
                    <div class="info-row">
                        <span><span class="model-dot" style="background: ${m.color}; display: inline-block"></span> ${m.name}</span>
                        <span class="info-value">${m.percentage.toFixed(1)}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private getMessagesTab(data: UsageData): string {
        const cs = data.conversationStats;

        return `
            <!-- Message Overview -->
            <div class="section">
                <div class="hero">
                    <div class="hero-value">${this.formatNumberCompact(data.allTime.messages)}</div>
                    <div class="hero-label">Total Messages</div>
                </div>
                <div class="stat-row">
                    <div class="stat-box">
                        <div class="stat-value">${this.formatNumber(data.today.messages)}</div>
                        <div class="stat-label">Today</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${data.funStats.avgMessagesPerSession}</div>
                        <div class="stat-label">Avg/Session</div>
                    </div>
                </div>
            </div>

            <!-- Tokens Breakdown -->
            <div class="section">
                <div class="section-title">🔢 Tokens</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>🔢 Total Tokens</span>
                        <span class="info-value">${this.formatNumberCompact(data.allTime.tokens)}</span>
                    </div>
                    <div class="info-row">
                        <span>📊 Regular Tokens</span>
                        <span class="info-value">${this.formatNumberCompact(data.allTime.totalTokens)}</span>
                    </div>
                    <div class="info-row">
                        <span>🗄️ Cache Tokens</span>
                        <span class="info-value">${this.formatNumberCompact(data.allTime.cacheTokens)}</span>
                    </div>
                    <div class="info-row">
                        <span>📈 Avg/Message</span>
                        <span class="info-value">${this.formatNumberCompact(data.allTime.avgTokensPerMessage)}</span>
                    </div>
                </div>
            </div>

            <!-- Activity Patterns -->
            <div class="section">
                <div class="section-title">📊 Activity Patterns</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>🕐 Peak Hour</span>
                        <span class="info-value">${data.funStats.peakHour}</span>
                    </div>
                    <div class="info-row">
                        <span>🏆 Peak Day</span>
                        <span class="info-value">${data.funStats.peakDay.date}</span>
                    </div>
                    <div class="info-row">
                        <span>📈 Longest Session</span>
                        <span class="info-value">${this.formatNumber(data.funStats.longestSessionMessages)} msgs</span>
                    </div>
                    <div class="info-row">
                        <span>🦉 Night Owl</span>
                        <span class="info-value">${data.funStats.nightOwlScore}%</span>
                    </div>
                    <div class="info-row">
                        <span>🐦 Early Bird</span>
                        <span class="info-value">${data.funStats.earlyBirdScore}%</span>
                    </div>
                </div>
            </div>

            <!-- Request Types -->
            <div class="section">
                <div class="section-title">📋 Request Types</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>✨ Features</span>
                        <span class="info-value">${this.formatNumber(cs.requestTypes.features)}</span>
                    </div>
                    <div class="info-row">
                        <span>🔧 Debug</span>
                        <span class="info-value">${this.formatNumber(cs.requestTypes.debugging)}</span>
                    </div>
                    <div class="info-row">
                        <span>📖 Explain</span>
                        <span class="info-value">${this.formatNumber(cs.requestTypes.explain)}</span>
                    </div>
                    <div class="info-row">
                        <span>👀 Review</span>
                        <span class="info-value">${this.formatNumber(cs.requestTypes.review)}</span>
                    </div>
                    <div class="info-row">
                        <span>🔄 Refactor</span>
                        <span class="info-value">${this.formatNumber(cs.requestTypes.refactor)}</span>
                    </div>
                    <div class="info-row">
                        <span>🧪 Testing</span>
                        <span class="info-value">${this.formatNumber(cs.requestTypes.testing)}</span>
                    </div>
                </div>
            </div>

            <!-- Recent Sessions -->
            <div class="section">
                <div class="section-title">📂 Recent Sessions</div>
                ${data.recentSessions.length > 0 ? `
                <div class="session-list">
                    ${data.recentSessions.map(s => `
                        <div class="session-item">
                            <div class="session-header">
                                <span class="session-project" title="${s.project}">${s.project}</span>
                                <span class="session-date">${s.date}</span>
                            </div>
                            <div class="session-stats">
                                <span>💬 ${s.messages}</span>
                                <span>🔢 ${this.formatNumberCompact(s.tokens)}</span>
                                <span>💰 ${this.formatCost(s.cost)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : '<span class="muted">No sessions found</span>'}
            </div>
        `;
    }

    // Achievement descriptions for tooltips
    private getAchievementDescription(achievement: string): string {
        const descriptions: { [key: string]: string } = {
            'Legend (10K+ msgs)': 'Sent over 10,000 messages to Claude',
            'Power User (1K+ msgs)': 'Sent over 1,000 messages to Claude',
            'Getting Started': 'Sent your first 100 messages',
            'Polite Programmer': 'Uses "please" and "thanks" frequently',
            'Night Owl': '30%+ of activity between 9PM-4AM',
            'Early Bird': '30%+ of activity between 5AM-8AM',
            'Code Machine': 'Shared over 10,000 lines of code',
            'Prolific Coder': 'Shared over 1,000 lines of code',
            'Potty Mouth': 'Used 100+ colorful words',
            'Chill Vibes': 'Stays calm under pressure (low frustration)',
            'Celebrator': 'Celebrated 20+ coding wins',
            'Week Streak': 'Used Claude 7+ days in a row',
            'Month Streak': 'Used Claude 30+ days in a row',
            'Cache Master': 'Achieved 90%+ cache hit ratio',
            'Token Titan (1B+)': 'Used over 1 billion tokens',
            '$1K Club': 'Spent $1,000+ on Claude',
            '$5K Spender': 'Spent $5,000+ on Claude',
            '$10K Whale': 'Spent $10,000+ on Claude',
            'Refactor King': 'Requested 50+ code refactors',
            'Refactor Pro': 'Requested 20+ code refactors',
            'Weekend Warrior': '50%+ of activity on weekends'
        };
        return descriptions[achievement] || achievement;
    }

    // Get emoji icon for achievement
    private getAchievementIcon(achievement: string): string {
        const icons: { [key: string]: string } = {
            'Legend (10K+ msgs)': '🏆',
            'Power User (1K+ msgs)': '⭐',
            'Getting Started': '🌱',
            'Polite Programmer': '🎩',
            'Night Owl': '🦉',
            'Early Bird': '🐦',
            'Code Machine': '💻',
            'Prolific Coder': '⌨️',
            'Potty Mouth': '🤬',
            'Chill Vibes': '😎',
            'Celebrator': '🎉',
            'Week Streak': '🔥',
            'Month Streak': '🔥',
            'Cache Master': '💰',
            'Token Titan (1B+)': '🪙',
            '$1K Club': '💵',
            '$5K Spender': '💎',
            '$10K Whale': '👑',
            'Refactor King': '🔄',
            'Refactor Pro': '🔧',
            'Weekend Warrior': '🎮'
        };
        return icons[achievement] || '🏅';
    }

    private getPersonalityTab(data: UsageData): string {
        const cs = data.conversationStats;
        const fs = data.funStats;

        // Get top language
        const topLang = Object.entries(cs.topLanguages)
            .sort((a, b) => b[1] - a[1])[0];
        const topLangStr = topLang ? `${topLang[0]} (${topLang[1]})` : 'None';

        // Sentiment analysis
        const sentTotal = cs.sentiment.positive + cs.sentiment.negative;
        const positivityPct = sentTotal > 0 ? Math.round((cs.sentiment.positive / sentTotal) * 100) : 50;

        const heatmap = this.getActivityHeatmap(data);

        return `
            <!-- Achievements -->
            <div class="section">
                <div class="section-title">🏅 Achievements</div>
                <div class="achievements">
                    ${fs.achievements.length > 0
                        ? fs.achievements.map(a => `<span class="achievement-badge" title="${this.getAchievementDescription(a)}">${this.getAchievementIcon(a)} ${a}</span>`).join('')
                        : '<span class="muted">Keep coding to unlock achievements!</span>'}
                </div>
            </div>

            <!-- Activity Heatmap -->
            <div class="section">
                <div class="section-title">📅 Activity (Last 90 Days)</div>
                <div class="heatmap-container">
                    ${heatmap}
                </div>
                <div class="heatmap-legend">
                    <span>Less</span>
                    <div class="heatmap-scale">
                        <div class="heatmap-cell" style="background: #21262d"></div>
                        <div class="heatmap-cell" style="background: #0e4429"></div>
                        <div class="heatmap-cell" style="background: #006d32"></div>
                        <div class="heatmap-cell" style="background: #26a641"></div>
                        <div class="heatmap-cell" style="background: #39d353"></div>
                    </div>
                    <span>More</span>
                </div>
            </div>

            <!-- Personality Profile -->
            <div class="section">
                <div class="section-title">🧠 Personality Profile</div>
                <div class="personality-grid">
                    <div class="personality-item">
                        <div class="personality-icon">🎩</div>
                        <div class="personality-content">
                            <div class="personality-header">
                                <span class="personality-label">Politeness</span>
                                <span class="personality-detail">${this.formatNumber(cs.pleaseCount + cs.thanksCount)} phrases</span>
                            </div>
                            <div class="personality-bar">
                                <div class="personality-fill" style="width: ${Math.min(100, fs.politenessScore * 10)}%; background: #2ed573"></div>
                            </div>
                        </div>
                    </div>
                    <div class="personality-item">
                        <div class="personality-icon">😤</div>
                        <div class="personality-content">
                            <div class="personality-header">
                                <span class="personality-label">Frustration</span>
                                <span class="personality-detail">${fs.frustrationIndex < 1 ? 'Very calm' : fs.frustrationIndex < 3 ? 'Mostly calm' : fs.frustrationIndex < 5 ? 'Moderate' : 'Frustrated'}</span>
                            </div>
                            <div class="personality-bar">
                                <div class="personality-fill" style="width: ${Math.min(100, fs.frustrationIndex * 20)}%; background: #ff4757"></div>
                            </div>
                        </div>
                    </div>
                    <div class="personality-item">
                        <div class="personality-icon">🤔</div>
                        <div class="personality-content">
                            <div class="personality-header">
                                <span class="personality-label">Curiosity</span>
                                <span class="personality-detail">${this.formatNumber(cs.questionsAsked)} questions</span>
                            </div>
                            <div class="personality-bar">
                                <div class="personality-fill" style="width: ${Math.min(100, fs.curiosityScore * 10)}%; background: #f39c12"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Expression Stats -->
            <div class="section">
                <div class="section-title">💬 Expression</div>
                <div class="stat-grid">
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.curseWords)}</div>
                        <div class="stat-mini-label">🤬 Curses</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.questionsAsked)}</div>
                        <div class="stat-mini-label">❓ Questions</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.pleaseCount)}</div>
                        <div class="stat-mini-label">🙏 Please</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.thanksCount)}</div>
                        <div class="stat-mini-label">💕 Thanks</div>
                    </div>
                </div>
            </div>

            <!-- Mood & Sentiment -->
            <div class="section">
                <div class="section-title">😊 Mood & Sentiment</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>Positivity</span>
                        <div class="mini-bar">
                            <div class="mini-bar-fill" style="width: ${positivityPct}%; background: #2ed573"></div>
                        </div>
                        <span class="info-value">${positivityPct}%</span>
                    </div>
                </div>
                <div class="stat-grid" style="margin-top: 8px">
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.sentiment.confused)}</div>
                        <div class="stat-mini-label">😵 Confused</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.sentiment.urgent)}</div>
                        <div class="stat-mini-label">🚨 Urgent</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.capsLockMessages)}</div>
                        <div class="stat-mini-label">😱 CAPS</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${this.formatNumber(cs.celebrationMoments)}</div>
                        <div class="stat-mini-label">🎉 Celebrate</div>
                    </div>
                </div>
            </div>

            <!-- Coding Activity -->
            <div class="section">
                <div class="section-title">💻 Coding Activity</div>
                <div class="info-list">
                    <div class="info-row">
                        <span>📦 Code Blocks</span>
                        <span class="info-value">${this.formatNumber(cs.codeBlocks)}</span>
                    </div>
                    <div class="info-row">
                        <span>📝 Lines of Code</span>
                        <span class="info-value">${this.formatNumber(cs.linesOfCode)}</span>
                    </div>
                    <div class="info-row">
                        <span>🏆 Top Language</span>
                        <span class="info-value">${topLangStr}</span>
                    </div>
                    <div class="info-row">
                        <span>📊 Total Words</span>
                        <span class="info-value">${this.formatNumber(cs.totalWords)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    private getHtmlContent(data: UsageData): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Theme-aware color variables */
        :root {
            --color-cost: var(--vscode-terminal-ansiGreen, #2ed573);
            --color-today: var(--vscode-terminal-ansiCyan, #00cec9);
            --color-messages: var(--vscode-terminal-ansiBlue, #3498db);
            --color-tokens: var(--vscode-terminal-ansiMagenta, #9b59b6);
            --color-accent: var(--vscode-textLink-foreground, #ff8800);
            --color-streak: var(--vscode-terminal-ansiCyan, #00cec9);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            padding: 0;
        }

        /* Tab Navigation */
        .tab-nav {
            display: flex;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .tab-btn {
            flex: 1;
            padding: 8px 4px;
            border: none;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }
        .tab-btn:hover {
            color: var(--vscode-foreground);
            background: var(--vscode-list-hoverBackground);
        }
        .tab-btn.active {
            color: var(--color-accent);
            border-bottom-color: var(--color-accent);
            font-weight: 600;
        }

        /* Tab Content */
        .tab-content {
            padding: 10px;
        }
        .tab-pane {
            display: none;
        }
        .tab-pane.active {
            display: block;
        }

        /* Sections */
        .section {
            background: var(--vscode-editor-background);
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 10px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }

        /* Hero */
        .hero {
            text-align: center;
            padding: 12px 8px;
        }
        .hero-value {
            font-size: 28px;
            font-weight: 700;
            color: var(--color-cost);
        }
        .hero-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        .hero-sublabel {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            margin-top: 4px;
        }

        /* Section Headers */
        .section-header-bar {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 6px 10px;
            margin: -10px -10px 10px -10px;
            border-radius: 8px 8px 0 0;
        }
        .section-header-bar.today {
            background: rgba(0, 206, 201, 0.15);
            color: var(--color-streak);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .section-header-bar.lifetime {
            background: rgba(128, 128, 128, 0.1);
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        /* Stats */
        .stat-row {
            display: flex;
            gap: 6px;
        }
        .stat-box {
            flex: 1;
            text-align: center;
            padding: 8px 4px;
            background: var(--vscode-sideBar-background);
            border-radius: 6px;
        }
        .stat-value {
            font-size: 14px;
            font-weight: 600;
            color: var(--color-accent);
        }
        .stat-value.cost { color: var(--color-cost); }
        .stat-value.today { color: var(--color-today); }
        .stat-value.messages { color: var(--color-messages); }
        .stat-value.tokens { color: var(--color-tokens); }
        .stat-label {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }

        /* Info Lists */
        .info-list { }
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 11px;
            gap: 8px;
        }
        .info-row:last-child { border-bottom: none; }
        .info-value {
            font-weight: 600;
            color: var(--vscode-foreground);
            white-space: nowrap;
        }

        /* Mini Progress Bars */
        .mini-bar {
            flex: 1;
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
            margin: 0 8px;
        }
        .mini-bar-fill {
            height: 100%;
            border-radius: 2px;
        }

        /* Limits */
        .limit-item { margin-bottom: 8px; }
        .limit-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
            font-size: 11px;
        }
        .progress-bar {
            height: 6px;
            background: var(--vscode-progressBar-background);
            border-radius: 3px;
            overflow: hidden;
        }
        .progress-fill { height: 100%; border-radius: 3px; }

        /* Models */
        .model-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: center;
            margin-top: 8px;
        }
        .model-tag {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            padding: 2px 6px;
            background: var(--vscode-sideBar-background);
            border-radius: 10px;
        }
        .model-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        /* Fun Stats Grid */
        .fun-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }
        .fun-item {
            text-align: center;
            padding: 6px;
            background: var(--vscode-sideBar-background);
            border-radius: 6px;
        }
        .fun-value {
            font-size: 14px;
            font-weight: 600;
            color: var(--color-tokens);
        }
        .fun-label {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
        }

        /* Mini Stats Grid */
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
        }
        .stat-mini {
            text-align: center;
            padding: 4px;
            background: var(--vscode-sideBar-background);
            border-radius: 4px;
        }
        .stat-mini-value {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-tokens);
        }
        .stat-mini-label {
            font-size: 8px;
            color: var(--vscode-descriptionForeground);
        }

        /* Achievements */
        .achievements {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .achievement-badge {
            font-size: 10px;
            padding: 3px 8px;
            background: var(--vscode-badge-background, rgba(255,255,255,0.1));
            color: var(--vscode-badge-foreground, var(--vscode-foreground));
            border-radius: 12px;
            font-weight: 500;
            border: 1px solid var(--vscode-panel-border);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .achievement-badge:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .muted {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 11px;
        }

        /* Chart */
        .chart-container { margin: 8px 0; }
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .section-header .section-title {
            margin-bottom: 0;
        }
        .chart-toggle {
            display: flex;
            gap: 4px;
        }
        .toggle-btn {
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 4px;
            background: var(--vscode-sideBar-background);
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.5;
            transition: all 0.2s;
        }
        .toggle-btn:hover {
            opacity: 0.8;
        }
        .toggle-btn.active {
            opacity: 1;
            background: var(--toggle-color, #ff8800);
            box-shadow: 0 0 4px var(--toggle-color, #ff8800);
        }

        /* Personality Cards - Compact */
        .personality-grid {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .personality-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--vscode-sideBar-background);
            border-radius: 4px;
            padding: 6px 8px;
        }
        .personality-icon {
            font-size: 16px;
            flex-shrink: 0;
        }
        .personality-content {
            flex: 1;
            min-width: 0;
        }
        .personality-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 3px;
        }
        .personality-label {
            font-size: 10px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .personality-detail {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
        }
        .personality-bar {
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
        }
        .personality-fill {
            height: 100%;
            border-radius: 2px;
        }

        /* Buttons */
        .btn-row {
            display: flex;
            gap: 8px;
        }
        .btn {
            flex: 1;
            padding: 8px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            background: #ff8800;
            color: #000;
        }
        .btn:hover { opacity: 0.9; }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        /* Session List */
        .session-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .session-item {
            background: var(--vscode-sideBar-background);
            border-radius: 4px;
            padding: 6px 8px;
        }
        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .session-project {
            font-size: 10px;
            font-weight: 600;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 120px;
        }
        .session-date {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
        }
        .session-stats {
            display: flex;
            gap: 8px;
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
        }
        .session-stats span {
            white-space: nowrap;
        }

        /* Heatmap */
        .heatmap-container {
            padding: 4px 0;
            overflow-x: auto;
        }
        .heatmap-legend {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 4px;
            margin-top: 6px;
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
        }
        .heatmap-scale {
            display: flex;
            gap: 2px;
        }
        .heatmap-cell {
            width: 8px;
            height: 8px;
            border-radius: 2px;
        }

        /* Data Source Disclaimer */
        .data-disclaimer {
            text-align: center;
            padding: 8px 10px;
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .data-disclaimer a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .data-disclaimer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <!-- Tab Navigation -->
    <div class="tab-nav">
        <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
        <button class="tab-btn ${this._activeTab === 'cost' ? 'active' : ''}" data-tab="cost">Cost</button>
        <button class="tab-btn ${this._activeTab === 'messages' ? 'active' : ''}" data-tab="messages">Messages</button>
        <button class="tab-btn ${this._activeTab === 'personality' ? 'active' : ''}" data-tab="personality">Personality</button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
        <div class="tab-pane ${this._activeTab === 'overview' ? 'active' : ''}" id="overview">
            ${this.getOverviewTab(data)}
        </div>
        <div class="tab-pane ${this._activeTab === 'cost' ? 'active' : ''}" id="cost">
            ${this.getCostTab(data)}
        </div>
        <div class="tab-pane ${this._activeTab === 'messages' ? 'active' : ''}" id="messages">
            ${this.getMessagesTab(data)}
        </div>
        <div class="tab-pane ${this._activeTab === 'personality' ? 'active' : ''}" id="personality">
            ${this.getPersonalityTab(data)}
        </div>
    </div>

    <!-- Action Button -->
    <div style="padding: 0 10px 10px 10px;">
        <button class="btn btn-secondary" style="width:100%" onclick="vscode.postMessage({command:'export'})">Export Data</button>
    </div>

    <!-- Data Source Disclaimer -->
    <div class="data-disclaimer">
        Data from Claude Code cache (~/.claude/stats-cache.json)
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;

                // Update button states
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update pane visibility
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                document.getElementById(tab).classList.add('active');

                // Notify extension
                vscode.postMessage({ command: 'switchTab', tab });
            });
        });

        // Chart view toggle
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                vscode.postMessage({ command: 'switchChartView', view });
            });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setTab') {
                const btn = document.querySelector(\`[data-tab="\${message.tab}"]\`);
                if (btn) btn.click();
            }
        });
    </script>
</body>
</html>`;
    }
}
