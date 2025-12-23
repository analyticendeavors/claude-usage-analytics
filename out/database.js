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
exports.initDatabase = initDatabase;
exports.saveDatabase = saveDatabase;
exports.closeDatabase = closeDatabase;
exports.saveDailySnapshot = saveDailySnapshot;
exports.saveModelUsage = saveModelUsage;
exports.getAllDailySnapshots = getAllDailySnapshots;
exports.getModelUsageForDate = getModelUsageForDate;
exports.getAllModelUsage = getAllModelUsage;
exports.hasData = hasData;
exports.getOldestDate = getOldestDate;
exports.getNewestDate = getNewestDate;
exports.getTotalStats = getTotalStats;
exports.getExistingDates = getExistingDates;
exports.importFromCache = importFromCache;
exports.clearHistoryBeforeDate = clearHistoryBeforeDate;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
// Use ASM version (pure JS, no WASM needed) for VS Code extension compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js/dist/sql-asm.js');
// Database singleton
let db = null;
let dbInitPromise = null;
let dbInitFailed = false;
// Database file path
function getDbPath() {
    return path.join(os.homedir(), '.claude', 'analytics.db');
}
// Schema version for migrations
const SCHEMA_VERSION = 1;
/**
 * Initialize the SQLite database (creates tables if needed)
 * Returns null if initialization fails - extension continues without persistence
 */
async function initDatabase() {
    // Don't retry if already failed
    if (dbInitFailed) {
        return null;
    }
    // Return existing promise if initialization is in progress
    if (dbInitPromise) {
        return dbInitPromise;
    }
    // Return existing database if already initialized
    if (db) {
        return db;
    }
    dbInitPromise = (async () => {
        try {
            // Initialize sql.js (ASM version - pure JS, no WASM)
            const SQL = await initSqlJs();
            const dbPath = getDbPath();
            const dbDir = path.dirname(dbPath);
            // Ensure .claude directory exists
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            // Load existing database or create new one
            if (fs.existsSync(dbPath)) {
                const fileBuffer = fs.readFileSync(dbPath);
                db = new SQL.Database(fileBuffer);
            }
            else {
                db = new SQL.Database();
            }
            // Create schema if needed
            createSchema(db);
            // Check and run migrations
            runMigrations(db);
            console.log('Claude Analytics: Database initialized successfully');
            return db;
        }
        catch (error) {
            console.error('Claude Analytics: Failed to initialize database:', error);
            dbInitFailed = true;
            db = null;
            dbInitPromise = null;
            return null;
        }
    })();
    return dbInitPromise;
}
/**
 * Create database schema
 */
function createSchema(database) {
    // Daily snapshots table
    database.run(`
        CREATE TABLE IF NOT EXISTS daily_snapshots (
            date TEXT PRIMARY KEY,
            cost REAL DEFAULT 0,
            messages INTEGER DEFAULT 0,
            tokens INTEGER DEFAULT 0,
            sessions INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
    // Model usage per day
    database.run(`
        CREATE TABLE IF NOT EXISTS model_usage (
            date TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            cache_read_tokens INTEGER DEFAULT 0,
            cache_write_tokens INTEGER DEFAULT 0,
            PRIMARY KEY (date, model)
        )
    `);
    // Metadata table for schema version, settings, etc.
    database.run(`
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);
    // Create indexes for faster queries
    database.run(`CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_snapshots(date)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_model_date ON model_usage(date)`);
}
/**
 * Run schema migrations
 */
function runMigrations(database) {
    const currentVersion = getMetadata(database, 'schema_version');
    const version = currentVersion ? parseInt(currentVersion, 10) : 0;
    if (version < SCHEMA_VERSION) {
        // Future migrations go here
        // if (version < 2) { ... migrate to v2 ... }
        setMetadata(database, 'schema_version', SCHEMA_VERSION.toString());
    }
}
/**
 * Get metadata value
 */
