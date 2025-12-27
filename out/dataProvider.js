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
exports.setLiveStats = setLiveStats;
exports.getLiveStats = getLiveStats;
exports.initializeDataWithDatabase = initializeDataWithDatabase;
exports.getDebugStats = getDebugStats;
exports.getUsageData = getUsageData;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const database_1 = require("./database");
// Track if database has been initialized
let dbInitialized = false;
// Live stats from JSONL scanning (updated by scan command)
let liveStats = null;
/**
 * Set live stats from JSONL scan (called by scan command)
 * Also persists to SQLite for accurate historical tracking
 */
function setLiveStats(stats) {
    liveStats = {
        date: stats.date,
        cost: stats.cost,
        messages: stats.messages,
        tokens: stats.totalTokens || stats.tokens || 0
    };
    // Persist to SQLite for accurate historical data
    if (dbInitialized && stats.models) {
        try {
            // Save per-model usage breakdown
            for (const [model, modelStats] of Object.entries(stats.models)) {
                (0, database_1.saveModelUsage)({
                    date: stats.date,
                    model,
                    inputTokens: modelStats.inputTokens || 0,
                    outputTokens: modelStats.outputTokens || 0,
                    cacheReadTokens: modelStats.cacheReadTokens || 0,
                    cacheWriteTokens: modelStats.cacheWriteTokens || 0
                });
            }
            // Save daily snapshot
            (0, database_1.saveDailySnapshot)({
                date: stats.date,
                cost: stats.cost,
                messages: stats.messages,
                tokens: stats.totalTokens || stats.tokens || 0,
                sessions: 0 // Not tracked in live scan
            });
            // Persist to disk
            (0, database_1.saveDatabase)();
        }
        catch (e) {
            console.error('Failed to persist live stats to SQLite:', e);
        }
    }
}
/**
 * Get live stats (for display purposes)
 */
function getLiveStats() {
    return liveStats;
}
// Helper to get local date string (YYYY-MM-DD) without timezone issues
function getLocalDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/**
 * Initialize database and import any existing cache data
 * Called once on extension activation
 */
async function initializeDataWithDatabase() {
    try {
        await (0, database_1.initDatabase)();
        dbInitialized = true;
        // Read current cache data
        const statsCachePath = getStatsCachePath();
        if (fs.existsSync(statsCachePath)) {
            const statsCache = JSON.parse(fs.readFileSync(statsCachePath, 'utf8'));
            return await (0, database_1.importFromCache)(statsCache);
        }
        return { imported: 0, skipped: 0 };
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        return { imported: 0, skipped: 0 };
    }
}
function getStatsCachePath() {
    return path.join(os.homedir(), '.claude', 'stats-cache.json');
}
function getConversationStatsPath() {
    return path.join(os.homedir(), '.claude', 'conversation-stats-cache.json');
}
// Model pricing per 1M tokens
// Cache rates: cache_read = input * 0.1 (90% discount), cache_write = input * 1.25 (25% premium)
const MODEL_PRICING = {
    opus: { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
    sonnet: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
    default: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 }
};
function getPricingForModel(modelName) {
    const lower = modelName.toLowerCase();
    if (lower.includes('opus'))
        return MODEL_PRICING.opus;
    if (lower.includes('sonnet'))
        return MODEL_PRICING.sonnet;
    return MODEL_PRICING.default;
}
/**
 * Calculate cost for a day using dailyModelTokens (per-model token breakdown)
 */
function calculateDayCost(tokensByModel) {
    let cost = 0;
    for (const [model, tokens] of Object.entries(tokensByModel)) {
        const pricing = getPricingForModel(model);
        // Assume roughly 20% output, 80% input split (approximation from cache data)
        // For more accuracy, we'd need separate input/output counts per day
        const avgRate = (pricing.input * 0.3 + pricing.output * 0.1 + pricing.cacheRead * 0.5 + pricing.cacheWrite * 0.1);
        cost += (tokens / 1000000) * avgRate;
    }
    return cost;
}
/**
 * Calculate accurate cost using SQLite model_usage data (has full token breakdown)
 */
