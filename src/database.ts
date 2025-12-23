import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import initSqlJs, { Database } from 'sql.js';

// Database singleton
let db: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;

// Database file path
function getDbPath(): string {
    return path.join(os.homedir(), '.claude', 'analytics.db');
}

// Schema version for migrations
const SCHEMA_VERSION = 1;

/**
 * Initialize the SQLite database (creates tables if needed)
 */
export async function initDatabase(): Promise<Database> {
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
            // Initialize sql.js
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
            } else {
                db = new SQL.Database();
            }

            // Create schema if needed
            createSchema(db);

            // Check and run migrations
            runMigrations(db);

            return db;
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    })();

    return dbInitPromise;
}

/**
 * Create database schema
 */
function createSchema(database: Database): void {
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
function runMigrations(database: Database): void {
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
function getMetadata(database: Database, key: string): string | null {
    const result = database.exec(`SELECT value FROM metadata WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0] as string;
    }
    return null;
}

/**
 * Set metadata value
 */
function setMetadata(database: Database, key: string, value: string): void {
    database.run(`INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`, [key, value]);
}

/**
 * Save database to disk
 */
export function saveDatabase(): void {
    if (!db) return;

    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(getDbPath(), buffer);
    } catch (error) {
        console.error('Failed to save database:', error);
    }
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        dbInitPromise = null;
    }
}

// ============ Data Types ============

export interface DailySnapshot {
    date: string;
    cost: number;
    messages: number;
    tokens: number;
    sessions: number;
}

export interface ModelUsageRecord {
    date: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

// ============ CRUD Operations ============

/**
 * Save or update a daily snapshot
 */
export function saveDailySnapshot(snapshot: DailySnapshot): void {
    if (!db) return;

    db.run(`
        INSERT OR REPLACE INTO daily_snapshots (date, cost, messages, tokens, sessions)
        VALUES (?, ?, ?, ?, ?)
    `, [snapshot.date, snapshot.cost, snapshot.messages, snapshot.tokens, snapshot.sessions]);
}

/**
 * Save or update model usage for a day
 */
export function saveModelUsage(usage: ModelUsageRecord): void {
    if (!db) return;

    db.run(`
        INSERT OR REPLACE INTO model_usage (date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [usage.date, usage.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens]);
}

/**
 * Get all daily snapshots from database
 */
export function getAllDailySnapshots(): DailySnapshot[] {
    if (!db) return [];

    const result = db.exec(`
        SELECT date, cost, messages, tokens, sessions
        FROM daily_snapshots
        ORDER BY date ASC
    `);

    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }

    return result[0].values.map((row: (string | number | Uint8Array | null)[]) => ({
        date: row[0] as string,
        cost: row[1] as number,
        messages: row[2] as number,
        tokens: row[3] as number,
        sessions: row[4] as number
    }));
}

/**
 * Get model usage for a specific date
 */
export function getModelUsageForDate(date: string): ModelUsageRecord[] {
    if (!db) return [];

    const result = db.exec(`
        SELECT date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        FROM model_usage
        WHERE date = ?
    `, [date]);

    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }

    return result[0].values.map((row: (string | number | Uint8Array | null)[]) => ({
        date: row[0] as string,
        model: row[1] as string,
        inputTokens: row[2] as number,
        outputTokens: row[3] as number,
        cacheReadTokens: row[4] as number,
        cacheWriteTokens: row[5] as number
    }));
}

/**
 * Get all model usage records
 */
export function getAllModelUsage(): ModelUsageRecord[] {
    if (!db) return [];

    const result = db.exec(`
        SELECT date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        FROM model_usage
        ORDER BY date ASC
    `);

    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }

    return result[0].values.map((row: (string | number | Uint8Array | null)[]) => ({
        date: row[0] as string,
        model: row[1] as string,
        inputTokens: row[2] as number,
        outputTokens: row[3] as number,
        cacheReadTokens: row[4] as number,
        cacheWriteTokens: row[5] as number
    }));
}

/**
 * Check if database has any data
 */
