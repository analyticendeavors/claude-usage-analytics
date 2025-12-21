const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'limitsProvider.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Add .credentials.json to paths (the actual file name used by Claude Code)
content = content.replace(
    "path.join(homeDir, '.claude', 'credentials.json'),",
    "path.join(homeDir, '.claude', '.credentials.json'),\n            path.join(homeDir, '.claude', 'credentials.json'),"
);

// Fix 2: Remove old .credentials entry (no .json)
content = content.replace(
    /\n            path\.join\(homeDir, '\.claude', '\.credentials'\),/g,
    ''
);

// Fix 3: Replace simple token extraction with nested structure handling
const oldToken = "const token = parsed.access_token || parsed.token || parsed.accessToken || parsed.oauth_token;";
const newToken = `// Handle nested structure like {claudeAiOauth: {accessToken: "..."}}
                    let token = null;
                    if (parsed.claudeAiOauth && parsed.claudeAiOauth.accessToken) {
                        token = parsed.claudeAiOauth.accessToken;
                    } else {
                        token = parsed.access_token || parsed.token || parsed.accessToken || parsed.oauth_token;
                    }`;

content = content.replace(oldToken, newToken);

fs.writeFileSync(filePath, content);
console.log('Fixed limitsProvider.ts!');
