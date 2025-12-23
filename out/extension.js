"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const dashboardView_1 = require("./dashboardView");
const statusBar_1 = require("./statusBar");
const dataProvider_1 = require("./dataProvider");
const database_1 = require("./database");
let statusBarManager;
let dashboardProvider;
let lastAlertDate = '';
let lastAlertedAmount = 0;
async function activate(context) {
    console.log('Claude Usage Analytics is now active');
    // Initialize database and import any cached data
    (0, dataProvider_1.initializeDataWithDatabase)().then(result => {
        if (result.imported > 0) {
            vscode.window.showInformationMessage(`Claude Analytics: Imported ${result.imported} days of historical data.`);
        }
    }).catch(err => {
        console.error('Failed to initialize database:', err);
    });
    // Create the sidebar webview provider
    dashboardProvider = new dashboardView_1.DashboardViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('claudeUsage.dashboard', dashboardProvider));
    // Create status bar items
    statusBarManager = new statusBar_1.StatusBarManager();
    context.subscriptions.push(statusBarManager);
    // Register refresh command
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.refresh', () => {
        dashboardProvider.refresh();
        statusBarManager.refresh();
    }));
    // Register open web dashboard command
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.openWebDashboard', () => {
        const terminal = vscode.window.createTerminal('Claude Usage Web');
        terminal.sendText('ccu web');
        terminal.show();
    }));
    // Register show panel command
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.showPanel', () => {
        // Focus the specific view directly
        vscode.commands.executeCommand('claudeUsage.dashboard.focus');
    }));
    // Register export command
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.exportData', async () => {
        const format = await vscode.window.showQuickPick([
            { label: 'JSON', description: 'Export as JSON file', value: 'json' },
            { label: 'CSV', description: 'Export as CSV file (daily stats)', value: 'csv' }
        ], { placeHolder: 'Select export format' });
        if (!format)
            return;
        try {
            const data = (0, dataProvider_1.getUsageData)();
            let content;
            let defaultExt;
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
            }
            else {
                // CSV format - daily history
                const headers = ['date', 'messages', 'tokens', 'cost'];
                const rows = data.dailyHistory.map(d => [d.date, d.messages, d.tokens, d.cost.toFixed(2)].join(','));
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
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to export usage data');
        }
    }));
    // Register tab-specific commands
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.showTab.overview', () => {
        vscode.commands.executeCommand('claudeUsage.dashboard.focus');
        dashboardProvider.switchTab('overview');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.showTab.cost', () => {
        vscode.commands.executeCommand('claudeUsage.dashboard.focus');
        dashboardProvider.switchTab('cost');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.showTab.messages', () => {
        vscode.commands.executeCommand('claudeUsage.dashboard.focus');
        dashboardProvider.switchTab('messages');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.showTab.personality', () => {
        vscode.commands.executeCommand('claudeUsage.dashboard.focus');
        dashboardProvider.switchTab('personality');
    }));
    // Register clear history command
    context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.clearHistory', async () => {
        const oldestDate = (0, database_1.getOldestDate)();
        if (!oldestDate) {
            vscode.window.showInformationMessage('No history data found to clear.');
            return;
        }
        // Show date picker options
        const options = [
            { label: 'Last 7 days', days: 7 },
            { label: 'Last 30 days', days: 30 },
            { label: 'Last 90 days', days: 90 },
            { label: 'Last 6 months', days: 180 },
            { label: 'Last year', days: 365 },
            { label: 'Custom date...', days: -1 }
        ];
        const selection = await vscode.window.showQuickPick(options.map(o => ({ label: `Keep ${o.label}`, description: o.days > 0 ? `Delete data older than ${o.days} days` : 'Enter a specific date', value: o.days })), { placeHolder: 'Select how much history to keep' });
        if (!selection)
            return;
        let cutoffDate;
        if (selection.value === -1) {
            // Custom date input
            const input = await vscode.window.showInputBox({
                prompt: 'Enter cutoff date (YYYY-MM-DD). All data BEFORE this date will be deleted.',
                placeHolder: 'e.g., 2025-01-01',
                validateInput: (value) => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        return 'Please enter date in YYYY-MM-DD format';
                    }
                    return null;
                }
            });
            if (!input)
                return;
            cutoffDate = input;
        }
        else {
            const date = new Date();
            date.setDate(date.getDate() - selection.value);
            cutoffDate = date.toISOString().split('T')[0];
        }
        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(`Delete all history before ${cutoffDate}? This cannot be undone.`, { modal: true }, 'Delete');
        if (confirm === 'Delete') {
            const deleted = (0, database_1.clearHistoryBeforeDate)(cutoffDate);
            if (deleted > 0) {
                vscode.window.showInformationMessage(`Deleted ${deleted} days of history.`);
                statusBarManager.refresh();
                dashboardProvider.refresh();
            }
            else {
                vscode.window.showInformationMessage('No data found before that date.');
            }
        }
    }));
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
    const threshold = config.get('costAlertThreshold', 0);
    if (threshold <= 0)
        return;
    try {
        const data = (0, dataProvider_1.getUsageData)();
        const today = new Date().toISOString().split('T')[0];
        const todayCost = data.today.cost;
        // Only alert once per day per threshold crossing
        if (todayCost >= threshold && (lastAlertDate !== today || todayCost > lastAlertedAmount + threshold)) {
            lastAlertDate = today;
            lastAlertedAmount = todayCost;
            vscode.window.showWarningMessage(`Claude Usage Alert: Today's cost ($${todayCost.toFixed(2)}) exceeded your $${threshold} threshold!`, 'View Dashboard').then(selection => {
                if (selection === 'View Dashboard') {
                    vscode.commands.executeCommand('claudeUsage.showTab.cost');
                }
            });
        }
    }
    catch (e) {
        // Silently ignore errors in cost alert check
    }
}
function deactivate() {
    // Close database connection and save any pending changes
    (0, database_1.closeDatabase)();
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
//# sourceMappingURL=extension.js.map