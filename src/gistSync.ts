/**
 * GitHub Gist sync module for Claude Usage Analytics
 * Handles backup and sync of analytics.db to GitHub Gist
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { exportForGistSync, importAndMergeFromGist, getMachineId, saveDatabase } from './database';

// Database file path
function getDbPath(): string {
    return path.join(os.homedir(), '.claude', 'analytics.db');
}

export interface GistSyncSettings {
    enabled: boolean;
    gistId: string;
    token: string;
    autoSync: boolean;
}

/**
 * Get Gist sync settings from VS Code configuration
 */
export function getGistSettings(): GistSyncSettings {
    const config = vscode.workspace.getConfiguration('claudeUsage.gistSync');
    return {
        enabled: config.get('enabled', false),
        gistId: config.get('gistId', ''),
        token: config.get('token', ''),
        autoSync: config.get('autoSync', true)
    };
}

/**
 * Make an HTTPS request to GitHub API
 */
function githubRequest(
    method: string,
    path: string,
    token: string,
    body?: string
): Promise<{ statusCode: number; data: string }> {
    return new Promise((resolve, reject) => {
        const headers: Record<string, string | number> = {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Claude-Usage-Analytics-VSCode',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };

        if (body) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        }

        const options: https.RequestOptions = {
            hostname: 'api.github.com',
            port: 443,
            path: path,
            method: method,
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode || 0, data });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

/**
 * Create a new private Gist with the database (JSON format for merge support)
 */
export async function createGist(token: string): Promise<string | null> {
    try {
        // Export data with machine ID for multi-computer merge
        const exportData = exportForGistSync();
        const machineId = getMachineId();

        const gistData = {
            description: 'Claude Usage Analytics - Multi-Machine Sync',
            public: false,
            files: {
                'analytics-data.json': {
                    content: JSON.stringify(exportData, null, 2)
                },
                'metadata.json': {
                    content: JSON.stringify({
                        created: new Date().toISOString(),
                        lastSync: new Date().toISOString(),
                        source: 'claude-usage-analytics-vscode',
                        version: '2.0',
                        machineId: machineId,
                        machines: [machineId]
                    }, null, 2)
                }
            }
        };

        const response = await githubRequest('POST', '/gists', token, JSON.stringify(gistData));

        if (response.statusCode === 201) {
            const gist = JSON.parse(response.data);
            return gist.id;
        } else {
            const error = JSON.parse(response.data);
            vscode.window.showErrorMessage(`Claude Analytics: Failed to create Gist - ${error.message || 'Unknown error'}`);
            return null;
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Claude Analytics: Error creating Gist - ${error}`);
        return null;
    }
}

/**
 * Update an existing Gist with the current database (merges with existing data)
 */
export async function updateGist(gistId: string, token: string): Promise<boolean> {
    try {
        // First, fetch and merge existing data from Gist
        const fetchResponse = await githubRequest('GET', `/gists/${gistId}`, token);
        if (fetchResponse.statusCode === 200) {
            const gist = JSON.parse(fetchResponse.data);
            const dataFile = gist.files['analytics-data.json'];

            if (dataFile && dataFile.content) {
                try {
                    const remoteData = JSON.parse(dataFile.content);
                    // Merge remote data into local DB
                    const mergeResult = importAndMergeFromGist(remoteData);
                    if (mergeResult.imported > 0 || mergeResult.merged > 0) {
                        console.log(`Claude Analytics: Merged ${mergeResult.imported} new records, updated ${mergeResult.merged} existing`);
                    }
                } catch (e) {
                    console.log('Claude Analytics: Could not parse existing Gist data, will overwrite');
                }
            }
        }

        // Now export our (merged) data back to Gist
        const exportData = exportForGistSync();
        const machineId = getMachineId();

        const gistData = {
            files: {
                'analytics-data.json': {
                    content: JSON.stringify(exportData, null, 2)
                },
                'metadata.json': {
                    content: JSON.stringify({
                        lastSync: new Date().toISOString(),
                        source: 'claude-usage-analytics-vscode',
                        version: '2.0',
                        machineId: machineId
                    }, null, 2)
                }
            }
        };

        const response = await githubRequest('PATCH', `/gists/${gistId}`, token, JSON.stringify(gistData));

        if (response.statusCode === 200) {
            return true;
        } else {
            const error = JSON.parse(response.data);
            vscode.window.showErrorMessage(`Claude Analytics: Failed to update Gist - ${error.message || 'Unknown error'}`);
            return false;
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Claude Analytics: Error updating Gist - ${error}`);
        return false;
    }
}

/**
 * Sync database to Gist (creates new if needed)
 */
export async function syncToGist(): Promise<boolean> {
    const settings = getGistSettings();

    if (!settings.token) {
        const action = await vscode.window.showErrorMessage(
            'Claude Analytics: No GitHub token configured. Would you like to configure Gist sync now?',
            'Configure',
            'Cancel'
        );
        if (action === 'Configure') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'claudeUsage.gistSync');
        }
        return false;
    }

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Claude Analytics: Syncing to Gist...',
        cancellable: false
    }, async () => {
        if (settings.gistId) {
            // Update existing Gist
            const success = await updateGist(settings.gistId, settings.token);
            if (success) {
                vscode.window.showInformationMessage('Claude Analytics: Database synced to Gist successfully.');
            }
            return success;
        } else {
            // Create new Gist
            const newGistId = await createGist(settings.token);
            if (newGistId) {
                // Save the new Gist ID to settings
                const config = vscode.workspace.getConfiguration('claudeUsage.gistSync');
                await config.update('gistId', newGistId, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Claude Analytics: Created new Gist. ID: ${newGistId}`);
                return true;
            }
            return false;
        }
    });
}

/**
 * Import and merge database from Gist (combines data from multiple machines)
 */
export async function importFromGist(): Promise<boolean> {
    const settings = getGistSettings();

    if (!settings.token) {
        vscode.window.showErrorMessage('Claude Analytics: No GitHub token configured.');
        return false;
    }

    if (!settings.gistId) {
        vscode.window.showErrorMessage('Claude Analytics: No Gist ID configured. Please set a Gist ID first.');
        return false;
    }

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Claude Analytics: Importing and merging from Gist...',
        cancellable: false
    }, async () => {
        try {
            const response = await githubRequest('GET', `/gists/${settings.gistId}`, settings.token);

            if (response.statusCode !== 200) {
                const error = JSON.parse(response.data);
                vscode.window.showErrorMessage(`Claude Analytics: Failed to fetch Gist - ${error.message || 'Unknown error'}`);
                return false;
            }

            const gist = JSON.parse(response.data);

            // Try new JSON format first
            const dataFile = gist.files['analytics-data.json'];
            if (dataFile && dataFile.content) {
                try {
                    const remoteData = JSON.parse(dataFile.content);
                    const result = importAndMergeFromGist(remoteData);
                    saveDatabase();
                    vscode.window.showInformationMessage(
                        `Claude Analytics: Merged ${result.imported} new days, updated ${result.merged} existing days from Gist.`
                    );
                    return true;
                } catch (e) {
                    vscode.window.showErrorMessage(`Claude Analytics: Failed to parse Gist data - ${e}`);
                    return false;
                }
            }

            // Fallback: try old base64 format (for backwards compatibility)
            const dbFile = gist.files['analytics.db.base64'];
            if (dbFile && dbFile.content) {
                // Backup current database
                const dbPath = getDbPath();
                if (fs.existsSync(dbPath)) {
                    const backupPath = dbPath + '.backup-' + Date.now();
                    fs.copyFileSync(dbPath, backupPath);
                }

                // Decode and write new database
                const dbContent = Buffer.from(dbFile.content, 'base64');
                fs.writeFileSync(dbPath, dbContent);

                vscode.window.showInformationMessage(
                    'Claude Analytics: Database imported from Gist (legacy format). Restart VS Code to load new data.'
                );
                return true;
            }

            vscode.window.showErrorMessage('Claude Analytics: Gist does not contain valid analytics data.');
            return false;
        } catch (error) {
            vscode.window.showErrorMessage(`Claude Analytics: Error importing from Gist - ${error}`);
            return false;
        }
    });
}

/**
 * Open Gist sync configuration settings
 */
export function openGistSettings(): void {
    vscode.commands.executeCommand('workbench.action.openSettings', 'claudeUsage.gistSync');
}

/**
 * Auto-sync to Gist if enabled
 * Called after database saves
 */
export async function autoSyncIfEnabled(): Promise<void> {
    const settings = getGistSettings();

    if (settings.enabled && settings.autoSync && settings.token) {
        // Silent sync - don't show notifications for auto-sync
        try {
            if (settings.gistId) {
                await updateGist(settings.gistId, settings.token);
            }
            // If no gistId yet, don't auto-create - user should manually sync first
        } catch (e) {
            // Silent fail for auto-sync
            console.error('Claude Analytics: Auto-sync failed:', e);
        }
    }
}