export function hasData(): boolean {
    if (!db) return false;

    const result = db.exec(`SELECT COUNT(*) FROM daily_snapshots`);
    if (result.length > 0 && result[0].values.length > 0) {
        return (result[0].values[0][0] as number) > 0;
    }
    return false;
}

/**
 * Get the date of the oldest record
 */
export function getOldestDate(): string | null {
    if (!db) return null;

    const result = db.exec(`SELECT MIN(date) FROM daily_snapshots`);
    if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0]) {
        return result[0].values[0][0] as string;
    }
    return null;
}

/**
 * Get the date of the newest record
 */
export function getNewestDate(): string | null {
    if (!db) return null;

    const result = db.exec(`SELECT MAX(date) FROM daily_snapshots`);
    if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0]) {
        return result[0].values[0][0] as string;
    }
    return null;
}

/**
 * Get total statistics from database
 */
export function getTotalStats(): { totalCost: number; totalMessages: number; totalTokens: number; totalSessions: number; daysCount: number } {
    if (!db) return { totalCost: 0, totalMessages: 0, totalTokens: 0, totalSessions: 0, daysCount: 0 };

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
            totalCost: row[0] as number,
            totalMessages: row[1] as number,
            totalTokens: row[2] as number,
            totalSessions: row[3] as number,
            daysCount: row[4] as number
        };
    }

    return { totalCost: 0, totalMessages: 0, totalTokens: 0, totalSessions: 0, daysCount: 0 };
}

/**
 * Get dates that exist in the database
 */
export function getExistingDates(): Set<string> {
    if (!db) return new Set();

    const result = db.exec(`SELECT date FROM daily_snapshots`);
    const dates = new Set<string>();

    if (result.length > 0) {
        for (const row of result[0].values) {
            dates.add(row[0] as string);
        }
    }

    return dates;
}

/**
 * Import data from stats-cache.json (first run or manual import)
 */
export async function importFromCache(statsCache: any): Promise<{ imported: number; skipped: number }> {
    if (!db) {
        await initDatabase();
    }
    if (!db) return { imported: 0, skipped: 0 };

    let imported = 0;
    let skipped = 0;

    const existingDates = getExistingDates();

    // Import daily activity
    if (statsCache.dailyActivity && Array.isArray(statsCache.dailyActivity)) {
        // Build a map of date -> tokens by model for cost calculation
        const dailyTokensMap: { [date: string]: { [model: string]: number } } = {};
        if (statsCache.dailyModelTokens && Array.isArray(statsCache.dailyModelTokens)) {
            for (const day of statsCache.dailyModelTokens) {
                if (day.date && day.tokensByModel) {
                    dailyTokensMap[day.date] = day.tokensByModel;
                }
            }
        }

        for (const day of statsCache.dailyActivity) {
            if (!day.date) continue;

            // Skip if we already have this date
            if (existingDates.has(day.date)) {
                skipped++;
                continue;
            }

            const messages = day.messageCount || 0;
            const tokensByModel = dailyTokensMap[day.date] || {};
            const dayTokens = Object.values(tokensByModel).reduce((sum: number, t: any) => sum + (t || 0), 0);

            // Calculate cost using model pricing
            let cost = 0;
            for (const [model, tokens] of Object.entries(tokensByModel)) {
                const pricing = getPricingForModel(model);
                // Approximate split: 30% input, 10% output, 50% cache read, 10% cache write
                const avgRate = (pricing.input * 0.3 + pricing.output * 0.1 + pricing.cacheRead * 0.5 + pricing.cacheWrite * 0.1);
                cost += ((tokens as number) / 1_000_000) * avgRate;
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
                    inputTokens: Math.round((tokens as number) * 0.3),
                    outputTokens: Math.round((tokens as number) * 0.1),
                    cacheReadTokens: Math.round((tokens as number) * 0.5),
                    cacheWriteTokens: Math.round((tokens as number) * 0.1)
                });
            }

            imported++;
        }
    }

    // Save changes to disk
    saveDatabase();

    return { imported, skipped };
}

// Model pricing helper (duplicated from dataProvider to avoid circular deps)
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
