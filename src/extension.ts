import * as vscode from 'vscode';
import { DashboardViewProvider } from './dashboardView';
import { StatusBarManager } from './statusBar';
import { getUsageData, initializeDataWithDatabase } from './dataProvider';
import { closeDatabase } from './database';

let statusBarManager: StatusBarManager;
let dashboardProvider: DashboardViewProvider;
let lastAlertDate: string = '';
let lastAlertedAmount: number = 0;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Claude Usage Analytics is now active');

    // Initialize database and import any cached data
    initializeDataWithDatabase().then(result => {
        if (result.imported > 0) {
            vscode.window.showInformationMessage(
                `Claude Analytics: Imported ${result.imported} days of historical data.`
            );
        }
    }).catch(err => {
        console.error('Failed to initialize database:', err);
    });

    // Create the sidebar webview provider
    dashboardProvider = new DashboardViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'claudeUsage.dashboard',
            dashboardProvider
        )
    );

    // Create status bar items
    statusBarManager = new StatusBarManager();
    context.subscriptions.push(statusBarManager);

    // Register refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.refresh', () => {
            dashboardProvider.refresh();
            statusBarManager.refresh();
        })
    );

    // Register open web dashboard command
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.openWebDashboard', () => {
            const terminal = vscode.window.createTerminal('Claude Usage Web');
            terminal.sendText('ccu web');
            terminal.show();
        })
    );

    // Register show panel command
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.showPanel', () => {
            // Focus the specific view directly
            vscode.commands.executeCommand('claudeUsage.dashboard.focus');
        })
    );

    // Register export command
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.exportData', async () => {
            const format = await vscode.window.showQuickPick(
                [
                    { label: 'JSON', description: 'Export as JSON file', value: 'json' },
                    { label: 'CSV', description: 'Export as CSV file (daily stats)', value: 'csv' }
                ],
                { placeHolder: 'Select export format' }
            );

            if (!format) return;

            try {
                const data = getUsageData();
                let content: string;
                let defaultExt: string;

                if (format.value === 'json') {
                    content = JSON.stringify({
                        exportDate: new Date().toISOString(),
                        allTime: data.allTime,
                        today: data.today,
                        funStats: data.funStats,
                        conversationStats: data.conversationStats,
                        models: data.models,
                        dailyHistory: data.dailyHistory
                    }, null, 2);
                    defaultExt = 'json';
                } else {
                    // CSV format - daily history
                    const headers = ['date', 'messages', 'tokens', 'cost'];
                    const rows = data.dailyHistory.map(d =>
                        [d.date, d.messages, d.tokens, d.cost.toFixed(2)].join(',')
                    );
                    content = [headers.join(','), ...rows].join('\n');
                    defaultExt = 'csv';
                }

                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(`claude-usage-${new Date().toISOString().split('T')[0]}.${defaultExt}`),
                    filters: {
                        [format.label]: [defaultExt]
                    }
                });

                if (uri) {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                    vscode.window.showInformationMessage(`Claude usage data exported to ${uri.fsPath}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage('Failed to export usage data');
            }
        })
    );

    // Register tab-specific commands
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.showTab.overview', () => {
            vscode.commands.executeCommand('claudeUsage.dashboard.focus');
            dashboardProvider.switchTab('overview');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.showTab.cost', () => {
            vscode.commands.executeCommand('claudeUsage.dashboard.focus');
            dashboardProvider.switchTab('cost');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.showTab.messages', () => {
            vscode.commands.executeCommand('claudeUsage.dashboard.focus');
            dashboardProvider.switchTab('messages');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.showTab.personality', () => {
            vscode.commands.executeCommand('claudeUsage.dashboard.focus');
            dashboardProvider.switchTab('personality');
        })
    );

    // Initial status bar update (fast - uses cached data only)
    statusBarManager.refresh();

    // Auto-refresh every 2 minutes (status bar only - lightweight)
    const refreshInterval = setInterval(() => {
        statusBarManager.refresh();
        dashboardProvider.refresh();
        checkCostAlert();
    }, 2 * 60 * 1000);

    // Initial cost alert check
    setTimeout(() => checkCostAlert(), 5000);

    context.subscriptions.push({
        dispose: () => clearInterval(refreshInterval)
    });
}

function checkCostAlert() {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const threshold = config.get<number>('costAlertThreshold', 0);

    if (threshold <= 0) return;

    try {
        const data = getUsageData();
        const today = new Date().toISOString().split('T')[0];
        const todayCost = data.today.cost;

        // Only alert once per day per threshold crossing
        if (todayCost >= threshold && (lastAlertDate !== today || todayCost > lastAlertedAmount + threshold)) {
            lastAlertDate = today;
            lastAlertedAmount = todayCost;

            vscode.window.showWarningMessage(
                `Claude Usage Alert: Today's cost ($${todayCost.toFixed(2)}) exceeded your $${threshold} threshold!`,
                'View Dashboard'
            ).then(selection => {
                if (selection === 'View Dashboard') {
                    vscode.commands.executeCommand('claudeUsage.showTab.cost');
                }
            });
        }
    } catch (e) {
        // Silently ignore errors in cost alert check
    }
}

export function deactivate() {
    // Close database connection and save any pending changes
    closeDatabase();

    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
