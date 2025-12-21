import * as vscode from 'vscode';
import { DashboardViewProvider } from './dashboardView';
import { StatusBarManager } from './statusBar';

let statusBarManager: StatusBarManager;
let dashboardProvider: DashboardViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Usage Analytics is now active');

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

    // Initial status bar update
    statusBarManager.refresh();

    // Auto-refresh every 2 minutes for more responsive updates
    const refreshInterval = setInterval(() => {
        statusBarManager.refresh();
        dashboardProvider.refresh();
    }, 2 * 60 * 1000);

    context.subscriptions.push({
        dispose: () => clearInterval(refreshInterval)
    });
}

export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
