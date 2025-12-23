# Claude Usage Analytics

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.95%2B-007ACC)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

---

> **Inspired by [Claude Goblin](https://github.com/data-goblin/claude-goblin)** by [Kurt Buhler](https://github.com/data-goblin) - A brilliant tool for analyzing Claude usage data. Kurt's innovative approach to persisting usage history beyond Claude Code's rolling 30-day window directly inspired the SQLite persistence feature in this extension. Check out his work!

---

## What is Claude Usage Analytics?

**Claude Usage Analytics** is a VS Code extension that provides real-time insights into your Claude Code usage. Built by [Reid Havens](https://www.linkedin.com/in/reidhavens/) of [**Analytic Endeavors**](https://analyticendeavors.com/), this tool transforms raw usage data into actionable intelligence—helping you understand costs, monitor usage patterns, and discover insights in your AI-assisted development workflow.

> *Track your Claude Code usage with real-time analytics in VS Code. Monitor costs, tokens, and subscription tier. Explore personality insights, achievement badges, and coding patterns. Features a 4-tab dashboard and 7 status bar widgets showing lifetime costs, daily spending, cache efficiency, and usage trends.*

---

## Screenshots

![Status Bar with Tooltip](screenshots/status%20bar%20and%20tooltip.png)

<details>
<summary><b>View Dashboard Screenshots</b></summary>

### Overview
![Overview Report](screenshots/overview%20report.png)

### Cost Analysis
![Cost Report](screenshots/cost%20report.png)

### Messages
![Messages Report](screenshots/messages%20report.png)

### Personality
![Personality Report](screenshots/personality%20report.png)

</details>

---

## Key Features

### Status Bar Widgets
Seven live statistics widgets always visible at a glance:

| Widget | Icon | Displays | Click Action |
|--------|------|----------|--------------|
| **Local History Cost** | `$(graph)` | Total spending (local storage) | Opens Overview tab |
| **Today's Cost** | `$(calendar)` | Real-time current day usage | Opens Cost tab |
| **Messages** | `$(comment-discussion)` | Total message count | Opens Messages tab |
| **Tokens** | `$(symbol-number)` | Token consumption | Opens Messages tab |
| **Personality** | Emoji | Politeness score % | Opens Personality tab |
| **Activity** | Chart | Code blocks generated | Opens Personality tab |
| **Subscription** | `$(pulse)` | Subscription tier (Max 20x, Pro, etc.) | Opens Overview tab |

### Interactive Dashboard
A comprehensive 4-tab analytics panel with deep insights:

| Tab | Content |
|-----|---------|
| **Overview** | Hero stats, quick metrics, daily activity visualization, model distribution breakdown |
| **Cost** | Detailed cost analysis, 7-day trends, monthly projections, highest spending days, cache savings calculations |
| **Messages** | Token breakdown (input/output/cache), peak usage hours, activity patterns, session statistics |
| **Personality** | Achievement badges, personality trait scores, expression analysis, mood & sentiment tracking |

---

## Feature Details

### Cost Analytics
*Understand exactly where your tokens go*

- **Real-time cost tracking** with model-specific pricing (Opus vs Sonnet rates)
- **Real-time today's cost** calculated directly from conversation files
- **Daily/weekly/monthly breakdowns** with trend analysis
- **Cost projections** based on your usage patterns
- **Cache savings calculator** showing money saved through prompt caching
- **Comparison metrics** vs yesterday and vs average day
- **Highest spending day** identification

### Personality Insights
*Discover your unique interaction style*

- **Politeness Score** — Measures "please" and "thanks" frequency
- **Frustration Index** — Tracks caps lock usage, expletives, and facepalms
- **Curiosity Score** — Questions asked per message ratio
- **Achievement Badges** — Unlock milestones as you hit usage goals:
  - Token Titan (1M+ tokens)
  - Conversation Master (1000+ messages)
  - Streak Champion (7+ day streak)
  - Politeness Pro (80%+ politeness)
  - *...and more!*

### Subscription Display
*Know your current plan at a glance*

- **Subscription tier display** — Shows Max 20x, Max, Pro, or Free
- **Plan information** from Claude Code credentials
- **Green status indicator** when tier is detected

### Activity Tracking
*Analyze your coding patterns*

- **Code blocks generated** with line counts
- **Top programming languages** used
- **Request type distribution** (debugging, features, explanations, refactoring)
- **Peak hours analysis** — when you're most active
- **Night owl vs early bird** scoring

> **Note**: Code block statistics are collected from your extension install date forward. To include historical code stats, use the [backfill script](#backfill-from-claudeai-export-optional) with your Claude.ai data export.

---

## Privacy & Security

This extension prioritizes your privacy:

| Aspect | Implementation |
|--------|----------------|
| **Data Location** | All data stays on your machine |
| **Network Calls** | None — fully offline operation |
| **Telemetry** | None — zero tracking or analytics |
| **Open Source** | Full source code available for audit |

**Data Sources:**
- `~/.claude/stats-cache.json` — Token usage and model statistics (Claude Code's rolling 30-day window, updated periodically by Claude Code)
- `~/.claude/analytics.db` — SQLite database preserving your full usage history (managed by this extension)
- `~/.claude/conversation-stats-cache.json` — Personality and code stats (updated by backfill script)
- `~/.claude/projects/*/` — Conversation history for personality analysis and real-time today's cost
- `~/.claude/.credentials.json` — Subscription tier information (read-only)

> **Note**: Today's stats may show $0.00 if Claude Code hasn't updated its cache yet. End your session or wait for the automatic cache update to see current data.

---

## Data & History

### Initial Data Window

When you first install the extension, your "Local History" stats will only include data from Claude Code's cache file—typically the **last ~30 days**. This is because Claude Code maintains a rolling window and doesn't preserve older data.

### Automatic History Accumulation

Once installed, the extension automatically saves your usage data to a local SQLite database (`~/.claude/analytics.db`). **From this point forward, your history is preserved forever**—even as Claude Code's cache rolls over.

Over time, your "Local History" totals will grow to include months or years of usage data.

### Managing History

Use the **"Claude Analytics: Clear History Before Date"** command to remove old data:

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Claude Analytics: Clear History"
3. Select a cutoff date
4. Confirm deletion

This is useful if you want to reset your stats or remove data from a specific period.

### Backfill from Claude.ai Export (Optional)

Want to import your full Claude.ai conversation history? You can backfill data from a Claude.ai data export:

1. Export your data from [claude.ai](https://claude.ai) (Settings > Account > Export Data)
2. Extract the downloaded ZIP file
3. Run the included Python script:

```bash
python backfill_claude_export.py "path/to/data-export-folder"
```

This imports:
- Daily message counts and estimated token usage
- Estimated API-equivalent costs
- **Code blocks and lines of code** (with language breakdown)
- Personality analysis (questions, please/thanks, etc.)
- Activity patterns (peak hours, night owl/early bird scores)
- Claude thinking time analytics
- User active time estimates

**Why backfill?** The extension can only track code blocks and personality stats from the day you install it. Running the backfill script imports your complete history from Claude.ai, giving you accurate lifetime statistics.

See [BACKFILL_GUIDE.md](BACKFILL_GUIDE.md) for detailed instructions.

---

## Installation

### Option 1: From VS Code Marketplace (Recommended)

Search for **"Claude Usage Analytics"** in the VS Code Extensions panel, or install via command line:

```bash
code --install-extension analyticendeavors.claude-usage-analytics
```

### Option 2: From Source

```bash
# Clone the repository
git clone https://github.com/analyticendeavors/claude-usage-analytics.git
cd claude-usage-analytics

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package the extension
npx vsce package

# Install the generated .vsix
code --install-extension claude-usage-analytics-1.1.0.vsix
```

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **VS Code** | Version 1.95.0 or higher |
| **Claude Code CLI** | Must be installed and authenticated |
| **Operating System** | Windows 10/11, macOS, or Linux |
| **Node.js** | v18+ (for building from source) |

### Pre-requisites

1. **Install Claude Code CLI**: Follow [Anthropic's installation guide](https://docs.anthropic.com/claude-code)
2. **Authenticate**: Run `claude auth login` to authenticate
3. **Verify**: Run `claude --version` to confirm installation

---

## Usage Guide

### Status Bar Navigation

The extension adds widgets to your VS Code status bar:
- **Left side**: Cost, messages, tokens, personality, activity stats
- **Right side**: Subscription tier indicator

**Click any widget** to open the dashboard focused on the relevant tab. Each tooltip shows "Click to open [Tab Name]" for easy navigation.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+C` | Show Analytics Panel |
| `Ctrl+Alt+R` | Refresh All Data |

*On macOS, use `Cmd` instead of `Ctrl`*

### Command Palette

Access via `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac):

| Command | Description |
|---------|-------------|
| `Refresh Claude Usage` | Force refresh all statistics |
| `Show Claude Analytics Panel` | Open the dashboard |
| `Show Claude Analytics - Overview` | Jump to Overview tab |
| `Show Claude Analytics - Cost` | Jump to Cost tab |
| `Show Claude Analytics - Messages` | Jump to Messages tab |
| `Show Claude Analytics - Personality` | Jump to Personality tab |

---

## Architecture Overview

```
claude-usage-analytics/
├── src/
│   ├── extension.ts        # Extension entry point & command registration
│   ├── statusBar.ts        # 7 status bar widgets with tooltips
│   ├── dashboardView.ts    # 4-tab webview dashboard
│   ├── dataProvider.ts     # Stats parsing, cost calculations & real-time today
│   ├── database.ts         # SQLite persistence for historical data
│   └── limitsProvider.ts   # Subscription tier from credentials
├── out/                    # Compiled JavaScript
├── media/
│   ├── icon.png           # Extension icon (128x128)
│   └── claude-icon.svg    # Activity bar icon
└── package.json           # Extension manifest & configuration
```

### Key Components

| Component | Responsibility |
|-----------|----------------|
| **StatusBarManager** | Creates and updates 7 status bar items with rich tooltips |
| **DashboardViewProvider** | Renders the 4-tab webview with real-time data |
| **getUsageData()** | Parses `stats-cache.json` and calculates all metrics |
| **getTodayRealTimeUsage()** | Reads JSONL files for accurate today's cost |
| **getSubscriptionInfo()** | Reads subscription tier from credentials file |

---

## Frequently Asked Questions

### Why don't I see any data?
Ensure Claude Code CLI is installed and you've used it at least once. The extension reads from `~/.claude/stats-cache.json` which is created after your first Claude Code session.

### How accurate are the cost calculations?
Costs use model-specific pricing:
- **Claude Opus 4.5**: $15/1M input, $75/1M output, $18.75/1M cache write, $1.50/1M cache read
- **Claude Sonnet**: $3/1M input, $15/1M output

Today's cost is calculated in real-time from conversation files for maximum accuracy.

### Why does the subscription widget show "N/A"?
Claude Code credentials may not be found. Ensure you're authenticated with `claude auth login`.

### How often does data refresh?
- **Automatic**: Every 2 minutes
- **Manual**: Click refresh button or press `Ctrl+Alt+R`

### Why does "Today's" usage show $0.00 when I'm actively using Claude?
The extension reads from Claude Code's cache file (`~/.claude/stats-cache.json`), which Claude Code updates periodically - **not in real-time**. Your current session data won't appear until Claude Code writes to the cache.

**To force a cache update:**
1. End your current Claude Code session (close the terminal or run `/exit`)
2. Start a new session - this typically triggers a cache write
3. Alternatively, wait for Claude Code's automatic cache update (varies by activity)

The extension does calculate real-time today's cost by reading conversation JSONL files directly, but token counts and message stats rely on the cache.

### Is my data sent anywhere?
No. All analysis happens locally. There are no network calls — the extension operates fully offline.

### Can I use this without Claude Code CLI?
No. This extension specifically reads Claude Code's local statistics files. It's designed as a companion tool for Claude Code users.

---

## Troubleshooting

### Status bar shows "Claude" but no statistics

1. Verify Claude Code is installed: `claude --version`
2. Check authentication: `claude auth status`
3. Confirm stats file exists: `ls ~/.claude/stats-cache.json`
4. Try using Claude Code once to generate initial data

### Subscription shows "N/A"

1. Re-authenticate: `claude auth login`
2. Restart VS Code
3. Check credentials file exists: `ls ~/.claude/.credentials.json`

### Dashboard not loading

1. Try the refresh command: `Ctrl+Alt+R`
2. Reload VS Code window: `Ctrl+Shift+P` > "Reload Window"
3. Check for extension errors in Developer Tools: `Ctrl+Shift+I`

### Personality stats seem wrong

Personality analysis requires conversation history in `~/.claude/projects/`. If you recently cleared your history or are using a new machine, stats will rebuild over time.

---

## Development

### Setup

```bash
git clone https://github.com/analyticendeavors/claude-usage-analytics.git
cd claude-usage-analytics
npm install
```

### Build Commands

```bash
npm run compile    # Build once
npm run watch      # Watch mode for development
npm run lint       # Run ESLint
npx vsce package   # Create .vsix package
```

### Testing Locally

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. The extension will load in the new window

---

## Changelog

### v1.1.0 (2025-12-22)
- **SQLite persistence**: Your usage history is now preserved forever in a local SQLite database, surviving Claude Code's 30-day rolling window
- **Historical data import**: On first install, automatically imports existing data from stats-cache.json
- **Local history stats**: "Local History" totals now include full data from your local SQLite database, not just the last 30 days
- **7 new achievements**: Token Titan (1M+ tokens), $100 Club, $500 Spender, $1K Whale, Refactor Pro, Refactor King, Weekend Warrior
- **Export to CSV/JSON**: Export your usage data via dashboard button or view title menu
- **Budget tracking**: New `dailyBudget` and `weeklyBudget` settings with status bar color coding (green/yellow/red)
- **Cost alerts**: New `costAlertThreshold` setting triggers VS Code notifications when daily cost exceeds threshold
- **Date range filter**: Filter dashboard stats by Last 7 days, Last 30 days, This Month, or All Time
- **Session breakdown**: New section in Messages tab showing recent sessions with project, messages, tokens, and cost
- **Activity heatmap**: GitHub-style contribution calendar on Personality tab showing last 90 days of activity
- **Theme-aware colors**: All UI elements now adapt to light and dark VS Code themes

### v1.0.3 (2025-12-21)
- **Real-time today's cost**: Now reads directly from conversation JSONL files for accurate current-day statistics
- **Subscription tier display**: Shows Max 20x, Max, Pro, or Free tier instead of rate limit percentages
- **Fully offline**: Removed all network API calls — extension operates completely locally
- **Improved tooltips**: All status bar widgets now show "Click to open [Tab Name]" for clarity
- **Removed Limits section**: Dashboard no longer shows the obsolete rate limit progress bars
- **Fixed credentials reading**: Now correctly reads from `~/.claude/.credentials.json`

### v1.0.0 (2025-12-20)
- Initial release
- 7 status bar widgets with rich tooltips
- 4-tab interactive dashboard
- Cost analytics with model-specific pricing
- Personality insights and achievements
- Activity tracking and coding patterns

---

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2024-2025 Analytic Endeavors

---

## Acknowledgments

- Built with [Claude Code](https://claude.ai/claude-code)
- Inspired by the need to understand AI-assisted development patterns

---

<div align="center">

**Built by [Analytic Endeavors](https://analyticendeavors.com)**

</div>
