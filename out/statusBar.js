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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
const dataProvider_1 = require("./dataProvider");
const limitsProvider_1 = require("./limitsProvider");
class StatusBarManager {
    constructor() {
        // Lifetime cost (leftmost) - opens Overview tab
        this.lifetimeCost = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 106);
        this.lifetimeCost.command = 'claudeUsage.showTab.overview';
        this.lifetimeCost.show();
        // Today's cost - opens Cost tab
        this.todayCost = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 105);
        this.todayCost.command = 'claudeUsage.showTab.cost';
        this.todayCost.show();
        // Messages count - opens Messages tab
        this.messages = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 104);
        this.messages.command = 'claudeUsage.showTab.messages';
        this.messages.show();
        // Tokens count - opens Messages tab
        this.tokens = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 103);
        this.tokens.command = 'claudeUsage.showTab.messages';
        this.tokens.show();
        // Personality stats - opens Personality tab
        this.personality = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
        this.personality.command = 'claudeUsage.showTab.personality';
        this.personality.show();
        // Activity stats - opens Personality tab
        this.activity = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
        this.activity.command = 'claudeUsage.showTab.personality';
        this.activity.show();
        // Limits (right side) - opens Overview tab
        this.limits = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.limits.command = 'claudeUsage.showTab.overview';
        this.limits.show();
    }
    formatCostScaled(cost) {
        if (cost >= 1000000) {
            return "$" + (cost / 1000000).toFixed(2) + "M";
        }
        else if (cost >= 1000) {
            return "$" + (cost / 1000).toFixed(1) + "k";
        }
        return "$" + cost.toFixed(2);
    }
    formatCostFull(cost) {
        return "$" + cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formatNumberScaled(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(2) + "B";
        }
        else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + "M";
        }
        else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        }
        return num.toString();
    }
    formatNumberFull(num) {
        return num.toLocaleString('en-US');
    }
    refresh() {
        try {
            const data = (0, dataProvider_1.getUsageData)();
            // Lifetime cost - scaled display, full on hover
            const trendArrow = data.funStats.costTrend === 'up' ? '📈' :
                data.funStats.costTrend === 'down' ? '📉' : '➡️';
            this.lifetimeCost.text = `$(graph) ${this.formatCostScaled(data.allTime.cost)}`;
            this.lifetimeCost.tooltip = new vscode.MarkdownString(`**Claude Lifetime Cost**\n\n` +
                `💰 All-time: ${this.formatCostFull(data.allTime.cost)}\n\n` +
                `---\n\n` +
                `📊 Sessions: ${this.formatNumberFull(data.allTime.sessions)}\n\n` +
                `📅 Days Active: ${data.allTime.daysActive}\n\n` +
                `📆 ${data.allTime.dateRange}\n\n` +
                `---\n\n` +
                `**Cost Insights**\n\n` +
                `${trendArrow} 7-day trend: ${data.funStats.costTrend}\n\n` +
                `🏆 Highest day: ${this.formatCostFull(data.funStats.highestDayCost)}\n\n` +
                `📊 Avg/day: ${this.formatCostFull(data.funStats.avgDayCost)}\n\n` +
                `🔮 Projected/month: ${this.formatCostFull(data.funStats.projectedMonthlyCost)}\n\n` +
                `---\n\n` +
                `_Click to open Overview_`);
            this.lifetimeCost.color = "#2ed573";
            // Today's cost - scaled display, full on hover
            const vsYesterday = data.funStats.yesterdayCost > 0
                ? ((data.today.cost - data.funStats.yesterdayCost) / data.funStats.yesterdayCost * 100).toFixed(0)
                : '0';
            const vsAvg = data.funStats.avgDayCost > 0
                ? ((data.today.cost - data.funStats.avgDayCost) / data.funStats.avgDayCost * 100).toFixed(0)
                : '0';
            this.todayCost.text = `$(calendar) ${this.formatCostScaled(data.today.cost)}`;
            this.todayCost.tooltip = new vscode.MarkdownString(`**Today's Usage**\n\n` +
                `💵 Cost: ${this.formatCostFull(data.today.cost)}\n\n` +
                `🔢 Tokens: ${this.formatNumberFull(data.today.tokens)}\n\n` +
                `💬 Messages: ${this.formatNumberFull(data.today.messages)}\n\n` +
                `---\n\n` +
                `**Comparisons**\n\n` +
                `📊 vs Yesterday: ${vsYesterday}%\n\n` +
                `📈 vs Average: ${vsAvg}%\n\n` +
                `🔥 Streak: ${data.funStats.streak} days\n\n` +
                `---\n\n` +
                `_Click to open Cost_`);
            this.todayCost.color = "#ffa502";
            // Messages - scaled display, full on hover
            this.messages.text = `$(comment-discussion) ${this.formatNumberScaled(data.allTime.messages)}`;
            this.messages.tooltip = new vscode.MarkdownString(`**Total Messages**\n\n` +
                `💬 ${this.formatNumberFull(data.allTime.messages)} messages\n\n` +
                `📊 Avg per session: ${this.formatNumberFull(data.funStats.avgMessagesPerSession)}\n\n` +
                `---\n\n` +
                `**Activity Patterns**\n\n` +
                `🕐 Peak hour: ${data.funStats.peakHour}\n\n` +
                `🏆 Peak day: ${data.funStats.peakDay.date} (${this.formatNumberFull(data.funStats.peakDay.messages)} msgs)\n\n` +
                `📈 Longest session: ${this.formatNumberFull(data.funStats.longestSessionMessages)} msgs\n\n` +
                `---\n\n` +
                `🦉 Night Owl: ${data.funStats.nightOwlScore}% | 🐦 Early Bird: ${data.funStats.earlyBirdScore}%\n\n` +
                `---\n\n` +
                `_Click to open Messages_`);
            this.messages.color = "#3498db";
            // Tokens - scaled display, full on hover
            this.tokens.text = `$(symbol-number) ${this.formatNumberScaled(data.allTime.tokens)}`;
            this.tokens.tooltip = new vscode.MarkdownString(`**Total Tokens**\n\n` +
                `🔢 All-time: ${this.formatNumberFull(data.allTime.tokens)} tokens\n\n` +
                `📅 Today: ${this.formatNumberFull(data.today.tokens)} tokens\n\n` +
                `💰 Avg cost: $${(data.allTime.cost / Math.max(data.allTime.tokens, 1) * 1000).toFixed(4)}/1K\n\n` +
                `---\n\n` +
                `**Cache Efficiency**\n\n` +
                `📊 Cache hit ratio: ${data.funStats.cacheHitRatio}%\n\n` +
                `💵 Cache savings: ${this.formatCostFull(data.funStats.cacheSavings)}\n\n` +
                `🗄️ Cached tokens: ${this.formatNumberScaled(data.allTime.cacheTokens)}\n\n` +
                `---\n\n` +
                `_Click to open Messages_`);
            this.tokens.color = "#9b59b6";
            // Conversation stats for both items
            const cs = data.conversationStats;
            const reqTypes = cs.requestTypes;
            // === PERSONALITY ITEM ===
            // Show politeness or dominant trait
            const politeness = data.funStats.politenessScore;
            const personalityEmoji = politeness > 80 ? "😇" : politeness > 60 ? "🎩" : politeness > 40 ? "😊" : politeness > 20 ? "😤" : "🤬";
            this.personality.text = `${personalityEmoji} ${politeness}%`;
            // Achievements - show first 3 or abbreviated
            const achievements = data.funStats.achievements;
            const achievementPreview = achievements.length > 3
                ? achievements.slice(0, 3).join(' ') + ` +${achievements.length - 3}`
                : achievements.length > 0 ? achievements.join(' ') : 'None yet!';
            this.personality.tooltip = new vscode.MarkdownString(`**🧠 Personality Profile**\n\n` +
                `---\n\n` +
                `**Traits**\n\n` +
                `🎩 Politeness: ${politeness}%\n\n` +
                `😤 Frustration: ${data.funStats.frustrationIndex}%\n\n` +
                `🤔 Curiosity: ${data.funStats.curiosityScore}%\n\n` +
                `---\n\n` +
                `**🏅 Achievements**\n\n` +
                `${achievementPreview}\n\n` +
                `---\n\n` +
                `**Expression Style**\n\n` +
                `🤬 Curse words: ${this.formatNumberFull(cs.curseWords)}\n\n` +
                `❓ Questions: ${this.formatNumberFull(cs.questionsAsked)}\n\n` +
                `❗ Exclamations: ${this.formatNumberFull(cs.exclamations)}\n\n` +
                `🙏 Please: ${this.formatNumberFull(cs.pleaseCount)}\n\n` +
                `💕 Thanks: ${this.formatNumberFull(cs.thanksCount)}\n\n` +
                `---\n\n` +
                `_Click to open Personality_`);
            this.personality.color = "#e056fd";
            // === ACTIVITY ITEM ===
            // Show code blocks count
            this.activity.text = `📊 ${this.formatNumberScaled(cs.codeBlocks)}`;
            // Get top language
            const topLang = Object.entries(cs.topLanguages)
                .sort((a, b) => b[1] - a[1])[0];
            const topLangStr = topLang ? `${topLang[0]} (${topLang[1]})` : 'None';
            // Get dominant request type
            const topReq = Object.entries(reqTypes)
                .sort((a, b) => b[1] - a[1])[0];
            const topReqStr = topReq ? `${topReq[0]} (${topReq[1]})` : 'None';
            // Sentiment summary
            const sentTotal = cs.sentiment.positive + cs.sentiment.negative;
            const positivityPct = sentTotal > 0 ? Math.round((cs.sentiment.positive / sentTotal) * 100) : 50;
            this.activity.tooltip = new vscode.MarkdownString(`**📊 Activity & Coding**\n\n` +
                `---\n\n` +
                `**Coding Stats**\n\n` +
                `📦 Code blocks: ${this.formatNumberFull(cs.codeBlocks)}\n\n` +
                `📝 Lines of code: ${this.formatNumberFull(cs.linesOfCode)}\n\n` +
                `🏆 Top language: ${topLangStr}\n\n` +
                `📊 Total words: ${this.formatNumberFull(cs.totalWords)}\n\n` +
                `---\n\n` +
                `**Request Types**\n\n` +
                `🔧 Debug: ${reqTypes.debugging} | ✨ Features: ${reqTypes.features}\n\n` +
                `📖 Explain: ${reqTypes.explain} | 🔄 Refactor: ${reqTypes.refactor}\n\n` +
                `👀 Review: ${reqTypes.review} | 🧪 Testing: ${reqTypes.testing}\n\n` +
                `🏆 Top: ${topReqStr}\n\n` +
                `---\n\n` +
                `**Mood & Sentiment**\n\n` +
                `😊 Positive: ${cs.sentiment.positive} | 😠 Negative: ${cs.sentiment.negative}\n\n` +
                `📈 Positivity: ${positivityPct}%\n\n` +
                `😱 CAPS RAGE: ${cs.capsLockMessages} | 😂 LOLs: ${cs.lolCount}\n\n` +
                `---\n\n` +
                `_Click to open Personality_`);
            this.activity.color = "#00d2d3";
            // Fetch limits asynchronously
            this.updateLimits();
        }
        catch (error) {
            this.lifetimeCost.text = "$(graph) Claude";
            this.todayCost.text = "";
            this.messages.text = "";
            this.tokens.text = "";
            this.personality.text = "";
            this.activity.text = "";
            this.limits.text = "";
        }
    }
    async updateLimits() {
        try {
            const subscription = await (0, limitsProvider_1.getSubscriptionInfo)();
            if (subscription.error) {
                this.limits.text = "$(pulse) N/A";
                this.limits.tooltip = "Claude Code credentials not found";
                this.limits.color = "#888888";
                return;
            }
            // Show tier info
            this.limits.text = `$(pulse) ${subscription.tierDisplay}`;
            this.limits.color = "#2ed573";
            const tooltipText = `**Subscription Tier**\n\n` +
                `📊 Plan: ${subscription.subscriptionType.charAt(0).toUpperCase() + subscription.subscriptionType.slice(1)}\n\n` +
                `⚡ Rate Limit: ${subscription.tierDisplay}\n\n` +
                `---\n\n` +
                `_Click to open Overview_`;
            this.limits.tooltip = new vscode.MarkdownString(tooltipText);
        }
        catch (error) {
            this.limits.text = "$(pulse) --";
            this.limits.tooltip = "Failed to read subscription info";
            this.limits.color = "#888888";
        }
    }
    dispose() {
        this.lifetimeCost.dispose();
        this.todayCost.dispose();
        this.messages.dispose();
        this.tokens.dispose();
        this.personality.dispose();
        this.activity.dispose();
        this.limits.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBar.js.map