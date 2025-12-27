import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
    initDatabase,
    importFromCache,
    getAllDailySnapshots,
    saveDailySnapshot,
    saveModelUsage,
    saveDatabase,
    getTotalStats,
    getOldestDate,
    getAllModelUsage,
    DailySnapshot,
    ModelUsageRecord
} from './database';

// Track if database has been initialized
let dbInitialized = false;

// Live stats from JSONL scanning (updated by scan command)
let liveStats: { date: string; cost: number; messages: number; tokens: number } | null = null;

// Interface for per-model stats from scan-today.js
interface ModelStats {
    messages: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    tokens: number;
    cost: number;
}

interface ScanStats {
    date: string;
    cost: number;
    messages: number;
    tokens?: number;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    models?: { [model: string]: ModelStats };
}

/**
 * Set live stats from JSONL scan (called by scan command)
 * Also persists to SQLite for accurate historical tracking
 */
export function setLiveStats(stats: ScanStats) {
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
                saveModelUsage({
                    date: stats.date,
                    model,
                    inputTokens: modelStats.inputTokens || 0,
                    outputTokens: modelStats.outputTokens || 0,
                    cacheReadTokens: modelStats.cacheReadTokens || 0,
                    cacheWriteTokens: modelStats.cacheWriteTokens || 0
                });
            }

            // Save daily snapshot
            saveDailySnapshot({
                date: stats.date,
                cost: stats.cost,
                messages: stats.messages,
                tokens: stats.totalTokens || stats.tokens || 0,
                sessions: 0 // Not tracked in live scan
            });

            // Persist to disk
            saveDatabase();
        } catch (e) {
            console.error('Failed to persist live stats to SQLite:', e);
        }
    }
}

/**
 * Get live stats (for display purposes)
 */
export function getLiveStats() {
    return liveStats;
}