function calculateAccurateCostFromModelUsage(records) {
    let cost = 0;
    for (const record of records) {
        const pricing = getPricingForModel(record.model);
        cost += (record.inputTokens / 1000000) * pricing.input +
            (record.outputTokens / 1000000) * pricing.output +
            (record.cacheReadTokens / 1000000) * pricing.cacheRead +
            (record.cacheWriteTokens / 1000000) * pricing.cacheWrite;
    }
    return cost;
}
/**
 * Get accurate daily costs from SQLite model_usage table
 * Returns a map of date -> accurate cost
 */
function getAccurateDailyCosts() {
    const dailyCosts = new Map();
    try {
        const allModelUsage = (0, database_1.getAllModelUsage)();
        // Group by date
        const byDate = new Map();
        for (const record of allModelUsage) {
            if (!byDate.has(record.date)) {
                byDate.set(record.date, []);
            }
            byDate.get(record.date).push(record);
        }
        // Calculate accurate cost per day
        for (const [date, records] of byDate) {
            const cost = calculateAccurateCostFromModelUsage(records);
            const tokens = records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0);
            dailyCosts.set(date, { cost: Math.round(cost * 100) / 100, tokens });
        }
    }
    catch (e) {
        // Fallback: return empty map, will use stats-cache estimates
    }
    return dailyCosts;
}
/**
 * Read cached conversation stats (fast - just reads a JSON file)
 */
function getCachedConversationStats() {
    const defaultStats = {
        curseWords: 0, totalWords: 0, longestMessage: 0, questionsAsked: 0,
        exclamations: 0, thanksCount: 0, sorryCount: 0, emojiCount: 0, capsLockMessages: 0,
        codeBlocks: 0, linesOfCode: 0, topLanguages: {},
        requestTypes: { debugging: 0, features: 0, explain: 0, refactor: 0, review: 0, testing: 0 },
        sentiment: { positive: 0, negative: 0, urgent: 0, confused: 0 },
        pleaseCount: 0, lolCount: 0, facepalms: 0, celebrationMoments: 0
    };
    try {
        const cachePath = getConversationStatsPath();
        if (fs.existsSync(cachePath)) {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            return cacheData.stats || defaultStats;
        }
    }
    catch (e) {
        // Cache read failed
    }
    return defaultStats;
}
function getDebugStats() {
    return 'Cache-only mode - no file scanning';
}
/**
 * Get usage data from cache only - NEVER scans JSONL files
 * This ensures the extension never blocks VS Code
 */
