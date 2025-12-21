import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface DailyUsage {
    date: string;
    cost: number;
    messages: number;
    tokens: number;
}

export interface ConversationStats {
    // Language & Expression
    curseWords: number;
    totalWords: number;
    longestMessage: number;
    questionsAsked: number;
    exclamations: number;
    thanksCount: number;
    sorryCount: number;
    emojiCount: number;
    capsLockMessages: number;  // Messages with lots of CAPS (frustration indicator)

    // Coding Activity
    codeBlocks: number;
    linesOfCode: number;
    topLanguages: { [lang: string]: number };

    // Request Types (what user asks for)
    requestTypes: {
        debugging: number;      // "fix", "error", "bug", "broken", "not working"
        features: number;       // "add", "create", "implement", "build", "new"
        explain: number;        // "explain", "how does", "what is", "why"
        refactor: number;       // "refactor", "improve", "optimize", "clean"
        review: number;         // "review", "check", "look at", "thoughts"
        testing: number;        // "test", "testing", "unit test"
    };

    // Sentiment & Mood
    sentiment: {
        positive: number;       // "great", "awesome", "perfect", "love", "nice"
        negative: number;       // "hate", "terrible", "awful", "annoying", "frustrated"
        urgent: number;         // "urgent", "asap", "quickly", "hurry", "deadline"
        confused: number;       // "confused", "don't understand", "lost", "stuck"
    };

    // Fun Extras
    pleaseCount: number;        // Politeness indicator
    lolCount: number;           // Humor moments
    facepalms: number;          // "ugh", "sigh", "facepalm", "smh"
    celebrationMoments: number; // "yay", "woo", "yes!", "it works"
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
    funStats: {
        tokensPerDay: number;
        costPerDay: number;
        streak: number;
        peakDay: { date: string; messages: number };
        avgMessagesPerSession: number;
        // Phase 2: Enhanced stats
        highestDayCost: number;
        costTrend: 'up' | 'down' | 'stable';
        projectedMonthlyCost: number;
        yesterdayCost: number;
        avgDayCost: number;
        peakHour: string;
        cacheHitRatio: number;
        cacheSavings: number;
        longestSessionMessages: number;
        // Phase 3: Personality stats
        politenessScore: number;
        frustrationIndex: number;
        curiosityScore: number;
        nightOwlScore: number;
        earlyBirdScore: number;
        achievements: string[];
    };
    conversationStats: ConversationStats;
}

function getStatsCachePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.claude', 'stats-cache.json');
}

function getConversationStatsPath(): string {
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

function scanConversations(): ConversationStats {
    const stats: ConversationStats = {
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
    } catch (e) {
        // Cache read failed, continue with scan
    }

    const homeDir = os.homedir();
    const projectsDir = path.join(homeDir, '.claude', 'projects');

    if (!fs.existsSync(projectsDir)) {
        return stats;
    }

    try {
        // Scan all JSONL files in projects directory (recursive)
        const scanDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else if (entry.name.endsWith('.jsonl')) {
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
        } catch (e) {
            // Cache write failed, continue
        }

    } catch (e) {
        console.error('Error scanning conversations:', e);
    }

    return stats;
}

let debugFileCount = 0;
let debugUserMsgCount = 0;
let debugTextCount = 0;

function scanJsonlFile(filePath: string, stats: ConversationStats): void {
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
                    } else if (entry.message?.content) {
                        if (typeof entry.message.content === 'string') {
                            text = entry.message.content;
                        } else if (Array.isArray(entry.message.content)) {
                            text = entry.message.content
                                .filter((c: any) => c.type === 'text')
                                .map((c: any) => c.text)
                                .join(' ');
                        }
                    } else if (entry.content) {
                        if (typeof entry.content === 'string') {
                            text = entry.content;
                        } else if (Array.isArray(entry.content)) {
                            text = entry.content
                                .filter((c: any) => c.type === 'text')
                                .map((c: any) => c.text)
                                .join(' ');
                        }
                    }

                    if (text) {
                        debugTextCount++;
                        analyzeText(text, stats);
                    }
                }
            } catch (e) {
                // Skip malformed lines
            }
        }
    } catch (e) {
        // File read error, skip
    }
}

