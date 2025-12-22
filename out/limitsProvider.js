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
exports.getSubscriptionInfo = getSubscriptionInfo;
exports.clearSubscriptionCache = clearSubscriptionCache;
exports.showLimitsLog = showLimitsLog;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Output channel for logging
let outputChannel = null;
function getOutput() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Claude Usage Analytics');
    }
    return outputChannel;
}
function log(message) {
    getOutput().appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}
// Cache for subscription data
let subscriptionCache = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Parse the rate limit tier into a friendly display name
 */
function formatTierDisplay(tier, subType) {
    // Parse tier like "default_claude_max_20x" -> "Max 20x"
    if (tier.includes('max_20x')) {
        return 'Max 20x';
    }
    else if (tier.includes('max')) {
        return 'Max';
    }
    else if (tier.includes('pro')) {
        return 'Pro';
    }
    else if (tier.includes('free')) {
        return 'Free';
    }
    // Fallback to subscription type
    if (subType === 'max') {
        return 'Max';
    }
    else if (subType === 'pro') {
        return 'Pro';
    }
    return subType || 'Unknown';
}
/**
 * Get subscription info from Claude Code's credentials file
 */
async function getSubscriptionInfo() {
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
                        const data = {
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
            }
            catch (e) {
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
    }
    catch (error) {
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
function clearSubscriptionCache() {
    subscriptionCache = null;
    lastFetchTime = 0;
    log('Subscription cache cleared');
}
/**
 * Show the output channel for debugging
 */
function showLimitsLog() {
    getOutput().show();
}
//# sourceMappingURL=limitsProvider.js.map