function getUsageData() {
    const emptyAccountTotal = {
        cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0, messages: 0, sessions: 0
    };
    const defaultData = {
        limits: {
            session: { percentage: 0, current: 0, limit: 1 },
            weekly: { percentage: 0, current: 0, limit: 1 }
        },
        accountTotal: { ...emptyAccountTotal },
        accountTotalApi: { ...emptyAccountTotal },
        accountTotalCalculated: { ...emptyAccountTotal },
        last14Days: {
            cost: 0, messages: 0, tokens: 0,
            avgDayCost: 0, avgDayMessages: 0, avgDayTokens: 0, daysActive: 0
        },
        allTime: {
            cost: 0, messages: 0, tokens: 0, totalTokens: 0, cacheTokens: 0,
            dateRange: 'No data', sessions: 0, avgTokensPerMessage: 0, daysActive: 0, firstUsedDate: ''
        },
        today: { cost: 0, messages: 0, tokens: 0 },
        models: [],
        dailyHistory: [],
        recentSessions: [],
        funStats: {
            tokensPerDay: 0, costPerDay: 0, streak: 0, peakDay: { date: '', messages: 0 },
            avgMessagesPerSession: 0, highestDayCost: 0, costTrend: 'stable',
            projectedMonthlyCost: 0, yesterdayCost: 0, avgDayCost: 0, peakHour: 'N/A',
            cacheHitRatio: 0, cacheSavings: 0, longestSessionMessages: 0,
            politenessScore: 0, frustrationIndex: 0, curiosityScore: 0,
            nightOwlScore: 0, earlyBirdScore: 0, weekendScore: 0, achievements: []
        },
        conversationStats: getCachedConversationStats()
    };
    try {
        const statsCachePath = getStatsCachePath();
        if (!fs.existsSync(statsCachePath))
            return defaultData;
        const statsCache = JSON.parse(fs.readFileSync(statsCachePath, 'utf8'));
        // === BASIC STATS ===
        defaultData.allTime.messages = statsCache.totalMessages || 0;
        defaultData.allTime.sessions = statsCache.totalSessions || 0;
        defaultData.accountTotal.messages = statsCache.totalMessages || 0;
        defaultData.accountTotal.sessions = statsCache.totalSessions || 0;
        defaultData.accountTotalApi.messages = statsCache.totalMessages || 0;
        defaultData.accountTotalApi.sessions = statsCache.totalSessions || 0;
        // === ACCOUNT TOTAL API (lifetime aggregates from Claude's stats-cache) ===
        if (statsCache.modelUsage) {
            let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
            let accountCost = 0;
            for (const [modelName, usage] of Object.entries(statsCache.modelUsage)) {
                const m = usage;
                const pricing = getPricingForModel(modelName);
                const input = m.inputTokens || 0;
                const output = m.outputTokens || 0;
                const cacheRead = m.cacheReadInputTokens || 0;
                const cacheWrite = m.cacheCreationInputTokens || 0;
                totalInput += input;
                totalOutput += output;
                totalCacheRead += cacheRead;
                totalCacheWrite += cacheWrite;
                // Calculate cost for this model
                accountCost += (input / 1000000) * pricing.input;
                accountCost += (output / 1000000) * pricing.output;
                accountCost += (cacheRead / 1000000) * pricing.cacheRead;
                accountCost += (cacheWrite / 1000000) * pricing.cacheWrite;
            }
            // Populate API source
            defaultData.accountTotalApi.inputTokens = totalInput;
            defaultData.accountTotalApi.outputTokens = totalOutput;
            defaultData.accountTotalApi.cacheReadTokens = totalCacheRead;
            defaultData.accountTotalApi.cacheWriteTokens = totalCacheWrite;
            defaultData.accountTotalApi.tokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
            defaultData.accountTotalApi.cost = accountCost;
            // Also set accountTotal (default view) to API data
            defaultData.accountTotal.inputTokens = totalInput;
            defaultData.accountTotal.outputTokens = totalOutput;
            defaultData.accountTotal.cacheReadTokens = totalCacheRead;
            defaultData.accountTotal.cacheWriteTokens = totalCacheWrite;
            defaultData.accountTotal.tokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
            defaultData.accountTotal.cost = accountCost;
            // Cache efficiency from account totals
            if (totalInput + totalCacheRead > 0) {
                defaultData.funStats.cacheHitRatio = Math.round((totalCacheRead / (totalInput + totalCacheRead)) * 100);
                defaultData.funStats.cacheSavings = (totalCacheRead / 1000000) * (3 - 0.30); // Sonnet savings estimate
            }
        }
        // === ACCOUNT TOTAL CALCULATED (from SQLite model_usage - accurate with all token types) ===
        if (dbInitialized) {
            try {
                const allModelUsage = (0, database_1.getAllModelUsage)();
                if (allModelUsage.length > 0) {
                    let calcInput = 0, calcOutput = 0, calcCacheRead = 0, calcCacheWrite = 0;
                    let calcCost = 0;
                    for (const record of allModelUsage) {
                        const pricing = getPricingForModel(record.model);
                        calcInput += record.inputTokens;
                        calcOutput += record.outputTokens;
                        calcCacheRead += record.cacheReadTokens;
                        calcCacheWrite += record.cacheWriteTokens;
                        calcCost += (record.inputTokens / 1000000) * pricing.input;
                        calcCost += (record.outputTokens / 1000000) * pricing.output;
                        calcCost += (record.cacheReadTokens / 1000000) * pricing.cacheRead;
                        calcCost += (record.cacheWriteTokens / 1000000) * pricing.cacheWrite;
                    }
                    defaultData.accountTotalCalculated.inputTokens = calcInput;
                    defaultData.accountTotalCalculated.outputTokens = calcOutput;
                    defaultData.accountTotalCalculated.cacheReadTokens = calcCacheRead;
                    defaultData.accountTotalCalculated.cacheWriteTokens = calcCacheWrite;
                    defaultData.accountTotalCalculated.tokens = calcInput + calcOutput + calcCacheRead + calcCacheWrite;
                    defaultData.accountTotalCalculated.cost = Math.round(calcCost * 100) / 100;
                    // Message count and session count from SQLite (sessions now tracked from JSONL directories)
                    const dbStats = (0, database_1.getTotalStats)();
                    defaultData.accountTotalCalculated.messages = dbStats.totalMessages;
                    defaultData.accountTotalCalculated.sessions = dbStats.totalSessions || 0;
                }
            }
            catch (e) {
                console.error('Error calculating from SQLite:', e);
            }
        }
        // === DATE RANGE ===
        if (statsCache.firstSessionDate && statsCache.lastComputedDate) {
            const firstDate = statsCache.firstSessionDate.split('T')[0];
            defaultData.allTime.dateRange = `${firstDate} ~ ${statsCache.lastComputedDate}`;
            defaultData.allTime.firstUsedDate = firstDate;
        }
        // === MODEL USAGE & TOTAL COST ===
        let totalTokens = 0, totalCacheTokens = 0, totalCost = 0;
        const models = [];
        const modelTokenTotals = {};
        // Calculate totals from DAILY values only (not lifetime aggregates)
        // This ensures "Local History" only shows data we have daily records for
        if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
            for (const day of statsCache.dailyModelTokens) {
                if (day.tokensByModel) {
                    for (const [modelName, tokens] of Object.entries(day.tokensByModel)) {
                        const tokenCount = tokens;
                        totalTokens += tokenCount;
                        // Track per-model totals for pie chart
                        modelTokenTotals[modelName] = (modelTokenTotals[modelName] || 0) + tokenCount;
                        // Calculate cost based on model pricing
                        // Using approximate split: 30% input, 10% output, 50% cache read, 10% cache write
                        const pricing = getPricingForModel(modelName);
                        const avgRate = (pricing.input * 0.3 + pricing.output * 0.1 + pricing.cacheRead * 0.5 + pricing.cacheWrite * 0.1);
                        totalCost += (tokenCount / 1000000) * avgRate;
                    }
                }
            }
            // Build model breakdown for pie chart
            let grandTotal = 0;
            for (const [modelName, tokens] of Object.entries(modelTokenTotals)) {
                grandTotal += tokens;
                models.push({
                    name: formatModelName(modelName),
                    tokens: tokens,
                    percentage: 0,
                    color: getModelColor(modelName)
                });
            }
            // Calculate percentages
            for (const model of models) {
                model.percentage = grandTotal > 0 ? (model.tokens / grandTotal) * 100 : 0;
            }
            defaultData.allTime.cost = totalCost;
            defaultData.allTime.tokens = totalTokens;
            defaultData.allTime.totalTokens = totalTokens;
            defaultData.allTime.cacheTokens = 0; // Can't determine from daily breakdown
            defaultData.models = models.sort((a, b) => b.tokens - a.tokens).slice(0, 5);
            // Note: Cache efficiency is already calculated from modelUsage above, don't overwrite
        }
        // === DAILY HISTORY (from dailyActivity + dailyModelTokens) ===
        const todayStr = getLocalDateString();
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterdayDate);
        // Build a map of date -> tokens by model for cost calculation (from stats-cache)
        const dailyTokensMap = {};
        if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
            for (const day of statsCache.dailyModelTokens) {
                if (day.date && day.tokensByModel) {
                    dailyTokensMap[day.date] = day.tokensByModel;
                }
            }
        }
        // Get accurate costs from SQLite model_usage (if backfill was run)
        const accurateDailyCosts = getAccurateDailyCosts();
        // Build daily history with costs (prefer accurate SQLite data over stats-cache estimates)
        let peakMessages = 0, peakDate = '', highestCost = 0;
        const daysWithActivity = new Set();
        if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
            for (const day of statsCache.dailyActivity.slice(-90)) { // Last 90 days
                const messages = day.messageCount || 0;
                const tokensByModel = dailyTokensMap[day.date] || {};
                // Use accurate cost from SQLite if available, otherwise estimate from stats-cache
                const accurateData = accurateDailyCosts.get(day.date);
                const dayTokens = accurateData ? accurateData.tokens : Object.values(tokensByModel).reduce((sum, t) => sum + (t || 0), 0);
                const cost = accurateData ? accurateData.cost : calculateDayCost(tokensByModel);
                defaultData.dailyHistory.push({
                    date: day.date,
                    messages,
                    tokens: dayTokens,
                    cost
                });
                if (messages > 0)
                    daysWithActivity.add(day.date);
                if (messages > peakMessages) {
                    peakMessages = messages;
                    peakDate = day.date;
                }
                if (cost > highestCost)
                    highestCost = cost;
                // Today's data
                if (day.date === todayStr) {
                    defaultData.today.messages = messages;
                    defaultData.today.tokens = dayTokens;
                    defaultData.today.cost = cost;
                }
                // Yesterday's cost
                if (day.date === yesterdayStr) {
                    defaultData.funStats.yesterdayCost = cost;
                }
            }
            defaultData.funStats.peakDay = { date: peakDate, messages: peakMessages };
            defaultData.funStats.highestDayCost = highestCost;
            defaultData.allTime.daysActive = statsCache.dailyActivity.length;
        }
        // === MERGE SQLITE HISTORICAL DATA ===
        if (dbInitialized) {
            try {
                // Get historical data from SQLite
                const sqliteSnapshots = (0, database_1.getAllDailySnapshots)();
                // Create a set of dates we already have from cache
                const cacheDates = new Set(defaultData.dailyHistory.map(d => d.date));
                // Add historical days from SQLite that aren't in the cache
                const historicalDays = [];
                for (const snapshot of sqliteSnapshots) {
                    if (!cacheDates.has(snapshot.date)) {
                        historicalDays.push({
                            date: snapshot.date,
                            cost: snapshot.cost,
                            messages: snapshot.messages,
                            tokens: snapshot.tokens
                        });
                        // Update peak stats if historical data has higher values
                        if (snapshot.messages > peakMessages) {
                            peakMessages = snapshot.messages;
                            peakDate = snapshot.date;
                        }
                        if (snapshot.cost > highestCost) {
                            highestCost = snapshot.cost;
                        }
                        if (snapshot.messages > 0) {
                            daysWithActivity.add(snapshot.date);
                        }
                    }
                }
                // Combine historical + cache data, sorted by date
                if (historicalDays.length > 0) {
                    defaultData.dailyHistory = [...historicalDays, ...defaultData.dailyHistory]
                        .sort((a, b) => a.date.localeCompare(b.date));
                    // Update lifetime stats with full historical data
                    const dbStats = (0, database_1.getTotalStats)();
                    const oldestDbDate = (0, database_1.getOldestDate)();
                    if (oldestDbDate && (!defaultData.allTime.firstUsedDate || oldestDbDate < defaultData.allTime.firstUsedDate)) {
                        defaultData.allTime.firstUsedDate = oldestDbDate;
                        // Update date range
                        if (statsCache.lastComputedDate) {
                            defaultData.allTime.dateRange = `${oldestDbDate} ~ ${statsCache.lastComputedDate}`;
                        }
                    }
                    // Merge totals: SQLite historical + cache current
                    // For cost/messages/tokens, use the higher of (cache total) or (SQLite total)
                    // because cache has current data and SQLite has historical
                    if (dbStats.totalCost > defaultData.allTime.cost) {
                        defaultData.allTime.cost = dbStats.totalCost;
                    }
                    if (dbStats.totalMessages > defaultData.allTime.messages) {
                        defaultData.allTime.messages = dbStats.totalMessages;
                    }
                    if (dbStats.totalTokens > defaultData.allTime.tokens) {
                        defaultData.allTime.tokens = dbStats.totalTokens;
                    }
                    if (dbStats.daysCount > defaultData.allTime.daysActive) {
                        defaultData.allTime.daysActive = dbStats.daysCount;
                    }
                    // Update fun stats with merged data
                    defaultData.funStats.peakDay = { date: peakDate, messages: peakMessages };
                    defaultData.funStats.highestDayCost = highestCost;
                }
                // Persist current cache data to SQLite (new days only)
                for (const day of defaultData.dailyHistory) {
                    // Only save days from the cache that SQLite doesn't have
                    const sqliteHasDate = sqliteSnapshots.some(s => s.date === day.date);
                    if (!sqliteHasDate || day.date === todayStr) {
                        // Save today always (may have updated data), save other new days
                        (0, database_1.saveDailySnapshot)({
                            date: day.date,
                            cost: day.cost,
                            messages: day.messages,
                            tokens: day.tokens,
                            sessions: 0 // Not tracked at day level in cache
                        });
                    }
                }
                // Save changes to disk
                (0, database_1.saveDatabase)();
            }
            catch (dbError) {
                console.error('Error merging SQLite data:', dbError);
            }
        }
        // === MERGE LIVE STATS (from JSONL scan) ===
        if (liveStats && liveStats.date === todayStr) {
            // Use live stats for today (more accurate than cache)
            defaultData.today.messages = liveStats.messages;
            defaultData.today.tokens = liveStats.tokens;
            defaultData.today.cost = liveStats.cost;
            // Also update today in dailyHistory if present
            const todayInHistory = defaultData.dailyHistory.find(d => d.date === todayStr);
            if (todayInHistory) {
                todayInHistory.messages = liveStats.messages;
                todayInHistory.tokens = liveStats.tokens;
                todayInHistory.cost = liveStats.cost;
            }
        }
        // === LAST 14 DAYS CALCULATION ===
        const last14DaysData = defaultData.dailyHistory.slice(-14);
        if (last14DaysData.length > 0) {
            let sum14Cost = 0, sum14Messages = 0, sum14Tokens = 0;
            let days14Active = 0;
            for (const day of last14DaysData) {
                sum14Cost += day.cost;
                sum14Messages += day.messages;
                sum14Tokens += day.tokens;
                if (day.messages > 0)
                    days14Active++;
            }
            defaultData.last14Days.cost = sum14Cost;
            defaultData.last14Days.messages = sum14Messages;
            defaultData.last14Days.tokens = sum14Tokens;
            defaultData.last14Days.daysActive = days14Active;
            defaultData.last14Days.avgDayCost = sum14Cost / 14;
            defaultData.last14Days.avgDayMessages = Math.round(sum14Messages / 14);
            defaultData.last14Days.avgDayTokens = Math.round(sum14Tokens / 14);
        }
        // === STREAK CALCULATION ===
        // Count consecutive days with activity, allowing today to be missing (cache may not be updated yet)
        let streak = 0;
        const checkDate = new Date();
        // If today has no activity, start from yesterday (cache might not be updated yet)
        if (!daysWithActivity.has(todayStr)) {
            checkDate.setDate(checkDate.getDate() - 1);
        }
        // Count consecutive days going backwards
        for (let i = 0; i < 365; i++) {
            if (daysWithActivity.has(getLocalDateString(checkDate))) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            }
            else {
                break;
            }
        }
        defaultData.funStats.streak = streak;
        // === WEEKEND SCORE ===
        let weekendMessages = 0, totalDailyMessages = 0;
        for (const day of defaultData.dailyHistory) {
            const date = new Date(day.date + 'T12:00:00'); // Noon to avoid timezone issues
            const dayOfWeek = date.getDay();
            totalDailyMessages += day.messages;
            if (dayOfWeek === 0 || dayOfWeek === 6)
                weekendMessages += day.messages;
        }
        defaultData.funStats.weekendScore = totalDailyMessages > 0
            ? Math.round((weekendMessages / totalDailyMessages) * 100) : 0;
        // === PEAK HOUR & NIGHT OWL / EARLY BIRD ===
        // Merge hourCounts from Claude Code cache and conversation-stats-cache
        const mergedHourCounts = {};
        // Add from Claude Code cache
        if (statsCache.hourCounts) {
            for (const [hour, count] of Object.entries(statsCache.hourCounts)) {
                mergedHourCounts[hour] = (mergedHourCounts[hour] || 0) + count;
            }
        }
        // Also read from conversation-stats-cache.json (populated by backfill)
        try {
            const convCachePath = getConversationStatsPath();
            if (fs.existsSync(convCachePath)) {
                const convCache = JSON.parse(fs.readFileSync(convCachePath, 'utf8'));
                if (convCache.hourCounts) {
                    for (const [hour, count] of Object.entries(convCache.hourCounts)) {
                        mergedHourCounts[hour] = (mergedHourCounts[hour] || 0) + count;
                    }
                }
            }
        }
        catch (e) {
            // Ignore errors reading conversation cache
        }
        const hours = Object.entries(mergedHourCounts);
        if (hours.length > 0) {
            hours.sort((a, b) => b[1] - a[1]);
            const peakHourNum = parseInt(hours[0][0]);
            const ampm = peakHourNum >= 12 ? 'PM' : 'AM';
            const hour12 = peakHourNum % 12 || 12;
            defaultData.funStats.peakHour = `${hour12} ${ampm}`;
            // Night owl & early bird
            const totalHourMsgs = hours.reduce((sum, h) => sum + h[1], 0);
            let nightOwl = 0, earlyBird = 0;
            for (const [h, count] of hours) {
                const hr = parseInt(h);
                if (hr >= 21 || hr <= 4)
                    nightOwl += count;
                if (hr >= 5 && hr <= 8)
                    earlyBird += count;
            }
            defaultData.funStats.nightOwlScore = totalHourMsgs > 0 ? Math.round((nightOwl / totalHourMsgs) * 100) : 0;
            defaultData.funStats.earlyBirdScore = totalHourMsgs > 0 ? Math.round((earlyBird / totalHourMsgs) * 100) : 0;
        }
        // === LONGEST SESSION ===
        if (statsCache.longestSession) {
            defaultData.funStats.longestSessionMessages = statsCache.longestSession.messageCount || 0;
        }
        // === DERIVED STATS ===
        const daysActive = defaultData.allTime.daysActive || 1;
        defaultData.funStats.tokensPerDay = Math.round(defaultData.allTime.tokens / daysActive);
        defaultData.funStats.costPerDay = totalCost / daysActive;
        defaultData.funStats.avgDayCost = defaultData.funStats.costPerDay;
        defaultData.funStats.projectedMonthlyCost = defaultData.funStats.costPerDay * 30;
        if (defaultData.allTime.messages > 0) {
            defaultData.allTime.avgTokensPerMessage = Math.round(defaultData.allTime.tokens / defaultData.allTime.messages);
        }
        if (defaultData.allTime.sessions > 0) {
            defaultData.funStats.avgMessagesPerSession = Math.round(defaultData.allTime.messages / defaultData.allTime.sessions);
        }
        // === 7-DAY COST TREND ===
        if (defaultData.dailyHistory.length >= 14) {
            const last7 = defaultData.dailyHistory.slice(-7).reduce((sum, d) => sum + d.cost, 0);
            const prev7 = defaultData.dailyHistory.slice(-14, -7).reduce((sum, d) => sum + d.cost, 0);
            if (prev7 > 0) {
                if (last7 > prev7 * 1.1)
                    defaultData.funStats.costTrend = 'up';
                else if (last7 < prev7 * 0.9)
                    defaultData.funStats.costTrend = 'down';
            }
        }
        // === PERSONALITY SCORES ===
        const cs = defaultData.conversationStats;
        const totalMessages = defaultData.allTime.messages || 1;
        defaultData.funStats.politenessScore = Math.round(((cs.pleaseCount + cs.thanksCount) / totalMessages) * 1000) / 10;
        defaultData.funStats.frustrationIndex = Math.round(((cs.curseWords + cs.facepalms + cs.capsLockMessages) / totalMessages) * 1000) / 10;
        defaultData.funStats.curiosityScore = Math.round((cs.questionsAsked / totalMessages) * 1000) / 10;
        // === ACHIEVEMENTS ===
        const achievements = [];
        if (totalMessages >= 10000)
            achievements.push('Legend (10K+ msgs)');
        else if (totalMessages >= 1000)
            achievements.push('Power User (1K+ msgs)');
        else if (totalMessages >= 100)
            achievements.push('Getting Started');
        if (defaultData.funStats.politenessScore >= 5)
            achievements.push('Polite Programmer');
        if (defaultData.funStats.nightOwlScore >= 30)
            achievements.push('Night Owl');
        if (defaultData.funStats.earlyBirdScore >= 30)
            achievements.push('Early Bird');
        if (cs.linesOfCode >= 10000)
            achievements.push('Code Machine');
        else if (cs.linesOfCode >= 1000)
            achievements.push('Prolific Coder');
        if (cs.curseWords >= 100)
            achievements.push('Potty Mouth');
        if (defaultData.funStats.frustrationIndex < 1 && totalMessages >= 100)
            achievements.push('Chill Vibes');
        if (cs.celebrationMoments >= 20)
            achievements.push('Celebrator');
        if (streak >= 30)
            achievements.push('Month Streak');
        else if (streak >= 7)
            achievements.push('Week Streak');
        if (defaultData.funStats.cacheHitRatio >= 90)
            achievements.push('Cache Master');
        if (defaultData.allTime.tokens >= 1000000000)
            achievements.push('Token Titan (1B+)');
        if (totalCost >= 10000)
            achievements.push('$10K Whale');
        else if (totalCost >= 5000)
            achievements.push('$5K Spender');
        else if (totalCost >= 1000)
            achievements.push('$1K Club');
        if (cs.requestTypes.refactor >= 50)
            achievements.push('Refactor King');
        else if (cs.requestTypes.refactor >= 20)
            achievements.push('Refactor Pro');
        if (defaultData.funStats.weekendScore >= 50)
            achievements.push('Weekend Warrior');
        defaultData.funStats.achievements = achievements;
        return defaultData;
    }
    catch (error) {
        console.error('Error reading usage data:', error);
        return defaultData;
    }
}
function formatModelName(name) {
    if (!name)
        return 'Unknown';
    const lower = name.toLowerCase();
    if (lower.includes('opus'))
        return 'Opus 4.5';
    if (lower.includes('sonnet'))
        return 'Sonnet 4.5';
    if (lower.includes('haiku'))
        return 'Haiku';
    return name.length > 15 ? name.substring(0, 15) + '...' : name;
}
function getModelColor(name) {
    if (!name)
        return '#ff8800';
    const lower = name.toLowerCase();
    if (lower.includes('opus'))
        return '#9b59b6';
    if (lower.includes('sonnet'))
        return '#3498db';
    if (lower.includes('haiku'))
        return '#2ecc71';
    return '#ff8800';
}
//# sourceMappingURL=dataProvider.js.map