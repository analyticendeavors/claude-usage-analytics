import * as vscode from 'vscode';
import { getUsageData, UsageData } from './dataProvider';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'claudeUsage.dashboard';
    private _view?: vscode.WebviewView;
    private _activeTab: string = 'overview';

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
            }
        });
    }

    public refresh() {
        if (this._view) {
            this.updateWebview();
        }
    }

    public switchTab(tab: string) {
        this._activeTab = tab;
        if (this._view) {
            this._view.webview.postMessage({ command: 'setTab', tab });
        }
    }

    private updateWebview() {
        if (!this._view) return;
        const data = getUsageData();
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

    private getBarChartSvg(data: UsageData): string {
        if (data.dailyHistory.length === 0) return '';

        const width = 280;
        const height = 80;
        const padding = 4;
        const barCount = Math.min(data.dailyHistory.length, 14);
        const barWidth = Math.max(12, (width - padding * 2) / barCount - 2);
        const maxMessages = Math.max(...data.dailyHistory.map(d => d.messages), 1);

        let bars = '';
        for (let i = 0; i < barCount; i++) {
            const d = data.dailyHistory[i];
            const barHeight = Math.max(2, (d.messages / maxMessages) * (height - 20));
            const x = padding + i * (barWidth + 2);
            const y = height - barHeight - 16;
            const dayLabel = d.date.slice(-2);

            bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#ff8800" rx="2" opacity="0.8"><title>${d.date}: ${d.messages} msgs</title></rect>`;
            bars += `<text x="${x + barWidth/2}" y="${height - 2}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="8">${dayLabel}</text>`;
        }

        return `<svg width="${width}" height="${height}" style="width:100%;">${bars}</svg>`;
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
        const getColor = (pct: number) => pct >= 90 ? '#ff4757' : pct >= 70 ? '#ffa502' : '#2ed573';
        const barChart = this.getBarChartSvg(data);
        const pieChart = this.getModelPieChart(data);

        return `
            <!-- Hero Stats -->
            <div class="section">
                <div class="hero">
                    <div class="hero-value">${this.formatCost(data.allTime.cost)}</div>
                    <div class="hero-label">Lifetime Cost</div>
                </div>
                <div class="stat-row">
                    <div class="stat-box">
                        <div class="stat-value">${this.formatCost(data.today.cost)}</div>
                        <div class="stat-label">Today</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${this.formatNumberCompact(data.allTime.messages)}</div>
                        <div class="stat-label">Messages</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${this.formatNumberCompact(data.allTime.tokens)}</div>
                        <div class="stat-label">Tokens</div>
                    </div>
                </div>
            </div>
            <!-- Daily Activity Chart -->
            ${barChart ? `
            <div class="section">
                <div class="section-title">Daily Activity (14 days)</div>
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
                        <div class="fun-value">${data.allTime.daysActive}</div>
                        <div class="fun-label">Days Active</div>
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
                    <div class="hero-label">Total Spent</div>
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
                        <div class="stat-value" style="color: #3498db">${this.formatCost(data.funStats.yesterdayCost)}</div>
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
                <div class="section-title">Tokens</div>
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
                <div class="section-title">Activity Patterns</div>
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
                <div class="section-title">Request Types</div>
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
        `;
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

        return `
            <!-- Achievements -->
            <div class="section">
                <div class="section-title">🏅 Achievements</div>
                <div class="achievements">
                    ${fs.achievements.length > 0
                        ? fs.achievements.map(a => `<span class="achievement-badge">${a}</span>`).join('')
                        : '<span class="muted">Keep coding to unlock achievements!</span>'}
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
            color: #ff8800;
            border-bottom-color: #ff8800;
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
            color: #2ed573;
        }
        .hero-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
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
            color: #ff8800;
        }
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
            color: #9b59b6;
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
            color: #9b59b6;
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
            font-size: 11px;
            padding: 3px 8px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: #fff;
            border-radius: 12px;
            font-weight: 500;
        }
        .muted {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 11px;
        }

        /* Chart */
        .chart-container { margin: 8px 0; }

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
        .btn {
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            margin-top: 6px;
            background: #ff8800;
            color: #000;
        }
        .btn:hover { opacity: 0.9; }
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

    <!-- Refresh Button -->
    <div style="padding: 0 10px 10px 10px;">
        <button class="btn" onclick="vscode.postMessage({command:'refresh'})">Refresh</button>
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