function getMetadata(database, key) {
    const result = database.exec(`SELECT value FROM metadata WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
    }
    return null;
}
/**
 * Set metadata value
 */
function setMetadata(database, key, value) {
    database.run(`INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`, [key, value]);
}
/**
 * Save database to disk
 */
function saveDatabase() {
    if (!db)
        return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(getDbPath(), buffer);
    }
    catch (error) {
        console.error('Failed to save database:', error);
    }
}
/**
 * Close the database connection
 */
function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        dbInitPromise = null;
    }
}
// ============ CRUD Operations ============
/**
 * Save or update a daily snapshot
 */
function saveDailySnapshot(snapshot) {
    if (!db)
        return;
    db.run(`
        INSERT OR REPLACE INTO daily_snapshots (date, cost, messages, tokens, sessions)
        VALUES (?, ?, ?, ?, ?)
    `, [snapshot.date, snapshot.cost, snapshot.messages, snapshot.tokens, snapshot.sessions]);
}
/**
 * Save or update model usage for a day
 */
function saveModelUsage(usage) {
    if (!db)
        return;
    db.run(`
        INSERT OR REPLACE INTO model_usage (date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [usage.date, usage.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens]);
}
/**
 * Get all daily snapshots from database
 */
function getAllDailySnapshots() {
    if (!db)
        return [];
    const result = db.exec(`
        SELECT date, cost, messages, tokens, sessions
        FROM daily_snapshots
        ORDER BY date ASC
    `);
    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }
    return result[0].values.map((row) => ({
        date: row[0],
        cost: row[1],
        messages: row[2],
        tokens: row[3],
        sessions: row[4]
    }));
}
/**
 * Get model usage for a specific date
 */
function getModelUsageForDate(date) {
    if (!db)
        return [];
    const result = db.exec(`
        SELECT date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        FROM model_usage
        WHERE date = ?
    `, [date]);
    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }
    return result[0].values.map((row) => ({
        date: row[0],
        model: row[1],
        inputTokens: row[2],
        outputTokens: row[3],
        cacheReadTokens: row[4],
        cacheWriteTokens: row[5]
    }));
}
/**
 * Get all model usage records
 */
function getAllModelUsage() {
    if (!db)
        return [];
    const result = db.exec(`
        SELECT date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        FROM model_usage
        ORDER BY date ASC
    `);
    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }
    return result[0].values.map((row) => ({
        date: row[0],
        model: row[1],
        inputTokens: row[2],
        outputTokens: row[3],
        cacheReadTokens: row[4],
        cacheWriteTokens: row[5]
    }));
}
/**
 * Check if database has any data
 */
function hasData() {
    if (!db)
        return false;
    const result = db.exec(`SELECT COUNT(*) FROM daily_snapshots`);
    if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0] > 0;
    }
    return false;
}
/**
 * Get the date of the oldest record
 */
function getOldestDate() {
    if (!db)
        return null;
    const result = db.exec(`SELECT MIN(date) FROM daily_snapshots`);
    if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0]) {
        return result[0].values[0][0];
    }
    return null;
}
/**
 * Get the date of the newest record
 */
function getNewestDate() {
    if (!db)
        return null;
    const result = db.exec(`SELECT MAX(date) FROM daily_snapshots`);
    if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0]) {
        return result[0].values[0][0];
    }
    return null;
}
/**
 * Get total statistics from database
 */
function getTotalStats() {
    if (!db)
        return { totalCost: 0, totalMessages: 0, totalTokens: 0, totalSessions: 0, daysCount: 0 };
    const result = db.exec(`
        SELECT
            COALESCE(SUM(cost), 0) as total_cost,
            COALESCE(SUM(messages), 0) as total_messages,
            COALESCE(SUM(tokens), 0) as total_tokens,
            COALESCE(SUM(sessions), 0) as total_sessions,
            COUNT(*) as days_count
        FROM daily_snapshots
    `);
    if (result.length > 0 && result[0].values.length > 0) {
        const row = result[0].values[0];
        return {
            totalCost: row[0],
            totalMessages: row[1],
            totalTokens: row[2],
            totalSessions: row[3],
            daysCount: row[4]
        };
    }
    return { totalCost: 0, totalMessages: 0, totalTokens: 0, totalSessions: 0, daysCount: 0 };
}
/**
 * Get dates that exist in the database
 */