export function getDebugStats(): string {
    return `Files: ${debugFileCount}, UserMsgs: ${debugUserMsgCount}, TextFound: ${debugTextCount}`;
}

function analyzeText(text: string, stats: ConversationStats): void {
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

export function getUsageData(): UsageData {
    // Default data if not available
    const defaultData: UsageData = {
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
                const models: Array<{ name: string; tokens: number; percentage: number; color: string }> = [];

                if (statsCache.modelUsage) {
                    // First pass: calculate total
                    let grandTotal = 0;
                    for (const [, usage] of Object.entries(statsCache.modelUsage)) {
                        const modelData = usage as any;
                        grandTotal += (modelData.inputTokens || 0) + (modelData.outputTokens || 0) +
                            (modelData.cacheReadInputTokens || 0) + (modelData.cacheCreationInputTokens || 0);
                    }

                    for (const [modelName, usage] of Object.entries(statsCache.modelUsage)) {
                        const modelData = usage as any;
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
                    let targetData = statsCache.dailyActivity.find((d: any) => d.date === today);

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
                    let targetTokens = statsCache.dailyModelTokens.find((d: any) => d.date === today);

                    // If today's data isn't available, use the most recent day
                    if (!targetTokens && statsCache.dailyModelTokens.length > 0) {
                        targetTokens = statsCache.dailyModelTokens[statsCache.dailyModelTokens.length - 1];
                    }

                    if (targetTokens && targetTokens.tokensByModel) {
                        defaultData.today.tokens = Object.values(targetTokens.tokensByModel)
                            .reduce((sum: number, t: any) => sum + (t || 0), 0);
                    }
                }

                // Build daily history for charts (last 14 days)
                if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
                    const dailyData = statsCache.dailyActivity as any[];
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
                        const hasActivity = dailyData.some((d: any) => d.date === dateStr && d.messageCount > 0);
                        if (hasActivity) {
                            streak++;
                        } else if (i > 0) {
                            break;
                        }
                    }
                    defaultData.funStats.streak = streak;

                    // Store daily data reference for later cost calculations
                    // We'll calculate costs after we know the blended rate
                    (defaultData as any)._dailyData = dailyData;
                }

                // Peak hour from hourCounts
                if (statsCache.hourCounts) {
                    const hours = Object.entries(statsCache.hourCounts) as [string, number][];
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
                            if (h >= 21 || h <= 4) nightOwlMessages += count;
                            if (h >= 5 && h <= 8) earlyBirdMessages += count;
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
                        const modelData = usage as any;
                        const isOpus = modelName.toLowerCase().includes('opus');
                        const isSonnet = modelName.toLowerCase().includes('sonnet');

                        // Pricing per 1M tokens
                        let inputPrice: number, outputPrice: number, cacheReadPrice: number, cacheWritePrice: number;

                        if (isOpus) {
                            inputPrice = 15; outputPrice = 75; cacheReadPrice = 1.875; cacheWritePrice = 18.75;
                        } else if (isSonnet) {
                            inputPrice = 3; outputPrice = 15; cacheReadPrice = 0.30; cacheWritePrice = 3.75;
                        } else {
                            // Default to Sonnet pricing for unknown models
                            inputPrice = 3; outputPrice = 15; cacheReadPrice = 0.30; cacheWritePrice = 3.75;
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
                        const modelData = usage as any;
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

                    // Now calculate daily costs using the actual blended rate
                    const dailyData = (defaultData as any)._dailyData as any[] | undefined;
                    if (dailyData && dailyData.length > 0) {
                        let highestCost = 0;
                        for (const day of dailyData) {
                            const dayTokens = day.totalTokens || 0;
                            const dayCost = (dayTokens / 1000000) * blendedRate;
                            if (dayCost > highestCost) {
                                highestCost = dayCost;
                            }
                        }
                        defaultData.funStats.highestDayCost = highestCost;

                        // Yesterday's cost
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayStr = yesterday.toISOString().split('T')[0];
                        const yesterdayData = dailyData.find((d: any) => d.date === yesterdayStr);
                        if (yesterdayData) {
                            const yTokens = yesterdayData.totalTokens || 0;
                            defaultData.funStats.yesterdayCost = (yTokens / 1000000) * blendedRate;
                        }

                        // 7-day cost trend
                        const last7 = dailyData.slice(-7);
                        const first7 = dailyData.slice(-14, -7);
                        if (last7.length > 0 && first7.length > 0) {
                            const last7Cost = last7.reduce((sum: number, d: any) => sum + ((d.totalTokens || 0) / 1000000) * blendedRate, 0);
                            const first7Cost = first7.reduce((sum: number, d: any) => sum + ((d.totalTokens || 0) / 1000000) * blendedRate, 0);
                            if (last7Cost > first7Cost * 1.1) {
                                defaultData.funStats.costTrend = 'up';
                            } else if (last7Cost < first7Cost * 0.9) {
                                defaultData.funStats.costTrend = 'down';
                            } else {
                                defaultData.funStats.costTrend = 'stable';
                            }
                        }
                    }
                    delete (defaultData as any)._dailyData; // Clean up temp data

                    // Today's cost estimate using blended rate
                    defaultData.today.cost = (defaultData.today.tokens / 1000000) * blendedRate;
                }
            } catch (e) {
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
            defaultData.funStats.politenessScore = Math.round(
                ((cs.pleaseCount + cs.thanksCount) / totalMessages) * 100 * 10
            ) / 10; // One decimal

            // Frustration: (curses + facepalms + caps) / messages * 100
            defaultData.funStats.frustrationIndex = Math.round(
                ((cs.curseWords + cs.facepalms + cs.capsLockMessages) / totalMessages) * 100 * 10
            ) / 10;

            // Curiosity: questions / messages * 100
            defaultData.funStats.curiosityScore = Math.round(
                (cs.questionsAsked / totalMessages) * 100 * 10
            ) / 10;

            // Calculate achievements
            const achievements: string[] = [];

            // Message milestones
            if (totalMessages >= 10000) achievements.push('🏆 Legend (10K+ msgs)');
            else if (totalMessages >= 1000) achievements.push('⭐ Power User (1K+ msgs)');
            else if (totalMessages >= 100) achievements.push('🌱 Getting Started');

            // Politeness
            if (defaultData.funStats.politenessScore >= 5) achievements.push('🎩 Polite Programmer');

            // Time patterns
            if (defaultData.funStats.nightOwlScore >= 30) achievements.push('🦉 Night Owl');
            if (defaultData.funStats.earlyBirdScore >= 30) achievements.push('🐦 Early Bird');

            // Coding
            if (cs.linesOfCode >= 10000) achievements.push('💻 Code Machine');
            else if (cs.linesOfCode >= 1000) achievements.push('⌨️ Prolific Coder');

            // Mood
            if (cs.curseWords >= 100) achievements.push('🤬 Potty Mouth');
            if (defaultData.funStats.frustrationIndex < 1 && totalMessages >= 100) achievements.push('😌 Chill Vibes');
            if (cs.celebrationMoments >= 20) achievements.push('🎉 Celebrator');

            // Streak
            if (defaultData.funStats.streak >= 7) achievements.push('🔥 Week Streak');
            if (defaultData.funStats.streak >= 30) achievements.push('🌟 Month Streak');

            // Cache efficiency
            if (defaultData.funStats.cacheHitRatio >= 90) achievements.push('💰 Cache Master');

            defaultData.funStats.achievements = achievements;
        } catch (e) {
            console.error('Error scanning conversations:', e);
        }

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
