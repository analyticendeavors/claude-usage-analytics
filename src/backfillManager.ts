import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import {
    saveDailySnapshot,
    saveModelUsage,
    saveDatabase,
    DailySnapshot,
    ModelUsageRecord
} from './database';
import MODEL_PRICING from './modelPricing.json';

function getModelPricing(modelId: string): { input: number; output: number } {
    if (!modelId) return MODEL_PRICING['default'];
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (modelId.includes(key) || key.includes(modelId)) {
            return pricing;
        }
    }
    if (modelId.includes('opus')) return MODEL_PRICING['claude-3-opus-20240229'];
    if (modelId.includes('haiku')) return MODEL_PRICING['claude-3-5-haiku-20241022'];
    return MODEL_PRICING['default'];
}

function calculateCost(inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, modelId: string): number {
    const pricing = getModelPricing(modelId);
    const cacheReadRate = pricing.input * 0.1;   // 90% discount
    const cacheWriteRate = pricing.input * 1.25; // 25% premium

    return (inputTokens / 1_000_000) * pricing.input +
           (outputTokens / 1_000_000) * pricing.output +
           (cacheReadTokens / 1_000_000) * cacheReadRate +
           (cacheWriteTokens / 1_000_000) * cacheWriteRate;
}

// Backfill result types (from backfill-jsonl.js output)
interface ModelBreakdown {
    model: string;
    messages: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    cost: number;
}

interface DailyStats {
    date: string;
    messages: number;
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    cost: number;
    models: ModelBreakdown[];
}

interface BackfillResult {
    scanTime: string;
    filesScanned: number;
    totalFiles: number;
    incremental: boolean;
    dailyStats: DailyStats[];
    error?: string;
}

/**
 * Run the JSONL backfill process
 * @param extensionPath Path to the extension folder (for finding the script)
 * @param incremental If true, only scan files changed since last run
 * @returns Promise with the backfill results
 */
export async function runBackfill(extensionPath: string, incremental: boolean = false): Promise<BackfillResult> {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(extensionPath, 'tools', 'backfill-jsonl.js');
        const args = incremental ? ['--incremental'] : [];

        execFile('node', [scriptPath, ...args], { timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Backfill script failed: ${error.message}`));
                return;
            }

            try {
                const result: BackfillResult = JSON.parse(stdout.trim());
                if (result.error) {
                    reject(new Error(result.error));
                    return;
                }
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse backfill results: ${e}`));
            }
        });
    });
}

/**
 * Import backfill results into SQLite database
 * @param result The backfill result from runBackfill
 */
export function importBackfillResults(result: BackfillResult): { daysImported: number; modelsImported: number } {
    let daysImported = 0;
    let modelsImported = 0;

    for (const day of result.dailyStats) {
        // Save daily snapshot
        const snapshot: DailySnapshot = {
            date: day.date,
            cost: day.cost,
            messages: day.messages,
            tokens: day.totalTokens,
            sessions: day.sessions || 0 // Sessions counted from unique JSONL directories
        };
        saveDailySnapshot(snapshot);
        daysImported++;

        // Save model usage breakdown
        for (const model of day.models) {
            const usage: ModelUsageRecord = {
                date: day.date,
                model: model.model,
                inputTokens: model.inputTokens,
                outputTokens: model.outputTokens,
                cacheReadTokens: model.cacheReadTokens,
                cacheWriteTokens: model.cacheWriteTokens
            };
            saveModelUsage(usage);
            modelsImported++;
        }
    }

    // Persist to disk
    saveDatabase();

    return { daysImported, modelsImported };
}

/**
 * Run backfill with VS Code progress UI
 * @param extensionPath Path to the extension folder
 * @param incremental If true, only scan files changed since last run
 */
export async function runBackfillWithProgress(
    extensionPath: string,
    incremental: boolean = false
): Promise<{ daysImported: number; modelsImported: number; filesScanned: number }> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: incremental ? 'Updating historical costs...' : 'Recalculating historical costs...',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Scanning JSONL files...' });

            try {
                const result = await runBackfill(extensionPath, incremental);

                progress.report({ message: `Importing ${result.dailyStats.length} days...` });

                const imported = importBackfillResults(result);

                return {
                    daysImported: imported.daysImported,
                    modelsImported: imported.modelsImported,
                    filesScanned: result.filesScanned
                };
            } catch (error) {
                throw error;
            }
        }
    );
}
