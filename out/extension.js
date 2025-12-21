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
let statusBarManager;
let dashboardProvider;
function activate(context) {
    console.log('Claude Usage Analytics is now active');
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
function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
//# sourceMappingURL=extension.js.map