function getExistingDates() {
    if (!db)
        return new Set();
    const result = db.exec(`SELECT date FROM daily_snapshots`);
    const dates = new Set();
    if (result.length > 0) {
        for (const row of result[0].values) {
            dates.add(row[0]);
        }
    }
    return dates;
}
/**
 * Import data from stats-cache.json (first run or manual import)
 */
async function importFromCache(statsCache) {
    if (!db) {
        await initDatabase();
    }
    if (!db)
        return { imported: 0, skipped: 0 };
    let imported = 0;
    let skipped = 0;
    const existingDates = getExistingDates();
    // Import daily activity
    if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
        // Build a map of date -> tokens by model for cost calculation
        const dailyTokensMap = {};
        if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
            for (const day of statsCache.dailyModelTokens) {
                if (day.date && day.tokensByModel) {
                    dailyTokensMap[day.date] = day.tokensByModel;
                }
            }
        }
        for (const day of statsCache.dailyActivity) {
            if (!day.date)
                continue;
            // Skip if we already have this date
            if (existingDates.has(day.date)) {
                skipped++;
                continue;
            }
            const messages = day.messageCount || 0;
            const tokensByModel = dailyTokensMap[day.date] || {};
            const dayTokens = Object.values(tokensByModel).reduce((sum, t) => sum + (t || 0), 0);
            // Calculate cost using model pricing
            let cost = 0;
            for (const [model, tokens] of Object.entries(tokensByModel)) {
                const pricing = getPricingForModel(model);
                // Approximate split: 30% input, 10% output, 50% cache read, 10% cache write
                const avgRate = (pricing.input * 0.3 + pricing.output * 0.1 + pricing.cacheRead * 0.5 + pricing.cacheWrite * 0.1);
                cost += (tokens / 1000000) * avgRate;
            }
            saveDailySnapshot({
                date: day.date,
                cost,
                messages,
                tokens: dayTokens,
                sessions: day.sessionCount || 0
            });
            // Save model usage breakdown
            for (const [model, tokens] of Object.entries(tokensByModel)) {
                saveModelUsage({
                    date: day.date,
                    model,
                    inputTokens: Math.round(tokens * 0.3),
                    outputTokens: Math.round(tokens * 0.1),
                    cacheReadTokens: Math.round(tokens * 0.5),
                    cacheWriteTokens: Math.round(tokens * 0.1)
                });
            }
            imported++;
        }
    }
    // Save changes to disk
    saveDatabase();
    return { imported, skipped };
}
/**
 * Clear history before a specified date
 * @param beforeDate Date string in YYYY-MM-DD format - all records before this date will be deleted
 * @returns Number of days deleted
 */
function clearHistoryBeforeDate(beforeDate) {
    if (!db)
        return 0;
    try {
        // Count records to be deleted
        const countResult = db.exec(`SELECT COUNT(*) FROM daily_snapshots WHERE date < ?`, [beforeDate]);
        const deleteCount = countResult.length > 0 ? countResult[0].values[0][0] : 0;
        if (deleteCount === 0) {
            return 0;
        }
        // Delete from daily_snapshots
        db.run(`DELETE FROM daily_snapshots WHERE date < ?`, [beforeDate]);
        // Delete from model_usage
        db.run(`DELETE FROM model_usage WHERE date < ?`, [beforeDate]);
        // Save changes to disk
        saveDatabase();
        return deleteCount;
    }
    catch (error) {
        console.error('Claude Analytics: Failed to clear history:', error);
        return 0;
    }
}
// Model pricing helper (duplicated from dataProvider to avoid circular deps)
const MODEL_PRICING = {
    opus: { input: 15, output: 75, cacheRead: 1.875, cacheWrite: 18.75 },
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
//# sourceMappingURL=database.js.map