#!/usr/bin/env node
/**
 * Scans Claude Code JSONL files for today's usage data
 * Outputs to ~/.claude/live-today-stats.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

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
    // Cache tokens are much cheaper
    const cacheReadRate = pricing.input * 0.1;  // 90% discount for cache reads
    const cacheWriteRate = pricing.input * 1.25; // 25% more for cache writes

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * cacheReadRate;
    const cacheWriteCost = (cacheWriteTokens / 1_000_000) * cacheWriteRate;

    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

function getTodayDateString() {
    const now = new Date();
    // Use local time, not UTC
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function scanJsonlFiles() {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    const today = getTodayDateString();

    const stats = {
        date: today,
        messages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        cost: 0,
        models: {},
        filesScanned: 0,
        conversations: 0,
        scanTime: new Date().toISOString()
    };

    if (!fs.existsSync(claudeDir)) {
        return stats;
    }

    function processDirectory(dirPath) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    processDirectory(fullPath);
                } else if (entry.name.endsWith('.jsonl')) {
                    processJsonlFile(fullPath);
                }
            }
        } catch (e) {
            // Skip directories we can't access
        }
    }

    function processJsonlFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            let hasToday = false;

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);

                    // Check if this entry is from today
                    const timestamp = entry.timestamp || entry.ts;
                    if (!timestamp) continue;

                    // Convert UTC timestamp to local date for proper comparison
                    const entryDateObj = new Date(timestamp);
                    const entryDate = `${entryDateObj.getFullYear()}-${String(entryDateObj.getMonth() + 1).padStart(2, '0')}-${String(entryDateObj.getDate()).padStart(2, '0')}`;
                    if (entryDate !== today) continue;

                    hasToday = true;

                    // Count messages
                    if (entry.type === 'assistant' || entry.role === 'assistant') {
                        stats.messages++;

                        // Extract token usage
                        const usage = entry.message?.usage || entry.usage;
                        if (usage) {
                            const inputTokens = usage.input_tokens || 0;
                            const outputTokens = usage.output_tokens || 0;
                            const cacheReadTokens = usage.cache_read_input_tokens || 0;
                            const cacheWriteTokens = usage.cache_creation_input_tokens || 0;

                            stats.inputTokens += inputTokens;
                            stats.outputTokens += outputTokens;
                            stats.cacheReadTokens += cacheReadTokens;
                            stats.cacheWriteTokens += cacheWriteTokens;
                            stats.totalTokens += inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

                            // Get model and calculate cost (with cache token discounts)
                            const model = entry.message?.model || entry.model || 'default';
                            const cost = calculateCost(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model);
                            stats.cost += cost;

                            // Track by model (with full token breakdown for SQLite persistence)
                            if (!stats.models[model]) {
                                stats.models[model] = {
                                    messages: 0,
                                    inputTokens: 0,
                                    outputTokens: 0,
                                    cacheReadTokens: 0,
                                    cacheWriteTokens: 0,
                                    tokens: 0,
                                    cost: 0
                                };
                            }
                            stats.models[model].messages++;
                            stats.models[model].inputTokens += inputTokens;
                            stats.models[model].outputTokens += outputTokens;
                            stats.models[model].cacheReadTokens += cacheReadTokens;
                            stats.models[model].cacheWriteTokens += cacheWriteTokens;
                            stats.models[model].tokens += inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
                            stats.models[model].cost += cost;
                        }
                    }
                } catch (e) {
                    // Skip malformed lines
                }
            }

            if (hasToday) {
                stats.filesScanned++;
                stats.conversations++;
            }
        } catch (e) {
            // Skip files we can't read
        }
    }

    processDirectory(claudeDir);

    // Round cost for display
    stats.cost = Math.round(stats.cost * 100) / 100;

    return stats;
}

// Main execution
const stats = scanJsonlFiles();
const outputPath = path.join(os.homedir(), '.claude', 'live-today-stats.json');

fs.writeFileSync(outputPath, JSON.stringify(stats, null, 2));

// Output for child process to capture
console.log(JSON.stringify(stats));
