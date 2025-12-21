# Claude Usage Analytics

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.95%2B-007ACC)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

---

## What is Claude Usage Analytics?

**Claude Usage Analytics** is a VS Code extension that provides real-time insights into your Claude Code usage. Built by [Reid Havens](https://github.com/analyticendeavors) of **Analytic Endeavors**, this tool transforms raw usage data into actionable intelligence—helping you understand costs, monitor rate limits, and discover patterns in your AI-assisted development workflow.

> *Track your Claude Code usage with real-time analytics in VS Code. Monitor costs, tokens, and rate limits. Explore personality insights, achievement badges, and coding patterns. Features a 4-tab dashboard and 7 status bar widgets showing lifetime costs, daily spending, cache efficiency, and usage trends.*

---

## Key Features

### Status Bar Widgets
Seven live statistics widgets always visible at a glance:

| Widget | Icon | Displays | Click Action |
|--------|------|----------|--------------|
| **Lifetime Cost** | `$(graph)` | Total all-time spending | Opens Overview tab |
| **Today's Cost** | `$(calendar)` | Current day usage | Opens Cost tab |
| **Messages** | `$(comment-discussion)` | Total message count | Opens Messages tab |
| **Tokens** | `$(symbol-number)` | Token consumption | Opens Messages tab |
| **Personality** | Emoji | Politeness score % | Opens Personality tab |
| **Activity** | Chart | Code blocks generated | Opens Personality tab |
| **Rate Limits** | `$(pulse)` | 5h/7d limit status | Opens Overview tab |

### Interactive Dashboard
A comprehensive 4-tab analytics panel with deep insights:

| Tab | Content |
|-----|---------|
| **Overview** | Hero stats, quick metrics, rate limit progress bars, daily activity visualization, model distribution breakdown |
| **Cost** | Detailed cost analysis, 7-day trends, monthly projections, highest spending days, cache savings calculations |
| **Messages** | Token breakdown (input/output/cache), peak usage hours, activity patterns, session statistics |
| **Personality** | Achievement badges, personality trait scores, expression analysis, mood & sentiment tracking |

---

## Feature Details

### Cost Analytics
*Understand exactly where your tokens go*

- **Real-time cost tracking** with model-specific pricing (Opus vs Sonnet rates)
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

### Rate Limit Monitoring
*Never get throttled unexpectedly*

- **5-hour rolling window** percentage with reset countdown
- **7-day rolling window** percentage tracking
- **Opus-specific limits** when applicable
- **Color-coded warnings**:
  - Green: < 70% usage
  - Yellow: 70-90% usage
  - Red: > 90% usage

### Activity Tracking
*Analyze your coding patterns*

- **Code blocks generated** with line counts
- **Top programming languages** used
- **Request type distribution** (debugging, features, explanations, refactoring)
- **Peak hours analysis** — when you're most active
- **Night owl vs early bird** scoring
- **Session statistics** and longest session tracking

---

## Privacy & Security

This extension prioritizes your privacy:

| Aspect | Implementation |
|--------|----------------|
| **Data Location** | All data stays on your machine |
| **Network Calls** | Only Anthropic's official API (for rate limits) |
| **Telemetry** | None — zero tracking or analytics |
| **Token Storage** | Uses OS keychain via `keytar` |
| **Open Source** | Full source code available for audit |

**Data Sources:**
- `~/.claude/stats-cache.json` — Token usage and model statistics
- `~/.claude/projects/*/` — Conversation history for personality analysis

---

## Installation

### Option 1: From VSIX Package (Recommended)

Download the latest `.vsix` from [Releases](https://github.com/analyticendeavors/claude-usage-analytics/releases), then:

```bash
code --install-extension claude-usage-analytics-1.0.0.vsix
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
code --install-extension claude-usage-analytics-1.0.0.vsix
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
- **Right side**: Rate limit indicators

**Click any widget** to open the dashboard focused on the relevant tab.

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
│   ├── dataProvider.ts     # Stats parsing & cost calculations
│   └── limitsProvider.ts   # OAuth rate limit API integration
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
| **getUsageLimits()** | Fetches rate limits from Anthropic API using OAuth token |

---

## Frequently Asked Questions

### Why don't I see any data?
Ensure Claude Code CLI is installed and you've used it at least once. The extension reads from `~/.claude/stats-cache.json` which is created after your first Claude Code session.

### How accurate are the cost calculations?
Costs use model-specific pricing:
- **Claude Opus**: $15/1M input, $75/1M output
- **Claude Sonnet**: $3/1M input, $15/1M output
- **Cache tokens**: Discounted rates applied

The extension calculates a blended rate based on your actual model usage mix.

### Why do rate limits show "--"?
The OAuth token may have expired. Re-authenticate with `claude auth login` and restart VS Code.

### How often does data refresh?
- **Automatic**: Every 2 minutes
- **Manual**: Click refresh button or press `Ctrl+Alt+R`

### Is my data sent anywhere?
No. All analysis happens locally. The only network call is to Anthropic's API to fetch your rate limit status (using your existing OAuth token).

### Can I use this without Claude Code CLI?
No. This extension specifically reads Claude Code's local statistics files. It's designed as a companion tool for Claude Code users.

---

## Troubleshooting

### Status bar shows "Claude" but no statistics

1. Verify Claude Code is installed: `claude --version`
2. Check authentication: `claude auth status`
3. Confirm stats file exists: `ls ~/.claude/stats-cache.json`
4. Try using Claude Code once to generate initial data

### Rate limits display errors

1. Re-authenticate: `claude auth login`
2. Restart VS Code
3. Check Output panel: **View > Output > Claude Usage Analytics**

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

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2024-2025 Analytic Endeavors

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

---

## Acknowledgments

- Built with [Claude Code](https://claude.ai/claude-code)
- Uses [keytar](https://github.com/atom/node-keytar) for secure credential storage
- Inspired by the need to understand AI-assisted development patterns

---

<div align="center">

**Built by [Analytic Endeavors](https://github.com/analyticendeavors)**

</div>
