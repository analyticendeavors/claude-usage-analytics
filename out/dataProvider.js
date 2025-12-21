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
exports.getDebugStats = getDebugStats;
exports.getUsageData = getUsageData;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
function getStatsCachePath() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.claude', 'stats-cache.json');
}
function getConversationStatsPath() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.claude', 'conversation-stats-cache.json');
}
// Curse words list (common mild profanity for stats tracking)
const CURSE_WORDS = new Set([
    'damn', 'dammit', 'hell', 'crap', 'shit', 'bullshit', 'ass', 'asshole',
    'fuck', 'fucking', 'fucker', 'wtf', 'bitch', 'bastard', 'piss', 'pissed',
    'dick', 'dickhead', 'cock', 'dumbass', 'jackass', 'goddamn', 'goddammit',
    'screw', 'screwed', 'sucks', 'sucked', 'suck', 'bloody', 'bugger', 'arse'
]);
function scanConversations() {
    const stats = {
        // Language & Expression
        curseWords: 0,
        totalWords: 0,
        longestMessage: 0,
        questionsAsked: 0,
        exclamations: 0,
        thanksCount: 0,
        sorryCount: 0,
        emojiCount: 0,
        capsLockMessages: 0,
        // Coding Activity
        codeBlocks: 0,
        linesOfCode: 0,
        topLanguages: {},
        // Request Types
        requestTypes: {
            debugging: 0,
            features: 0,
            explain: 0,
            refactor: 0,
            review: 0,
            testing: 0
        },
        // Sentiment & Mood
        sentiment: {
            positive: 0,
            negative: 0,
            urgent: 0,
            confused: 0
        },
        // Fun Extras
        pleaseCount: 0,
        lolCount: 0,
        facepalms: 0,
        celebrationMoments: 0
    };
    // Check for cached stats first (cache for 1 hour)
    const cachePath = getConversationStatsPath();
    try {
        if (fs.existsSync(cachePath)) {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const cacheAge = Date.now() - (cacheData.timestamp || 0);
            if (cacheAge < 3600000) { // 1 hour cache
                return cacheData.stats;
            }
        }
    }
    catch (e) {
        // Cache read failed, continue with scan
    }
    const homeDir = os.homedir();
    const projectsDir = path.join(homeDir, '.claude', 'projects');
    if (!fs.existsSync(projectsDir)) {
        return stats;
    }
    try {
        // Scan all JSONL files in projects directory (recursive)
        const scanDir = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                }
                else if (entry.name.endsWith('.jsonl')) {
                    scanJsonlFile(fullPath, stats);
                }
            }
        };
        scanDir(projectsDir);
        // Cache the results
        try {
            fs.writeFileSync(cachePath, JSON.stringify({
                timestamp: Date.now(),
                stats
            }));
        }
        catch (e) {
            // Cache write failed, continue
        }
    }
    catch (e) {
        console.error('Error scanning conversations:', e);
    }
    return stats;
}
let debugFileCount = 0;
let debugUserMsgCount = 0;
let debugTextCount = 0;
function scanJsonlFile(filePath, stats) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        debugFileCount++;
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                // Only analyze user messages (Claude Code format uses type: "user")
                if (entry.type === 'user' || entry.type === 'human' || entry.role === 'user') {
                    debugUserMsgCount++;
                    let text = '';
                    // Handle different message formats
                    if (typeof entry.message === 'string') {
                        text = entry.message;
                    }
                    else if (entry.message?.content) {
                        if (typeof entry.message.content === 'string') {
                            text = entry.message.content;
                        }
                        else if (Array.isArray(entry.message.content)) {
                            text = entry.message.content
                                .filter((c) => c.type === 'text')
                                .map((c) => c.text)
                                .join(' ');
                        }
                    }
                    else if (entry.content) {
                        if (typeof entry.content === 'string') {
                            text = entry.content;
                        }
                        else if (Array.isArray(entry.content)) {
                            text = entry.content
                                .filter((c) => c.type === 'text')
                                .map((c) => c.text)
                                .join(' ');
                        }
                    }
                    if (text) {
                        debugTextCount++;
                        analyzeText(text, stats);
                    }
                }
            }
            catch (e) {
                // Skip malformed lines
            }
        }
    }
    catch (e) {
        // File read error, skip
    }
}
function getDebugStats() {
    return `Files: ${debugFileCount}, UserMsgs: ${debugUserMsgCount}, TextFound: ${debugTextCount}`;
}
function analyzeText(text, stats) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/).filter(w => w.length > 0);
    // ═══════════════════════════════════════════════════════════════
    // BASIC STATS
    // ═══════════════════════════════════════════════════════════════
    stats.totalWords += words.length;
    if (text.length > stats.longestMessage) {
        stats.longestMessage = text.length;
    }
    // Curse words
    for (const word of words) {
        const cleaned = word.replace(/[^a-z]/g, '');
        if (CURSE_WORDS.has(cleaned)) {
            stats.curseWords++;
        }
    }
    // Questions & Exclamations
    stats.questionsAsked += (text.match(/\?/g) || []).length;
    stats.exclamations += (text.match(/!/g) || []).length;
    // Thanks & Sorry
    stats.thanksCount += (lowerText.match(/\b(thanks|thank you|thx|ty|thank)\b/g) || []).length;
    stats.sorryCount += (lowerText.match(/\b(sorry|apolog|my bad|oops)\b/g) || []).length;
    // Emojis (common emoji patterns)
    stats.emojiCount += (text.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|:\)|:\(|:D|;-\)|<3|:P|:O|xD/gu) || []).length;
    // CAPS LOCK detection (frustration indicator) - more than 30% caps in a message > 20 chars
    if (text.length > 20) {
        const upperCount = (text.match(/[A-Z]/g) || []).length;
        const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
        if (letterCount > 0 && upperCount / letterCount > 0.3) {
            stats.capsLockMessages++;
        }
    }
    // ═══════════════════════════════════════════════════════════════
    // CODE ANALYSIS
    // ═══════════════════════════════════════════════════════════════
    const codeBlockMatches = text.match(/```(\w*)\n[\s\S]*?```/g) || [];
    stats.codeBlocks += codeBlockMatches.length;
    for (const block of codeBlockMatches) {
        // Extract language from ```language
        const langMatch = block.match(/```(\w+)/);
        if (langMatch && langMatch[1]) {
            const lang = langMatch[1].toLowerCase();
            stats.topLanguages[lang] = (stats.topLanguages[lang] || 0) + 1;
        }
        // Count lines of code
        const lines = block.split('\n').length - 2;
        stats.linesOfCode += Math.max(0, lines);
    }
    // ═══════════════════════════════════════════════════════════════
    // REQUEST TYPES
    // ═══════════════════════════════════════════════════════════════
    // Debugging requests
    if (/\b(fix|error|bug|broken|not working|issue|problem|crash|fail|exception|undefined|null)\b/i.test(text)) {
        stats.requestTypes.debugging++;
    }
    // Feature requests
    if (/\b(add|create|implement|build|make|new|write|generate|develop)\b/i.test(text)) {
        stats.requestTypes.features++;
    }
    // Explanation requests
    if (/\b(explain|how does|what is|why does|what's|how do|tell me about|understand)\b/i.test(text)) {
        stats.requestTypes.explain++;
    }
    // Refactor requests
    if (/\b(refactor|improve|optimize|clean|simplify|better|enhance|upgrade)\b/i.test(text)) {
        stats.requestTypes.refactor++;
    }
    // Review requests
    if (/\b(review|check|look at|thoughts|feedback|opinion|does this look)\b/i.test(text)) {
        stats.requestTypes.review++;
    }
    // Testing requests
    if (/\b(test|testing|unit test|spec|coverage|mock|stub)\b/i.test(text)) {
        stats.requestTypes.testing++;
    }
    // ═══════════════════════════════════════════════════════════════
    // SENTIMENT & MOOD
    // ═══════════════════════════════════════════════════════════════
    // Positive sentiment
    if (/\b(great|awesome|perfect|love|nice|excellent|amazing|wonderful|fantastic|brilliant|cool|neat)\b/i.test(text)) {
        stats.sentiment.positive++;
    }
    // Negative sentiment
    if (/\b(hate|terrible|awful|annoying|frustrated|frustrating|horrible|sucks|stupid|dumb|ridiculous)\b/i.test(text)) {
        stats.sentiment.negative++;
    }
    // Urgency
    if (/\b(urgent|asap|quickly|hurry|deadline|immediately|emergency|critical|important|priority)\b/i.test(text)) {
        stats.sentiment.urgent++;
    }
    // Confusion
    if (/\b(confused|don't understand|lost|stuck|no idea|help|struggling|can't figure|not sure)\b/i.test(text)) {
        stats.sentiment.confused++;
    }
    // ═══════════════════════════════════════════════════════════════
    // FUN EXTRAS
    // ═══════════════════════════════════════════════════════════════
    // Politeness
    stats.pleaseCount += (lowerText.match(/\bplease\b/g) || []).length;
    // Humor
    stats.lolCount += (lowerText.match(/\b(lol|lmao|haha|hehe|rofl|😂|🤣)\b/g) || []).length;
    // Facepalm moments
    if (/\b(ugh|sigh|facepalm|smh|omg|oh god|oh no|doh|argh)\b/i.test(text)) {
        stats.facepalms++;
    }
    // Celebration moments
    if (/\b(yay|woo|woohoo|yes!|it works|finally|hell yeah|awesome|nailed it|boom|🎉|✅)\b/i.test(text)) {
        stats.celebrationMoments++;
    }
}
function getUsageData() {
    // Default data if not available
    const defaultData = {
        limits: {
            session: { percentage: 0, current: 0, limit: 1 },
            weekly: { percentage: 0, current: 0, limit: 1 }
        },
        allTime: {
            cost: 0,
            messages: 0,
            tokens: 0,
            totalTokens: 0,
            cacheTokens: 0,
            dateRange: 'No data',
            sessions: 0,
            avgTokensPerMessage: 0,
            daysActive: 0
        },
        today: {
            cost: 0,
            messages: 0,
            tokens: 0
        },
        models: [],
        dailyHistory: [],
        funStats: {
            tokensPerDay: 0,
            costPerDay: 0,
            streak: 0,
            peakDay: { date: '', messages: 0 },
            avgMessagesPerSession: 0,
            // Phase 2
            highestDayCost: 0,
            costTrend: 'stable',
            projectedMonthlyCost: 0,
            yesterdayCost: 0,
            avgDayCost: 0,
            peakHour: 'N/A',
            cacheHitRatio: 0,
            cacheSavings: 0,
            longestSessionMessages: 0,
            // Phase 3
            politenessScore: 0,
            frustrationIndex: 0,
            curiosityScore: 0,
            nightOwlScore: 0,
            earlyBirdScore: 0,
            achievements: []
        },
        conversationStats: {
            curseWords: 0,
            totalWords: 0,
            longestMessage: 0,
            questionsAsked: 0,
            exclamations: 0,
            thanksCount: 0,
            sorryCount: 0,
            emojiCount: 0,
            capsLockMessages: 0,
            codeBlocks: 0,
            linesOfCode: 0,
            topLanguages: {},
            requestTypes: {
                debugging: 0,
                features: 0,
                explain: 0,
                refactor: 0,
                review: 0,
                testing: 0
            },
            sentiment: {
                positive: 0,
                negative: 0,
                urgent: 0,
                confused: 0
            },
            pleaseCount: 0,
            lolCount: 0,
            facepalms: 0,
            celebrationMoments: 0
        }
    };
    try {
        // Read stats-cache.json for model usage and stats
        const statsCachePath = getStatsCachePath();
        if (fs.existsSync(statsCachePath)) {
            try {
                const statsCache = JSON.parse(fs.readFileSync(statsCachePath, 'utf8'));
                // Total messages and sessions
                defaultData.allTime.messages = statsCache.totalMessages || 0;
                // Calculate total tokens from model usage
                let totalTokens = 0;
                let totalCacheTokens = 0;
                const models = [];
                if (statsCache.modelUsage) {
                    // First pass: calculate total
                    let grandTotal = 0;
                    for (const [, usage] of Object.entries(statsCache.modelUsage)) {
                        const modelData = usage;
                        grandTotal += (modelData.inputTokens || 0) + (modelData.outputTokens || 0) +
                            (modelData.cacheReadInputTokens || 0) + (modelData.cacheCreationInputTokens || 0);
                    }
                    for (const [modelName, usage] of Object.entries(statsCache.modelUsage)) {
                        const modelData = usage;
                        const inputTokens = modelData.inputTokens || 0;
                        const outputTokens = modelData.outputTokens || 0;
                        const cacheRead = modelData.cacheReadInputTokens || 0;
                        const cacheWrite = modelData.cacheCreationInputTokens || 0;
                        const modelTokens = inputTokens + outputTokens;
                        totalTokens += modelTokens;
                        totalCacheTokens += cacheRead + cacheWrite;
                        const modelTotal = modelTokens + cacheRead + cacheWrite;
                        models.push({
                            name: formatModelName(modelName),
                            tokens: modelTotal,
                            percentage: grandTotal > 0 ? (modelTotal / grandTotal) * 100 : 0,
                            color: getModelColor(modelName)
                        });
                    }
                }
                defaultData.allTime.totalTokens = totalTokens;
                defaultData.allTime.cacheTokens = totalCacheTokens;
                defaultData.allTime.tokens = totalTokens + totalCacheTokens;
                defaultData.models = models.sort((a, b) => b.tokens - a.tokens).slice(0, 5);
                // Sessions count
                defaultData.allTime.sessions = statsCache.totalSessions || 0;
                // Date range from first session
                if (statsCache.firstSessionDate && statsCache.lastComputedDate) {
                    const firstDate = statsCache.firstSessionDate.split('T')[0];
                    const lastDate = statsCache.lastComputedDate;
                    defaultData.allTime.dateRange = `${firstDate} ~ ${lastDate}`;
                }
                // Today's data from dailyActivity (or most recent if today not available)
                if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
                    const today = new Date().toISOString().split('T')[0];
                    let targetData = statsCache.dailyActivity.find((d) => d.date === today);
                    // If today's data isn't available, use the most recent day
                    if (!targetData && statsCache.dailyActivity.length > 0) {
                        targetData = statsCache.dailyActivity[statsCache.dailyActivity.length - 1];
                    }
                    if (targetData) {
                        defaultData.today.messages = targetData.messageCount || 0;
                    }
                }
                // Today's tokens from dailyModelTokens (or most recent if today not available)
                if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
                    const today = new Date().toISOString().split('T')[0];
                    let targetTokens = statsCache.dailyModelTokens.find((d) => d.date === today);
                    // If today's data isn't available, use the most recent day
                    if (!targetTokens && statsCache.dailyModelTokens.length > 0) {
                        targetTokens = statsCache.dailyModelTokens[statsCache.dailyModelTokens.length - 1];
                    }
                    if (targetTokens && targetTokens.tokensByModel) {
                        defaultData.today.tokens = Object.values(targetTokens.tokensByModel)
                            .reduce((sum, t) => sum + (t || 0), 0);
                    }
                }
                // Build daily history for charts (last 14 days)
                if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
                    const dailyData = statsCache.dailyActivity;
                    const last14Days = dailyData.slice(-14);
                    // Find peak day
                    let peakMessages = 0;
                    let peakDate = '';
                    for (const day of last14Days) {
                        const messages = day.messageCount || 0;
                        const tokens = day.totalTokens || 0;
                        const cost = (tokens / 1000000) * 10;
                        defaultData.dailyHistory.push({
                            date: day.date,
                            messages,
                            tokens,
                            cost
                        });
                        if (messages > peakMessages) {
                            peakMessages = messages;
                            peakDate = day.date;
                        }
                    }
                    defaultData.funStats.peakDay = { date: peakDate, messages: peakMessages };
                    defaultData.allTime.daysActive = dailyData.length;
                    // Calculate streak (consecutive days with activity)
                    let streak = 0;
                    const today = new Date();
                    for (let i = 0; i < 365; i++) {
                        const checkDate = new Date(today);
                        checkDate.setDate(checkDate.getDate() - i);
                        const dateStr = checkDate.toISOString().split('T')[0];
                        const hasActivity = dailyData.some((d) => d.date === dateStr && d.messageCount > 0);
                        if (hasActivity) {
                            streak++;
                        }
                        else if (i > 0) {
                            break;
                        }
                    }
                    defaultData.funStats.streak = streak;
                    // Store daily data reference for later cost calculations
                    // We'll calculate costs after we know the blended rate
                    defaultData._dailyData = dailyData;
                }
                // Peak hour from hourCounts
                if (statsCache.hourCounts) {
                    const hours = Object.entries(statsCache.hourCounts);
                    if (hours.length > 0) {
                        hours.sort((a, b) => b[1] - a[1]);
                        const peakHourNum = parseInt(hours[0][0]);
                        const ampm = peakHourNum >= 12 ? 'PM' : 'AM';
                        const hour12 = peakHourNum % 12 || 12;
                        defaultData.funStats.peakHour = `${hour12} ${ampm}`;
                        // Night owl (9pm-4am) and early bird (5am-8am) scores
                        const totalHourMessages = hours.reduce((sum, h) => sum + h[1], 0);
                        let nightOwlMessages = 0;
                        let earlyBirdMessages = 0;
                        for (const [hourStr, count] of hours) {
                            const h = parseInt(hourStr);
                            if (h >= 21 || h <= 4)
                                nightOwlMessages += count;
                            if (h >= 5 && h <= 8)
                                earlyBirdMessages += count;
                        }
                        defaultData.funStats.nightOwlScore = totalHourMessages > 0
                            ? Math.round((nightOwlMessages / totalHourMessages) * 100) : 0;
                        defaultData.funStats.earlyBirdScore = totalHourMessages > 0
                            ? Math.round((earlyBirdMessages / totalHourMessages) * 100) : 0;
                    }
                }
                // Longest session messages
                if (statsCache.longestSession) {
                    defaultData.funStats.longestSessionMessages = statsCache.longestSession.messageCount || 0;
                }
                // Calculate fun stats
                const totalAllTokens = totalTokens + totalCacheTokens;
                if (defaultData.allTime.daysActive > 0) {
                    defaultData.funStats.tokensPerDay = Math.round(totalAllTokens / defaultData.allTime.daysActive);
                    // costPerDay will be calculated after we know total cost
                }
                if (defaultData.allTime.messages > 0) {
                    defaultData.allTime.avgTokensPerMessage = Math.round(totalAllTokens / defaultData.allTime.messages);
                }
                if (defaultData.allTime.sessions > 0) {
                    defaultData.funStats.avgMessagesPerSession = Math.round(defaultData.allTime.messages / defaultData.allTime.sessions);
                }
                // Calculate costs using actual Claude Opus 4.5 pricing
                // Opus 4.5: $15/M input, $75/M output, $1.875/M cache read, $18.75/M cache write
                if (statsCache.modelUsage) {
                    let totalCost = 0;
                    for (const [modelName, usage] of Object.entries(statsCache.modelUsage)) {
                        const modelData = usage;
                        const isOpus = modelName.toLowerCase().includes('opus');
                        const isSonnet = modelName.toLowerCase().includes('sonnet');
                        // Pricing per 1M tokens
                        let inputPrice, outputPrice, cacheReadPrice, cacheWritePrice;
                        if (isOpus) {
                            inputPrice = 15;
                            outputPrice = 75;
                            cacheReadPrice = 1.875;
                            cacheWritePrice = 18.75;
                        }
                        else if (isSonnet) {
                            inputPrice = 3;
                            outputPrice = 15;
                            cacheReadPrice = 0.30;
                            cacheWritePrice = 3.75;
                        }
                        else {
                            // Default to Sonnet pricing for unknown models
                            inputPrice = 3;
                            outputPrice = 15;
                            cacheReadPrice = 0.30;
                            cacheWritePrice = 3.75;
                        }
                        const inputTokens = modelData.inputTokens || 0;
                        const outputTokens = modelData.outputTokens || 0;
                        const cacheRead = modelData.cacheReadInputTokens || 0;
                        const cacheWrite = modelData.cacheCreationInputTokens || 0;
                        totalCost += (inputTokens / 1000000) * inputPrice;
                        totalCost += (outputTokens / 1000000) * outputPrice;
                        totalCost += (cacheRead / 1000000) * cacheReadPrice;
                        totalCost += (cacheWrite / 1000000) * cacheWritePrice;
                    }
                    defaultData.allTime.cost = totalCost;
                    // Now calculate costPerDay using actual cost
                    if (defaultData.allTime.daysActive > 0) {
                        defaultData.funStats.costPerDay = totalCost / defaultData.allTime.daysActive;
                        defaultData.funStats.avgDayCost = defaultData.funStats.costPerDay;
                        // Projected monthly = avg daily * 30
                        defaultData.funStats.projectedMonthlyCost = defaultData.funStats.costPerDay * 30;
                    }
                    // Cache hit ratio and savings
                    // Cache reads are much cheaper than regular input tokens
                    // Opus: $15/M input vs $1.875/M cache read = ~87.5% savings
                    let totalCacheRead = 0;
                    let totalInput = 0;
                    for (const [, usage] of Object.entries(statsCache.modelUsage)) {
                        const modelData = usage;
                        totalCacheRead += modelData.cacheReadInputTokens || 0;
                        totalInput += modelData.inputTokens || 0;
                    }
                    const totalInputAndCache = totalInput + totalCacheRead;
                    if (totalInputAndCache > 0) {
                        defaultData.funStats.cacheHitRatio = Math.round((totalCacheRead / totalInputAndCache) * 100);
                        // Savings = (cache tokens * regular price - cache tokens * cache price)
                        // Using Opus pricing: $15/M vs $1.875/M = $13.125/M saved per cache token
                        defaultData.funStats.cacheSavings = (totalCacheRead / 1000000) * 13.125;
                    }
                    // Calculate blended rate (actual cost per 1M tokens)
                    const totalAllTokens = defaultData.allTime.tokens + defaultData.allTime.cacheTokens;
                    const blendedRate = totalAllTokens > 0 ? (totalCost / (totalAllTokens / 1000000)) : 20;
                    // Now calculate daily costs using dailyModelTokens for accuracy
                    const dailyModelTokens = statsCache.dailyModelTokens;
                    const dailyActivity = defaultData._dailyData;
                    // Build a map of date -> tokens from dailyModelTokens
                    const tokensByDate = {};
                    if (dailyModelTokens && dailyModelTokens.length > 0) {
                        for (const day of dailyModelTokens) {
                            if (day.date && day.tokensByModel) {
                                const dayTotal = Object.values(day.tokensByModel)
                                    .reduce((sum, t) => sum + (t || 0), 0);
                                tokensByDate[day.date] = dayTotal;
                            }
                        }
                    }
                    // Calculate highest day and yesterday's cost
                    let highestCost = 0;
                    for (const [, tokens] of Object.entries(tokensByDate)) {
                        const dayCost = (tokens / 1000000) * blendedRate;
                        if (dayCost > highestCost) {
                            highestCost = dayCost;
                        }
                    }
                    defaultData.funStats.highestDayCost = highestCost;
                    // Yesterday's cost
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayStr = yesterday.toISOString().split('T')[0];
                    if (tokensByDate[yesterdayStr]) {
                        defaultData.funStats.yesterdayCost = (tokensByDate[yesterdayStr] / 1000000) * blendedRate;
                    }
                    // 7-day cost trend using dailyActivity for date list
                    if (dailyActivity && dailyActivity.length >= 7) {
                        const last7Dates = dailyActivity.slice(-7).map((d) => d.date);
                        const prev7Dates = dailyActivity.slice(-14, -7).map((d) => d.date);
                        const last7Cost = last7Dates.reduce((sum, date) => sum + ((tokensByDate[date] || 0) / 1000000) * blendedRate, 0);
                        const prev7Cost = prev7Dates.reduce((sum, date) => sum + ((tokensByDate[date] || 0) / 1000000) * blendedRate, 0);
                        if (prev7Cost > 0) {
                            if (last7Cost > prev7Cost * 1.1) {
                                defaultData.funStats.costTrend = 'up';
                            }
                            else if (last7Cost < prev7Cost * 0.9) {
                                defaultData.funStats.costTrend = 'down';
                            }
                            else {
                                defaultData.funStats.costTrend = 'stable';
                            }
                        }
                    }
                    delete defaultData._dailyData; // Clean up temp data
                    // Today's cost estimate using blended rate
                    defaultData.today.cost = (defaultData.today.tokens / 1000000) * blendedRate;
                }
            }
            catch (e) {
                console.error('Error parsing stats-cache.json:', e);
            }
        }
        // Scan conversations for fun stats (cached for 1 hour)
        try {
            defaultData.conversationStats = scanConversations();
            // Calculate personality scores based on conversation stats
            const cs = defaultData.conversationStats;
            const totalMessages = defaultData.allTime.messages || 1;
            // Politeness: (please + thanks) / messages * 100
            defaultData.funStats.politenessScore = Math.round(((cs.pleaseCount + cs.thanksCount) / totalMessages) * 100 * 10) / 10; // One decimal
            // Frustration: (curses + facepalms + caps) / messages * 100
            defaultData.funStats.frustrationIndex = Math.round(((cs.curseWords + cs.facepalms + cs.capsLockMessages) / totalMessages) * 100 * 10) / 10;
            // Curiosity: questions / messages * 100
            defaultData.funStats.curiosityScore = Math.round((cs.questionsAsked / totalMessages) * 100 * 10) / 10;
            // Calculate achievements
            const achievements = [];
            // Message milestones
            if (totalMessages >= 10000)
                achievements.push('🏆 Legend (10K+ msgs)');
            else if (totalMessages >= 1000)
                achievements.push('⭐ Power User (1K+ msgs)');
            else if (totalMessages >= 100)
                achievements.push('🌱 Getting Started');
            // Politeness
            if (defaultData.funStats.politenessScore >= 5)
                achievements.push('🎩 Polite Programmer');
            // Time patterns
            if (defaultData.funStats.nightOwlScore >= 30)
                achievements.push('🦉 Night Owl');
            if (defaultData.funStats.earlyBirdScore >= 30)
                achievements.push('🐦 Early Bird');
            // Coding
            if (cs.linesOfCode >= 10000)
                achievements.push('💻 Code Machine');
            else if (cs.linesOfCode >= 1000)
                achievements.push('⌨️ Prolific Coder');
            // Mood
            if (cs.curseWords >= 100)
                achievements.push('🤬 Potty Mouth');
            if (defaultData.funStats.frustrationIndex < 1 && totalMessages >= 100)
                achievements.push('😌 Chill Vibes');
            if (cs.celebrationMoments >= 20)
                achievements.push('🎉 Celebrator');
            // Streak
            if (defaultData.funStats.streak >= 7)
                achievements.push('🔥 Week Streak');
            if (defaultData.funStats.streak >= 30)
                achievements.push('🌟 Month Streak');
            // Cache efficiency
            if (defaultData.funStats.cacheHitRatio >= 90)
                achievements.push('💰 Cache Master');
            defaultData.funStats.achievements = achievements;
        }
        catch (e) {
            console.error('Error scanning conversations:', e);
        }
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