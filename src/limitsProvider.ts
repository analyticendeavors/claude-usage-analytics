import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Output channel for logging
let outputChannel: vscode.OutputChannel | null = null;

function getOutput(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Claude Usage Analytics');
    }
    return outputChannel;
}

function log(message: string): void {
    getOutput().appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// Cache for subscription data
let subscriptionCache: SubscriptionData | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface SubscriptionData {
    subscriptionType: string;
    rateLimitTier: string;
    tierDisplay: string;
    error?: string;
}

/**
 * Parse the rate limit tier into a friendly display name
 */
function formatTierDisplay(tier: string, subType: string): string {
    // Parse tier like "default_claude_max_20x" -> "Max 20x"
    if (tier.includes('max_20x')) {
        return 'Max 20x';
    } else if (tier.includes('max')) {
        return 'Max';
    } else if (tier.includes('pro')) {
        return 'Pro';
    } else if (tier.includes('free')) {
        return 'Free';
    }

    // Fallback to subscription type
    if (subType === 'max') {
        return 'Max';
    } else if (subType === 'pro') {
        return 'Pro';
    }

    return subType || 'Unknown';
}

/**
 * Get subscription info from Claude Code's credentials file
 */
export async function getSubscriptionInfo(): Promise<SubscriptionData> {
    const now = Date.now();

    // Return cached data if still valid
    if (subscriptionCache && (now - lastFetchTime) < CACHE_TTL) {
        log('Returning cached subscription data');
        return subscriptionCache;
    }

    try {
        log('Reading subscription info from credentials...');

        const homeDir = os.homedir();
        const credentialsPaths = [
            path.join(homeDir, '.claude', '.credentials.json'),
            path.join(homeDir, '.claude', 'credentials.json'),
        ];

        for (const credPath of credentialsPaths) {
            try {
                if (fs.existsSync(credPath)) {
                    log(`Found credentials file: ${credPath}`);
                    const content = fs.readFileSync(credPath, 'utf8');
                    const parsed = JSON.parse(content);

                    // Handle nested structure {claudeAiOauth: {...}}
                    const oauth = parsed.claudeAiOauth || parsed;
                    const subType = oauth.subscriptionType || '';
                    const tier = oauth.rateLimitTier || '';

                    if (subType || tier) {
                        const data: SubscriptionData = {
                            subscriptionType: subType,
                            rateLimitTier: tier,
                            tierDisplay: formatTierDisplay(tier, subType)
                        };

                        // Cache it
                        subscriptionCache = data;
                        lastFetchTime = now;
                        log(`Found subscription: ${data.tierDisplay}`);
                        return data;
                    }
                }
            } catch (e) {
                log(`Error reading ${credPath}: ${e}`);
            }
        }

        log('No subscription info found');
        return {
            subscriptionType: '',
            rateLimitTier: '',
            tierDisplay: 'N/A',
            error: 'No Claude Code credentials found'
        };
    } catch (error) {
        log(`Failed to get subscription info: ${error}`);
        return {
            subscriptionType: '',
            rateLimitTier: '',
            tierDisplay: 'N/A',
            error: 'Failed to read credentials'
        };
    }
}

/**
 * Clear the subscription cache
 */
export function clearSubscriptionCache(): void {
    subscriptionCache = null;
    lastFetchTime = 0;
    log('Subscription cache cleared');
}

/**
 * Show the output channel for debugging
 */
export function showLimitsLog(): void {
    getOutput().show();
}
