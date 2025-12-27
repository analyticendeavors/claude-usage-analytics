import * as vscode from 'vscode';
import { getUsageData, UsageData, getDebugStats } from './dataProvider';
import { getSubscriptionInfo, SubscriptionData } from './limitsProvider';

export class StatusBarManager implements vscode.Disposable {
    private lifetimeCost: vscode.StatusBarItem;
    private todayCost: vscode.StatusBarItem;
    private messages: vscode.StatusBarItem;
    private tokens: vscode.StatusBarItem;
    private personality: vscode.StatusBarItem;
    private activity: vscode.StatusBarItem;
    private limits: vscode.StatusBarItem;

    constructor() {
        // Lifetime cost (leftmost) - opens Overview tab
        this.lifetimeCost = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            106
        );
        this.lifetimeCost.command = 'claudeUsage.showTab.overview';
        this.lifetimeCost.show();

        // Today's cost - opens Cost tab
        this.todayCost = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            105
        );
        this.todayCost.command = 'claudeUsage.showTab.cost';
        this.todayCost.show();

        // Messages count - opens Messages tab
        this.messages = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            104
        );
        this.messages.command = 'claudeUsage.showTab.messages';
        this.messages.show();

        // Tokens count - opens Messages tab
        this.tokens = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            103
        );
        this.tokens.command = 'claudeUsage.showTab.messages';
        this.tokens.show();

        // Personality stats - opens Personality tab
        this.personality = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            102
        );
        this.personality.command = 'claudeUsage.showTab.personality';
        this.personality.show();

        // Activity stats - opens Personality tab
        this.activity = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            101
        );
        this.activity.command = 'claudeUsage.showTab.personality';
        this.activity.show();

        // Limits (right side) - opens Overview tab
        this.limits = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.limits.command = 'claudeUsage.showTab.overview';
        this.limits.show();
    }

    private formatCostScaled(cost: number): string {
        if (cost >= 1000000) {
            return "$" + (cost / 1000000).toFixed(2) + "M";
        } else if (cost >= 1000) {
            return "$" + (cost / 1000).toFixed(1) + "k";
        }
        return "$" + cost.toFixed(2);
    }

    private formatCostFull(cost: number): string {
        return "$" + cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    private formatNumberScaled(num: number): string {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(2) + "B";
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        }
        return num.toString();
    }

    private formatNumberFull(num: number): string {
        return num.toLocaleString('en-US');
    }

    public refresh() {
        try {
            // Cache-only mode - always instant
            const data = getUsageData();

            // Read visibility settings
            const config = vscode.workspace.getConfiguration('claudeUsage');
            const showLifetimeCost = config.get<boolean>('showLifetimeCost', true);
            const showTodayCost = config.get<boolean>('showTodayCost', true);
            const showMessages = config.get<boolean>('showMessages', true);
            const showTokens = config.get<boolean>('showTokens', true);
            const showPersonality = config.get<boolean>('showPersonality', true);
            const showActivity = config.get<boolean>('showActivity', true);
            const showRateLimits = config.get<boolean>('showRateLimits', true);

            // Account Total cost - scaled display, full on hover
            const trendArrow = data.funStats.costTrend === 'up' ? '📈' :
                data.funStats.costTrend === 'down' ? '📉' : '➡️';
            const acct = data.accountTotal;
            const last14 = data.last14Days;
            this.lifetimeCost.text = `$(graph) ${this.formatCostScaled(acct.cost)}`;
            this.lifetimeCost.tooltip = new vscode.MarkdownString(
                `**Account Total (Lifetime)**\n\n` +
                `💰 Total: ${this.formatCostFull(acct.cost)}\n\n` +
                `🪙 Tokens: ${this.formatNumberFull(acct.tokens)}\n\n` +
                `💬 Messages: ${this.formatNumberFull(acct.messages)}\n\n` +
                `📊 Sessions: ${this.formatNumberFull(acct.sessions)}\n\n` +
                `---\n\n` +
                `**Last 14 Days**\n\n` +
                `${trendArrow} 7-day trend: ${data.funStats.costTrend}\n\n` +
                `📊 14-day avg: ${this.formatCostFull(last14.avgDayCost)}/day\n\n` +
                `🔮 Projected/month: ${this.formatCostFull(last14.avgDayCost * 30)}\n\n` +
                `---\n\n` +
                `_Click to open Overview_`
            );
            this.lifetimeCost.color = "#2ed573";
            showLifetimeCost ? this.lifetimeCost.show() : this.lifetimeCost.hide();

            // Today's cost - scaled display, full on hover
            const vsYesterdayNum = data.funStats.yesterdayCost > 0
                ? Math.round((data.today.cost - data.funStats.yesterdayCost) / data.funStats.yesterdayCost * 100)
                : 0;
            const vsYesterday = vsYesterdayNum.toLocaleString('en-US');
            const vsAvgNum = data.funStats.avgDayCost > 0
                ? Math.round((data.today.cost - data.funStats.avgDayCost) / data.funStats.avgDayCost * 100)
                : 0;
            const vsAvg = vsAvgNum.toLocaleString('en-US');

            // Budget-aware coloring
            const dailyBudget = config.get<number>('dailyBudget', 0);
            let todayCostColor = "#ffa502"; // Default orange
            let budgetInfo = '';
            if (dailyBudget > 0) {
                const budgetPct = (data.today.cost / dailyBudget) * 100;
                if (budgetPct >= 90) {
                    todayCostColor = "#ff4757"; // Red
                } else if (budgetPct >= 70) {
                    todayCostColor = "#ffa502"; // Yellow/Orange
                } else {
                    todayCostColor = "#2ed573"; // Green
                }
                budgetInfo = `\n\n💰 Budget: ${this.formatCostFull(data.today.cost)} / ${this.formatCostFull(dailyBudget)} (${budgetPct.toFixed(0)}%)`;
            }

            this.todayCost.text = `$(calendar) ${this.formatCostScaled(data.today.cost)}`;
            this.todayCost.tooltip = new vscode.MarkdownString(
                `**Today's Usage (API Cost)**\n\n` +
                `💵 Cost: ${this.formatCostFull(data.today.cost)}\n\n` +
                `🪙 Tokens: ${this.formatNumberFull(data.today.tokens)}\n\n` +
                `💬 Messages: ${this.formatNumberFull(data.today.messages)}${budgetInfo}\n\n` +
                `---\n\n` +
                `**Comparisons**\n\n` +
                `📊 vs Yesterday: ${vsYesterday}%\n\n` +
                `📈 vs Average: ${vsAvg}%\n\n` +
                `🔥 Streak: ${data.funStats.streak} days\n\n` +
                `---\n\n` +
                `_Click to open Cost_`
            );
            this.todayCost.color = todayCostColor;
            showTodayCost ? this.todayCost.show() : this.todayCost.hide();

            // Messages - scaled display, full on hover (Account Total)
            this.messages.text = `$(comment-discussion) ${this.formatNumberScaled(acct.messages)}`;
            this.messages.tooltip = new vscode.MarkdownString(
                `**Account Total Messages**\n\n` +
                `💬 ${this.formatNumberFull(acct.messages)} messages\n\n` +
                `📊 Avg per session: ${this.formatNumberFull(data.funStats.avgMessagesPerSession)}\n\n` +
                `---\n\n` +
                `**Last 14 Days**\n\n` +
                `💬 ${this.formatNumberFull(last14.messages)} messages\n\n` +
                `📊 14-day avg: ${this.formatNumberFull(last14.avgDayMessages)}/day\n\n` +
                `---\n\n` +
                `**Activity Patterns**\n\n` +
                `🕐 Peak hour: ${data.funStats.peakHour}\n\n` +
                `🦉 Night Owl: ${data.funStats.nightOwlScore}% | 🐦 Early Bird: ${data.funStats.earlyBirdScore}%\n\n` +
                `---\n\n` +
                `_Click to open Messages_`
            );
            this.messages.color = "#3498db";
            showMessages ? this.messages.show() : this.messages.hide();

            // Tokens - scaled display, full on hover (Account Total)
            this.tokens.text = `$(symbol-number) ${this.formatNumberScaled(acct.tokens)}`;
            this.tokens.tooltip = new vscode.MarkdownString(
                `**Account Total Tokens**\n\n` +
                `🪙 Total: ${this.formatNumberFull(acct.tokens)} tokens\n\n` +
                `📥 Input: ${this.formatNumberScaled(acct.inputTokens)}\n\n` +
                `📤 Output: ${this.formatNumberScaled(acct.outputTokens)}\n\n` +
                `---\n\n` +
                `**Cache Efficiency**\n\n` +
                `📊 Cache hit ratio: ${data.funStats.cacheHitRatio}%\n\n` +
                `💵 Cache savings: ${this.formatCostFull(data.funStats.cacheSavings)}\n\n` +
                `🗄️ Cache read: ${this.formatNumberScaled(acct.cacheReadTokens)}\n\n` +
                `---\n\n` +
                `_Click to open Messages_`
            );
            this.tokens.color = "#9b59b6";
            showTokens ? this.tokens.show() : this.tokens.hide();

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

            this.personality.tooltip = new vscode.MarkdownString(
                `**🧠 Personality Profile**\n\n` +
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
                `_Click to open Personality_`
            );
            this.personality.color = "#e056fd";
            showPersonality ? this.personality.show() : this.personality.hide();

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

            this.activity.tooltip = new vscode.MarkdownString(
                `**📊 Activity & Coding**\n\n` +
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
                `_Click to open Personality_`
            );
            this.activity.color = "#00d2d3";
            showActivity ? this.activity.show() : this.activity.hide();

            // Fetch limits asynchronously (respects showRateLimits setting)
            this.updateLimits(showRateLimits);

        } catch (error) {
            this.lifetimeCost.text = "$(graph) Claude";
            this.todayCost.text = "";
            this.messages.text = "";
            this.tokens.text = "";
            this.personality.text = "";
            this.activity.text = "";
            this.limits.text = "";
        }
    }

    private async updateLimits(showRateLimits: boolean = true): Promise<void> {
        if (!showRateLimits) {
            this.limits.hide();
            return;
        }

        try {
            const subscription = await getSubscriptionInfo();

            if (subscription.error) {
                this.limits.text = "$(pulse) N/A";
                this.limits.tooltip = "Claude Code credentials not found";
                this.limits.color = "#888888";
                this.limits.show();
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
            this.limits.show();

        } catch (error) {
            this.limits.text = "$(pulse) --";
            this.limits.tooltip = "Failed to read subscription info";
            this.limits.color = "#888888";
            this.limits.show();
        }
    }

    public dispose() {
        this.lifetimeCost.dispose();
        this.todayCost.dispose();
        this.messages.dispose();
        this.tokens.dispose();
        this.personality.dispose();
        this.activity.dispose();
        this.limits.dispose();
    }
}
