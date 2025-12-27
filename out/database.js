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
exports.getMachineId = getMachineId;
exports.initDatabase = initDatabase;
exports.getDbMetadata = getDbMetadata;
exports.setDbMetadata = setDbMetadata;
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
exports.truncateAllData = truncateAllData;
exports.exportForGistSync = exportForGistSync;
exports.importAndMergeFromGist = importAndMergeFromGist;
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
const SCHEMA_VERSION = 2;
// Machine ID for multi-computer sync
let machineId = null;
/**
 * Get or generate a unique machine ID
 */
function getMachineId() {
    if (machineId)
        return machineId;
    if (db) {
        const stored = getMetadata(db, 'machine_id');
        if (stored) {
            machineId = stored;
            return machineId;
        }
    }
    // Generate new machine ID based on hostname + random suffix
    const hostname = os.hostname();
    const random = Math.random().toString(36).substring(2, 8);
    machineId = `${hostname}-${random}`;
    if (db) {
        setMetadata(db, 'machine_id', machineId);
    }
    return machineId;
}
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
        // Migration to v2: Add machine_id column
        if (version < 2) {
            try {
                database.run(`ALTER TABLE daily_snapshots ADD COLUMN machine_id TEXT DEFAULT 'local'`);
                database.run(`ALTER TABLE model_usage ADD COLUMN machine_id TEXT DEFAULT 'local'`);
            }
            catch (e) {
                // Column may already exist
            }
        }
        setMetadata(database, 'schema_version', SCHEMA_VERSION.toString());
    }
    // Ensure machine ID is stored
    if (!getMetadata(database, 'machine_id')) {
        const hostname = os.hostname();
        const random = Math.random().toString(36).substring(2, 8);
        machineId = `${hostname}-${random}`;
        setMetadata(database, 'machine_id', machineId);
    }
    else {
        machineId = getMetadata(database, 'machine_id');
    }
}
/**
 * Get metadata value (internal - uses provided database)
 */
function getMetadata(database, key) {
    const result = database.exec(`SELECT value FROM metadata WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
    }
    return null;
}
/**
 * Set metadata value (internal - uses provided database)
 */
function setMetadata(database, key, value) {
    database.run(`INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`, [key, value]);
}
/**
 * Get metadata value (public - uses singleton db)
 */
function getDbMetadata(key) {
    if (!db)
        return null;
    return getMetadata(db, key);
}
/**
 * Set metadata value (public - uses singleton db)
 */
function setDbMetadata(key, value) {
    if (!db)
        return;
    setMetadata(db, key, value);
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
 * Truncate all data (for recalculate/reset)
 */
function truncateAllData() {
    if (!db)
        return;
    try {
        db.run(`DELETE FROM daily_snapshots`);
        db.run(`DELETE FROM model_usage`);
        saveDatabase();
        console.log('Claude Analytics: Database truncated');
    }
    catch (error) {
        console.error('Claude Analytics: Failed to truncate database:', error);
    }
}
/**
 * Export all data for Gist sync (with machine ID)
 */
function exportForGistSync() {
    const currentMachineId = getMachineId();
    const snapshots = getAllDailySnapshots().map(s => ({
        ...s,
        machine_id: currentMachineId
    }));
    const modelUsage = getAllModelUsage().map(m => ({
        ...m,
        machine_id: currentMachineId
    }));
    return {
        snapshots,
        modelUsage,
        machineId: currentMachineId,
        metadata: {
            exportedAt: new Date().toISOString(),
            version: '2.0'
        }
    };
}
/**
 * Import and merge data from Gist (combines data from multiple machines)
 */
function importAndMergeFromGist(gistData) {
    if (!db)
        return { imported: 0, merged: 0 };
    const currentMachineId = getMachineId();
    let imported = 0;
    let merged = 0;
    // Get existing dates for this machine
    const existingDates = getExistingDates();
    // Process snapshots - add data from other machines
    for (const snapshot of gistData.snapshots || []) {
        const remoteMachineId = snapshot.machine_id || gistData.machineId || 'unknown';
        // Skip if this is our own data (we already have it)
        if (remoteMachineId === currentMachineId) {
            continue;
        }
        // Check if we have this date already
        if (existingDates.has(snapshot.date)) {
            // Merge: update existing record by adding remote values
            const existing = db.exec(`SELECT cost, messages, tokens, sessions FROM daily_snapshots WHERE date = ?`, [snapshot.date]);
            if (existing.length > 0 && existing[0].values.length > 0) {
                const row = existing[0].values[0];
                const newCost = row[0] + (snapshot.cost || 0);
                const newMessages = row[1] + (snapshot.messages || 0);
                const newTokens = row[2] + (snapshot.tokens || 0);
                const newSessions = row[3] + (snapshot.sessions || 0);
                db.run(`UPDATE daily_snapshots SET cost = ?, messages = ?, tokens = ?, sessions = ? WHERE date = ?`, [newCost, newMessages, newTokens, newSessions, snapshot.date]);
                merged++;
            }
        }
        else {
            // Insert new record
            saveDailySnapshot({
                date: snapshot.date,
                cost: snapshot.cost || 0,
                messages: snapshot.messages || 0,
                tokens: snapshot.tokens || 0,
                sessions: snapshot.sessions || 0
            });
            imported++;
        }
    }
    // Process model usage similarly
    for (const usage of gistData.modelUsage || []) {
        const remoteMachineId = usage.machine_id || gistData.machineId || 'unknown';
        if (remoteMachineId === currentMachineId) {
            continue;
        }
        // Check existing
        const existing = db.exec(`SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM model_usage WHERE date = ? AND model = ?`, [usage.date, usage.model]);
        if (existing.length > 0 && existing[0].values.length > 0) {
            // Merge by adding
            const row = existing[0].values[0];
            db.run(`UPDATE model_usage SET input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ? WHERE date = ? AND model = ?`, [row[0] + (usage.inputTokens || 0),
                row[1] + (usage.outputTokens || 0),
                row[2] + (usage.cacheReadTokens || 0),
                row[3] + (usage.cacheWriteTokens || 0),
                usage.date, usage.model]);
        }
        else {
            saveModelUsage({
                date: usage.date,
                model: usage.model,
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
                cacheReadTokens: usage.cacheReadTokens || 0,
                cacheWriteTokens: usage.cacheWriteTokens || 0
            });
        }
    }
    saveDatabase();
    return { imported, merged };
}
//# sourceMappingURL=database.js.map