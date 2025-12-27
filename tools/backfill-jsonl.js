#!/usr/bin/env node
/**
 * Backfill historical usage data from Claude Code JSONL files
 * Uses streaming for memory efficiency with large files
 * Supports incremental sync via file modification time tracking
 *
 * Usage:
 *   node backfill-jsonl.js                    # Full scan, output to stdout
 *   node backfill-jsonl.js --output file.json # Save to file
 *   node backfill-jsonl.js --incremental      # Only scan changed files
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Model pricing per million tokens - shared with TypeScript modules
const MODEL_PRICING = require('../src/modelPricing.json');

function getModelPricing(modelId) {
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

function calculateCost(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, modelId) {
    const pricing = getModelPricing(modelId);
    const cacheReadRate = pricing.input * 0.1;   // 90% discount for cache reads
    const cacheWriteRate = pricing.input * 1.25; // 25% more for cache writes

    return (inputTokens / 1_000_000) * pricing.input +
           (outputTokens / 1_000_000) * pricing.output +
           (cacheReadTokens / 1_000_000) * cacheReadRate +
           (cacheWriteTokens / 1_000_000) * cacheWriteRate;
}

// Parse command line arguments
const args = process.argv.slice(2);
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
const incremental = args.includes('--incremental');
const verbose = args.includes('--verbose');

const claudeDir = path.join(os.homedir(), '.claude', 'projects');
const stateFile = path.join(os.homedir(), '.claude', 'backfill-state.json');

// Load previous scan state for incremental mode
let previousState = {};
if (incremental && fs.existsSync(stateFile)) {
    try {
        previousState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) {
        previousState = {};
    }
}

// Collect all JSONL files
function findJsonlFiles(dir, files = []) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                findJsonlFiles(fullPath, files);
            } else if (entry.name.endsWith('.jsonl')) {
                const stat = fs.statSync(fullPath);
                files.push({
                    path: fullPath,
                    mtime: stat.mtimeMs,
                    size: stat.size
                });
            }
        }
    } catch (e) {
        // Skip inaccessible directories
    }
    return files;
}

// Process a single JSONL file using streaming
// Returns both token data and which dates this session was active
async function processFile(filePath) {
    // Session = parent directory of the JSONL file (e.g., ~/.claude/projects/<project>/<session-uuid>/)
    const sessionDir = path.dirname(filePath);

    return new Promise((resolve, reject) => {
        const dailyData = {}; // { 'YYYY-MM-DD': { model: { input, output, cacheRead, cacheWrite, messages } } }
        const activeDates = new Set(); // Dates this session had activity

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            if (!line.trim()) return;

            try {
                const entry = JSON.parse(line);

                // Only count assistant messages with usage data
                if (entry.type !== 'assistant' && entry.role !== 'assistant') return;

                const timestamp = entry.timestamp || entry.ts;
                if (!timestamp) return;

                // Convert UTC timestamp to local date for proper date assignment
                const entryDateObj = new Date(timestamp);
                const date = `${entryDateObj.getFullYear()}-${String(entryDateObj.getMonth() + 1).padStart(2, '0')}-${String(entryDateObj.getDate()).padStart(2, '0')}`;

                const usage = entry.message?.usage || entry.usage;
                if (!usage) return;

                activeDates.add(date); // Track that this session was active on this date

                const model = entry.message?.model || entry.model || 'default';
                const inputTokens = usage.input_tokens || 0;
                const outputTokens = usage.output_tokens || 0;
                const cacheReadTokens = usage.cache_read_input_tokens || 0;
                const cacheWriteTokens = usage.cache_creation_input_tokens || 0;

                // Initialize date bucket
                if (!dailyData[date]) {
                    dailyData[date] = {};
                }

                // Initialize model bucket
                if (!dailyData[date][model]) {
                    dailyData[date][model] = {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        messages: 0
                    };
                }

                // Accumulate
                dailyData[date][model].input += inputTokens;
                dailyData[date][model].output += outputTokens;
                dailyData[date][model].cacheRead += cacheReadTokens;
                dailyData[date][model].cacheWrite += cacheWriteTokens;
                dailyData[date][model].messages++;

            } catch (e) {
                // Skip malformed lines
            }
        });

        rl.on('close', () => resolve({ dailyData, sessionDir, activeDates: Array.from(activeDates) }));
        rl.on('error', (err) => reject(err));
    });
}

// Merge file results into global aggregation
// Also tracks unique sessions per date
function mergeResults(global, dailyData, sessionsPerDate, sessionDir, activeDates) {
    // Track unique sessions per date
    for (const date of activeDates) {
        if (!sessionsPerDate[date]) {
            sessionsPerDate[date] = new Set();
        }
        sessionsPerDate[date].add(sessionDir);
    }

    // Merge token data
    for (const [date, models] of Object.entries(dailyData)) {
        if (!global[date]) {
            global[date] = {};
        }
        for (const [model, data] of Object.entries(models)) {
            if (!global[date][model]) {
                global[date][model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 };
            }
            global[date][model].input += data.input;
            global[date][model].output += data.output;
            global[date][model].cacheRead += data.cacheRead;
            global[date][model].cacheWrite += data.cacheWrite;
            global[date][model].messages += data.messages;
        }
    }
}

// Main execution
async function main() {
    if (!fs.existsSync(claudeDir)) {
        const result = { error: 'Claude projects directory not found', dailyStats: [] };
        console.log(JSON.stringify(result));
        return;
    }

    const allFiles = findJsonlFiles(claudeDir);
    const newState = {};

    // Filter to only changed files in incremental mode
    const filesToProcess = incremental
        ? allFiles.filter(f => {
            const prev = previousState[f.path];
            return !prev || prev.mtime < f.mtime;
          })
        : allFiles;

    if (verbose) {
        console.error(`Found ${allFiles.length} JSONL files, processing ${filesToProcess.length}`);
    }

    // Process files and aggregate
    const globalData = {};
    const sessionsPerDate = {}; // { 'YYYY-MM-DD': Set<sessionDir> }
    let processedCount = 0;

    for (const file of filesToProcess) {
        try {
            const { dailyData, sessionDir, activeDates } = await processFile(file.path);
            mergeResults(globalData, dailyData, sessionsPerDate, sessionDir, activeDates);
            newState[file.path] = { mtime: file.mtime, size: file.size };
            processedCount++;

            if (verbose && processedCount % 10 === 0) {
                console.error(`Processed ${processedCount}/${filesToProcess.length} files`);
            }
        } catch (e) {
            if (verbose) {
                console.error(`Error processing ${file.path}: ${e.message}`);
            }
        }
    }

    // Convert to output format with calculated costs
    const dailyStats = [];
    for (const [date, models] of Object.entries(globalData)) {
        let dayMessages = 0;
        let dayInput = 0;
        let dayOutput = 0;
        let dayCacheRead = 0;
        let dayCacheWrite = 0;
        let dayCost = 0;
        const modelBreakdown = [];

        for (const [model, data] of Object.entries(models)) {
            const cost = calculateCost(data.input, data.output, data.cacheRead, data.cacheWrite, model);

            dayMessages += data.messages;
            dayInput += data.input;
            dayOutput += data.output;
            dayCacheRead += data.cacheRead;
            dayCacheWrite += data.cacheWrite;
            dayCost += cost;

            modelBreakdown.push({
                model,
                messages: data.messages,
                inputTokens: data.input,
                outputTokens: data.output,
                cacheReadTokens: data.cacheRead,
                cacheWriteTokens: data.cacheWrite,
                totalTokens: data.input + data.output + data.cacheRead + data.cacheWrite,
                cost: Math.round(cost * 100) / 100
            });
        }

        // Count unique sessions for this date
        const sessions = sessionsPerDate[date] ? sessionsPerDate[date].size : 0;

        dailyStats.push({
            date,
            messages: dayMessages,
            sessions,
            inputTokens: dayInput,
            outputTokens: dayOutput,
            cacheReadTokens: dayCacheRead,
            cacheWriteTokens: dayCacheWrite,
            totalTokens: dayInput + dayOutput + dayCacheRead + dayCacheWrite,
            cost: Math.round(dayCost * 100) / 100,
            models: modelBreakdown
        });
    }

    // Sort by date
    dailyStats.sort((a, b) => a.date.localeCompare(b.date));

    const result = {
        scanTime: new Date().toISOString(),
        filesScanned: processedCount,
        totalFiles: allFiles.length,
        incremental,
        dailyStats
    };

    // Save state for incremental mode
    if (incremental) {
        // Merge with previous state (keep files we didn't re-scan)
        const mergedState = { ...previousState, ...newState };
        fs.writeFileSync(stateFile, JSON.stringify(mergedState, null, 2));
    }

    // Output results
    const output = JSON.stringify(result, null, 2);
    if (outputFile) {
        fs.writeFileSync(outputFile, output);
        if (verbose) {
            console.error(`Results saved to ${outputFile}`);
        }
    }

    // Always output to stdout for child process capture
    console.log(output);
}

main().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
