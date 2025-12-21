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
exports.getUsageLimits = getUsageLimits;
exports.clearLimitsCache = clearLimitsCache;
exports.showLimitsLog = showLimitsLog;
const https = __importStar(require("https"));
const vscode = __importStar(require("vscode"));
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
// Cache for limits data
let limitsCache = null;
let lastFetchTime = 0;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
/**
 * Get OAuth token from Windows Credential Manager
 * Claude Code stores credentials under various service names
 */
async function getOAuthToken() {
    try {
        log('Attempting to get OAuth token from keychain...');
        // Try to dynamically require keytar
        let keytar;
        try {
            keytar = require('keytar');
            log('keytar module loaded successfully');
        }
        catch (e) {
            log(`Failed to load keytar: ${e}`);
            return null;
        }
        // Try different service names Claude Code might use
        const serviceNames = [
            'Claude Code-credentials',
            'claude-code',
            'Claude Code',
            'anthropic-claude',
            'claude'
        ];
        for (const serviceName of serviceNames) {
            log(`Checking service: ${serviceName}`);
            try {
                const credentials = await keytar.findCredentials(serviceName);
                if (credentials && credentials.length > 0) {
                    log(`Found ${credentials.length} credential(s) for ${serviceName}`);
                    const cred = credentials[0];
                    log(`Account: ${cred.account}`);
                    try {
                        // Try to parse as JSON
                        const parsed = JSON.parse(cred.password);
                        const token = parsed.access_token || parsed.token || parsed.accessToken;
                        if (token) {
                            log('Found token in JSON format');
                            return token;
                        }
                    }
                    catch {
                        // Not JSON, might be direct token
                        if (cred.password && cred.password.length > 20) {
                            log('Using password directly as token');
                            return cred.password;
                        }
                    }
                }
            }
            catch (e) {
                log(`Error checking ${serviceName}: ${e}`);
            }
        }
        log('No OAuth token found in any service');
        return null;
    }
    catch (error) {
        log(`Failed to access keychain: ${error}`);
        return null;
    }
}
/**
 * Fetch usage limits from Anthropic OAuth API
 */
async function fetchLimitsFromAPI(token) {
    return new Promise((resolve) => {
        log('Fetching limits from API...');
        const options = {
            hostname: 'api.anthropic.com',
            path: '/api/oauth/usage',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                log(`API response status: ${res.statusCode}`);
                try {
                    if (res.statusCode === 200) {
                        const response = JSON.parse(data);
                        log(`API response: ${JSON.stringify(response)}`);
                        resolve({
                            fiveHour: {
                                percentage: (response.five_hour?.utilization || 0) * 100,
                                resetTime: response.five_hour?.reset_time || ''
                            },
                            sevenDay: {
                                percentage: (response.seven_day?.utilization || 0) * 100,
                                resetTime: response.seven_day?.reset_time || ''
                            },
                            sevenDayOpus: response.seven_day_opus ? {
                                percentage: (response.seven_day_opus?.utilization || 0) * 100,
                                resetTime: response.seven_day_opus?.reset_time || ''
                            } : undefined
                        });
                    }
                    else {
                        log(`API error: ${res.statusCode} - ${data}`);
                        resolve({
                            fiveHour: { percentage: 0, resetTime: '' },
                            sevenDay: { percentage: 0, resetTime: '' },
                            error: `API returned ${res.statusCode}: ${data.substring(0, 100)}`
                        });
                    }
                }
                catch (e) {
                    log(`Parse error: ${e}`);
                    resolve({
                        fiveHour: { percentage: 0, resetTime: '' },
                        sevenDay: { percentage: 0, resetTime: '' },
                        error: 'Failed to parse response'
                    });
                }
            });
        });
        req.on('error', (error) => {
            log(`Request error: ${error.message}`);
            resolve({
                fiveHour: { percentage: 0, resetTime: '' },
                sevenDay: { percentage: 0, resetTime: '' },
                error: error.message
            });
        });
        req.setTimeout(5000, () => {
            log('Request timeout');
            req.destroy();
            resolve({
                fiveHour: { percentage: 0, resetTime: '' },
                sevenDay: { percentage: 0, resetTime: '' },
                error: 'Request timeout'
            });
        });
        req.end();
    });
}
/**
 * Get usage limits with caching
 */
async function getUsageLimits() {
    const now = Date.now();
    // Return cached data if still valid
    if (limitsCache && (now - lastFetchTime) < CACHE_TTL) {
        log('Returning cached limits data');
        return limitsCache;
    }
    // Try to get OAuth token
    const token = await getOAuthToken();
    if (!token) {
        log('No OAuth token available');
        return {
            fiveHour: { percentage: 0, resetTime: '' },
            sevenDay: { percentage: 0, resetTime: '' },
            error: 'No OAuth token found - ensure Claude Code is logged in'
        };
    }
    // Fetch from API
    const data = await fetchLimitsFromAPI(token);
    // Cache successful responses
    if (!data.error) {
        limitsCache = data;
        lastFetchTime = now;
        log('Limits data cached successfully');
    }
    return data;
}
/**
 * Clear the limits cache (useful when user wants to force refresh)
 */
function clearLimitsCache() {
    limitsCache = null;
    lastFetchTime = 0;
    log('Limits cache cleared');
}
/**
 * Show the output channel for debugging
 */
function showLimitsLog() {
    getOutput().show();
}
//# sourceMappingURL=limitsProvider.js.map