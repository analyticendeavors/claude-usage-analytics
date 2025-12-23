import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
    initDatabase,
    importFromCache,
    getAllDailySnapshots,
    saveDailySnapshot,
    saveDatabase,
    getTotalStats,
    getOldestDate,
    DailySnapshot
} from './database';

// Track if database has been initialized
let dbInitialized = false;

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

export interface UsageData {
    limits: {
        session: { percentage: number; current: number; limit: number };
        weekly: { percentage: number; current: number; limit: number };
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
const MODEL_PRICING: { [key: string]: { input: number; output: number; cacheRead: number; cacheWrite: number } } = {
    opus: { input: 15, output: 75, cacheRead: 1.875, cacheWrite: 18.75 },
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
    const defaultData: UsageData = {
        limits: {
            session: { percentage: 0, current: 0, limit: 1 },
            weekly: { percentage: 0, current: 0, limit: 1 }
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

            // Cache efficiency - estimate from daily data (not available in daily breakdown)
            // Set reasonable defaults since we can't calculate from daily data
            defaultData.funStats.cacheHitRatio = 0;
            defaultData.funStats.cacheSavings = 0;
        }

        // === DAILY HISTORY (from dailyActivity + dailyModelTokens) ===
        const todayStr = getLocalDateString();
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterdayDate);

        // Build a map of date -> tokens by model for accurate cost calculation
        const dailyTokensMap: { [date: string]: { [model: string]: number } } = {};
        if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
            for (const day of statsCache.dailyModelTokens) {
                if (day.date && day.tokensByModel) {
                    dailyTokensMap[day.date] = day.tokensByModel;
                }
            }
        }

        // Build daily history with accurate costs
        let peakMessages = 0, peakDate = '', highestCost = 0;
        const daysWithActivity = new Set<string>();

        if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
            for (const day of statsCache.dailyActivity.slice(-90)) { // Last 90 days
                const messages = day.messageCount || 0;
                const tokensByModel = dailyTokensMap[day.date] || {};
                const dayTokens = Object.values(tokensByModel).reduce((sum: number, t: any) => sum + (t || 0), 0);
                const cost = calculateDayCost(tokensByModel);

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

        // === STREAK CALCULATION ===
        let streak = 0;
        if (daysWithActivity.has(todayStr) || daysWithActivity.has(yesterdayStr)) {
            const checkDate = new Date();
            for (let i = 0; i < 365; i++) {
                if (daysWithActivity.has(getLocalDateString(checkDate))) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
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

        // === PEAK HOUR ===
        if (statsCache.hourCounts) {
            const hours = Object.entries(statsCache.hourCounts) as [string, number][];
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