// Helper to get local date string (YYYY-MM-DD) without timezone issues
function getLocalDateString(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Initialize database and import any existing cache data
 * Called once on extension activation
 */
export async function initializeDataWithDatabase(): Promise<{ imported: number; skipped: number }> {
    try {
        await initDatabase();
        dbInitialized = true;

        // Read current cache data
        const statsCachePath = getStatsCachePath();
        if (fs.existsSync(statsCachePath)) {
            const statsCache = JSON.parse(fs.readFileSync(statsCachePath, 'utf8'));
            return await importFromCache(statsCache);
        }

        return { imported: 0, skipped: 0 };
    } catch (error) {
        console.error('Failed to initialize database:', error);
        return { imported: 0, skipped: 0 };
    }
}

export interface DailyUsage {
    date: string;
    cost: number;
    messages: number;
    tokens: number;
}

export interface SessionInfo {
    id: string;
    date: string;
    messages: number;
    tokens: number;
    cost: number;
    project: string;
}

export interface ConversationStats {
    curseWords: number;
    totalWords: number;
    longestMessage: number;
    questionsAsked: number;
    exclamations: number;
    thanksCount: number;
    sorryCount: number;
    emojiCount: number;
    capsLockMessages: number;
    codeBlocks: number;
    linesOfCode: number;
    topLanguages: { [lang: string]: number };
    requestTypes: {
        debugging: number;
        features: number;
        explain: number;
        refactor: number;
        review: number;
        testing: number;
    };
    sentiment: {
        positive: number;
        negative: number;
        urgent: number;
        confused: number;
    };
    pleaseCount: number;
    lolCount: number;
    facepalms: number;
    celebrationMoments: number;
}

// Account total data structure (used for API and calculated sources)
export interface AccountTotalData {
    cost: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    messages: number;
    sessions: number;
}

export interface UsageData {
    limits: {
        session: { percentage: number; current: number; limit: number };
        weekly: { percentage: number; current: number; limit: number };
    };
    // Account Total - current view (switches between API and calculated)
    accountTotal: AccountTotalData;
    // API Reported - from Claude's stats-cache.json (input+output only)
    accountTotalApi: AccountTotalData;
    // Calculated - from SQLite model_usage table (all 4 token types)
    accountTotalCalculated: AccountTotalData;
    // Last 14 days stats (for averages and trends)
    last14Days: {
        cost: number;
        messages: number;
        tokens: number;
        avgDayCost: number;
        avgDayMessages: number;
        avgDayTokens: number;
        daysActive: number;
    };
    allTime: {
        cost: number;
        messages: number;
        tokens: number;
        totalTokens: number;
        cacheTokens: number;
        dateRange: string;
        sessions: number;
        avgTokensPerMessage: number;
        daysActive: number;
        firstUsedDate: string;
    };
    today: {
        cost: number;
        messages: number;
        tokens: number;
    };
    models: Array<{
        name: string;
        tokens: number;
        percentage: number;
        color: string;
    }>;
    dailyHistory: DailyUsage[];
    recentSessions: SessionInfo[];
    funStats: {
        tokensPerDay: number;
        costPerDay: number;
        streak: number;
        peakDay: { date: string; messages: number };
        avgMessagesPerSession: number;
        highestDayCost: number;
        costTrend: 'up' | 'down' | 'stable';
        projectedMonthlyCost: number;
        yesterdayCost: number;
        avgDayCost: number;
        peakHour: string;
        cacheHitRatio: number;
        cacheSavings: number;
        longestSessionMessages: number;
        politenessScore: number;
        frustrationIndex: number;
        curiosityScore: number;
        nightOwlScore: number;
        earlyBirdScore: number;
        weekendScore: number;
        achievements: string[];
    };
    conversationStats: ConversationStats;
}

function getStatsCachePath(): string {
    return path.join(os.homedir(), '.claude', 'stats-cache.json');
}

function getConversationStatsPath(): string {
    return path.join(os.homedir(), '.claude', 'conversation-stats-cache.json');
}

// Model pricing per 1M tokens
// Cache rates: cache_read = input * 0.1 (90% discount), cache_write = input * 1.25 (25% premium)
const MODEL_PRICING: { [key: string]: { input: number; output: number; cacheRead: number; cacheWrite: number } } = {
    opus: { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
    sonnet: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
    default: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 }
};

function getPricingForModel(modelName: string): typeof MODEL_PRICING.default {
    const lower = modelName.toLowerCase();
    if (lower.includes('opus')) return MODEL_PRICING.opus;
    if (lower.includes('sonnet')) return MODEL_PRICING.sonnet;
    return MODEL_PRICING.default;
}

/**
 * Calculate cost for a day using dailyModelTokens (per-model token breakdown)
 */
function calculateDayCost(tokensByModel: { [model: string]: number }): number {
    let cost = 0;
    for (const [model, tokens] of Object.entries(tokensByModel)) {
        const pricing = getPricingForModel(model);
        // Assume roughly 20% output, 80% input split (approximation from cache data)
        // For more accuracy, we'd need separate input/output counts per day
        const avgRate = (pricing.input * 0.3 + pricing.output * 0.1 + pricing.cacheRead * 0.5 + pricing.cacheWrite * 0.1);
        cost += (tokens / 1_000_000) * avgRate;
    }
    return cost;
}

/**
 * Calculate accurate cost using SQLite model_usage data (has full token breakdown)
 */
function calculateAccurateCostFromModelUsage(records: ModelUsageRecord[]): number {
    let cost = 0;
    for (const record of records) {
        const pricing = getPricingForModel(record.model);
        cost += (record.inputTokens / 1_000_000) * pricing.input +
                (record.outputTokens / 1_000_000) * pricing.output +
                (record.cacheReadTokens / 1_000_000) * pricing.cacheRead +
                (record.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
    }
    return cost;
}

/**
 * Get accurate daily costs from SQLite model_usage table
 * Returns a map of date -> accurate cost
 */
function getAccurateDailyCosts(): Map<string, { cost: number; tokens: number }> {
    const dailyCosts = new Map<string, { cost: number; tokens: number }>();

    try {
        const allModelUsage = getAllModelUsage();

        // Group by date
        const byDate = new Map<string, ModelUsageRecord[]>();
        for (const record of allModelUsage) {
            if (!byDate.has(record.date)) {
                byDate.set(record.date, []);
            }
            byDate.get(record.date)!.push(record);
        }

        // Calculate accurate cost per day
        for (const [date, records] of byDate) {
            const cost = calculateAccurateCostFromModelUsage(records);
            const tokens = records.reduce((sum, r) =>
                sum + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0);
            dailyCosts.set(date, { cost: Math.round(cost * 100) / 100, tokens });
        }
    } catch (e) {
        // Fallback: return empty map, will use stats-cache estimates
    }

    return dailyCosts;
}

/**
 * Read cached conversation stats (fast - just reads a JSON file)
 */
function getCachedConversationStats(): ConversationStats {
    const defaultStats: ConversationStats = {
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
    } catch (e) {
        // Cache read failed
    }
    return defaultStats;
}

export function getDebugStats(): string {
    return 'Cache-only mode - no file scanning';
}

/**
 * Get usage data from cache only - NEVER scans JSONL files
 * This ensures the extension never blocks VS Code
 */
export function getUsageData(): UsageData {
    const emptyAccountTotal: AccountTotalData = {
            cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheWriteTokens: 0, messages: 0, sessions: 0
        };
    const defaultData: UsageData = {
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
        if (!fs.existsSync(statsCachePath)) return defaultData;

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
                const m = usage as any;
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
                accountCost += (input / 1_000_000) * pricing.input;
                accountCost += (output / 1_000_000) * pricing.output;
                accountCost += (cacheRead / 1_000_000) * pricing.cacheRead;
                accountCost += (cacheWrite / 1_000_000) * pricing.cacheWrite;
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
                defaultData.funStats.cacheSavings = (totalCacheRead / 1_000_000) * (3 - 0.30); // Sonnet savings estimate
            }
        }

        // === ACCOUNT TOTAL CALCULATED (from SQLite model_usage - accurate with all token types) ===
        if (dbInitialized) {
            try {
                const allModelUsage = getAllModelUsage();
                if (allModelUsage.length > 0) {
                    let calcInput = 0, calcOutput = 0, calcCacheRead = 0, calcCacheWrite = 0;
                    let calcCost = 0;

                    for (const record of allModelUsage) {
                        const pricing = getPricingForModel(record.model);

                        calcInput += record.inputTokens;
                        calcOutput += record.outputTokens;
                        calcCacheRead += record.cacheReadTokens;
                        calcCacheWrite += record.cacheWriteTokens;

                        calcCost += (record.inputTokens / 1_000_000) * pricing.input;
                        calcCost += (record.outputTokens / 1_000_000) * pricing.output;
                        calcCost += (record.cacheReadTokens / 1_000_000) * pricing.cacheRead;
                        calcCost += (record.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
                    }

                    defaultData.accountTotalCalculated.inputTokens = calcInput;
                    defaultData.accountTotalCalculated.outputTokens = calcOutput;
                    defaultData.accountTotalCalculated.cacheReadTokens = calcCacheRead;
                    defaultData.accountTotalCalculated.cacheWriteTokens = calcCacheWrite;
                    defaultData.accountTotalCalculated.tokens = calcInput + calcOutput + calcCacheRead + calcCacheWrite;
                    defaultData.accountTotalCalculated.cost = Math.round(calcCost * 100) / 100;
                    // Message count and session count from SQLite (sessions now tracked from JSONL directories)
                    const dbStats = getTotalStats();
                    defaultData.accountTotalCalculated.messages = dbStats.totalMessages;
                    defaultData.accountTotalCalculated.sessions = dbStats.totalSessions || 0;
                }
            } catch (e) {
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
        const models: Array<{ name: string; tokens: number; percentage: number; color: string }> = [];
        const modelTokenTotals: { [model: string]: number } = {};

        // Calculate totals from DAILY values only (not lifetime aggregates)
        // This ensures "Local History" only shows data we have daily records for
        if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
            for (const day of statsCache.dailyModelTokens) {
                if (day.tokensByModel) {
                    for (const [modelName, tokens] of Object.entries(day.tokensByModel)) {
                        const tokenCount = tokens as number;
                        totalTokens += tokenCount;

                        // Track per-model totals for pie chart
                        modelTokenTotals[modelName] = (modelTokenTotals[modelName] || 0) + tokenCount;

                        // Calculate cost based on model pricing
                        // Using approximate split: 30% input, 10% output, 50% cache read, 10% cache write
                        const pricing = getPricingForModel(modelName);
                        const avgRate = (pricing.input * 0.3 + pricing.output * 0.1 + pricing.cacheRead * 0.5 + pricing.cacheWrite * 0.1);
                        totalCost += (tokenCount / 1_000_000) * avgRate;
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
        const dailyTokensMap: { [date: string]: { [model: string]: number } } = {};
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
        const daysWithActivity = new Set<string>();

        if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
            for (const day of statsCache.dailyActivity.slice(-90)) { // Last 90 days
                const messages = day.messageCount || 0;
                const tokensByModel = dailyTokensMap[day.date] || {};

                // Use accurate cost from SQLite if available, otherwise estimate from stats-cache
                const accurateData = accurateDailyCosts.get(day.date);
                const dayTokens = accurateData ? accurateData.tokens : Object.values(tokensByModel).reduce((sum: number, t: any) => sum + (t || 0), 0);
                const cost = accurateData ? accurateData.cost : calculateDayCost(tokensByModel);

                defaultData.dailyHistory.push({
                    date: day.date,
                    messages,
                    tokens: dayTokens,
                    cost
                });

                if (messages > 0) daysWithActivity.add(day.date);
                if (messages > peakMessages) { peakMessages = messages; peakDate = day.date; }
                if (cost > highestCost) highestCost = cost;

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
                const sqliteSnapshots = getAllDailySnapshots();

                // Create a set of dates we already have from cache
                const cacheDates = new Set(defaultData.dailyHistory.map(d => d.date));

                // Add historical days from SQLite that aren't in the cache
                const historicalDays: DailyUsage[] = [];
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
                    const dbStats = getTotalStats();
                    const oldestDbDate = getOldestDate();
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
                        saveDailySnapshot({
                            date: day.date,
                            cost: day.cost,
                            messages: day.messages,
                            tokens: day.tokens,
                            sessions: 0 // Not tracked at day level in cache
                        });
                    }
                }

                // Save changes to disk
                saveDatabase();
            } catch (dbError) {
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
                if (day.messages > 0) days14Active++;
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
            } else {
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
            if (dayOfWeek === 0 || dayOfWeek === 6) weekendMessages += day.messages;
        }
        defaultData.funStats.weekendScore = totalDailyMessages > 0
            ? Math.round((weekendMessages / totalDailyMessages) * 100) : 0;

        // === PEAK HOUR & NIGHT OWL / EARLY BIRD ===
        // Merge hourCounts from Claude Code cache and conversation-stats-cache
        const mergedHourCounts: { [hour: string]: number } = {};

        // Add from Claude Code cache
        if (statsCache.hourCounts) {
            for (const [hour, count] of Object.entries(statsCache.hourCounts)) {
                mergedHourCounts[hour] = (mergedHourCounts[hour] || 0) + (count as number);
            }
        }

        // Also read from conversation-stats-cache.json (populated by backfill)
        try {
            const convCachePath = getConversationStatsPath();
            if (fs.existsSync(convCachePath)) {
                const convCache = JSON.parse(fs.readFileSync(convCachePath, 'utf8'));
                if (convCache.hourCounts) {
                    for (const [hour, count] of Object.entries(convCache.hourCounts)) {
                        mergedHourCounts[hour] = (mergedHourCounts[hour] || 0) + (count as number);
                    }
                }
            }
        } catch (e) {
            // Ignore errors reading conversation cache
        }

        const hours = Object.entries(mergedHourCounts) as [string, number][];
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
                if (hr >= 21 || hr <= 4) nightOwl += count;
                if (hr >= 5 && hr <= 8) earlyBird += count;
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
                if (last7 > prev7 * 1.1) defaultData.funStats.costTrend = 'up';
                else if (last7 < prev7 * 0.9) defaultData.funStats.costTrend = 'down';
            }
        }

        // === PERSONALITY SCORES ===
        const cs = defaultData.conversationStats;
        const totalMessages = defaultData.allTime.messages || 1;

        defaultData.funStats.politenessScore = Math.round(((cs.pleaseCount + cs.thanksCount) / totalMessages) * 1000) / 10;
        defaultData.funStats.frustrationIndex = Math.round(((cs.curseWords + cs.facepalms + cs.capsLockMessages) / totalMessages) * 1000) / 10;
        defaultData.funStats.curiosityScore = Math.round((cs.questionsAsked / totalMessages) * 1000) / 10;

        // === ACHIEVEMENTS ===
        const achievements: string[] = [];
        if (totalMessages >= 10000) achievements.push('Legend (10K+ msgs)');
        else if (totalMessages >= 1000) achievements.push('Power User (1K+ msgs)');
        else if (totalMessages >= 100) achievements.push('Getting Started');

        if (defaultData.funStats.politenessScore >= 5) achievements.push('Polite Programmer');
        if (defaultData.funStats.nightOwlScore >= 30) achievements.push('Night Owl');
        if (defaultData.funStats.earlyBirdScore >= 30) achievements.push('Early Bird');
        if (cs.linesOfCode >= 10000) achievements.push('Code Machine');
        else if (cs.linesOfCode >= 1000) achievements.push('Prolific Coder');
        if (cs.curseWords >= 100) achievements.push('Potty Mouth');
        if (defaultData.funStats.frustrationIndex < 1 && totalMessages >= 100) achievements.push('Chill Vibes');
        if (cs.celebrationMoments >= 20) achievements.push('Celebrator');
        if (streak >= 30) achievements.push('Month Streak');
        else if (streak >= 7) achievements.push('Week Streak');
        if (defaultData.funStats.cacheHitRatio >= 90) achievements.push('Cache Master');
        if (defaultData.allTime.tokens >= 1_000_000_000) achievements.push('Token Titan (1B+)');
        if (totalCost >= 10000) achievements.push('$10K Whale');
        else if (totalCost >= 5000) achievements.push('$5K Spender');
        else if (totalCost >= 1000) achievements.push('$1K Club');
        if (cs.requestTypes.refactor >= 50) achievements.push('Refactor King');
        else if (cs.requestTypes.refactor >= 20) achievements.push('Refactor Pro');
        if (defaultData.funStats.weekendScore >= 50) achievements.push('Weekend Warrior');

        defaultData.funStats.achievements = achievements;

        return defaultData;
    } catch (error) {
        console.error('Error reading usage data:', error);
        return defaultData;
    }
}

function formatModelName(name: string): string {
    if (!name) return 'Unknown';
    const lower = name.toLowerCase();
    if (lower.includes('opus')) return 'Opus 4.5';
    if (lower.includes('sonnet')) return 'Sonnet 4.5';
    if (lower.includes('haiku')) return 'Haiku';
    return name.length > 15 ? name.substring(0, 15) + '...' : name;
}

function getModelColor(name: string): string {
    if (!name) return '#ff8800';
    const lower = name.toLowerCase();
    if (lower.includes('opus')) return '#9b59b6';
    if (lower.includes('sonnet')) return '#3498db';
    if (lower.includes('haiku')) return '#2ecc71';
    return '#ff8800';
}
