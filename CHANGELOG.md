# Changelog

All notable changes to the Claude Usage Analytics extension will be documented in this file.

## [1.1.6] - 2025-01-05

### Fixed
- **"Spawn node ENOENT" error on install** - Fixed error that occurred when users didn't have Node.js in their system PATH. Extension now uses VSCode's bundled Node.js runtime (`process.execPath`) instead of relying on a global `node` command.

## [1.1.5] - 2025-12-30

### Added
- **Context Overhead section** - Tokens tooltip now shows MCP servers, skills count, and tool calls under "Context Overhead" (below Cache Efficiency)
- **3 new visibility settings** - Toggle MCP status, tool calls, and skills count display independently

### Improved
- **Instant settings update** - Toggling any visibility setting now immediately refreshes the status bar (no reload required)
- **Top Language display** - Now shows comma-formatted count with label (e.g., "python - 42,600 blocks")

### Fixed
- **Realistic politeness thresholds** - Adjusted scoring for coding context (5%+ = Polite, 2%+ = Friendly, 1%+ = Neutral, <1% = All Business)
- **Clearer politeness display** - Tooltip now shows descriptive label with percentage (e.g., "Friendly (1.7%)")
- **Backfill script link** - Updated to new GitHub repository URL (analyticendeavors/claude-usage-analytics)

## [1.1.4] - 2025-12-29

### Improved
- **Enhanced Account Total tooltip** - Status bar tooltip now shows both API Total (from stats-cache.json) and Calculated Total (from SQLite + JSONL history), giving visibility into both data sources similar to the main dashboard view

## [1.1.3] - 2025-12-29

### Fixed
- **Yesterday cost showing N/A** - Fixed issue where "Yesterday" cost would incorrectly show N/A even when data existed. Added fallback logic to ensure yesterday's cost is calculated from SQLite or estimated from token data when the primary calculation returns zero.

## [1.1.2] - 2025-12-28

### Added
- **Open Settings command** - New "Claude Analytics: Open Settings" command for quick access to extension settings
- **Live config updates** - Changing refresh interval in settings now takes effect immediately without requiring a reload
- **Disable auto-refresh option** - Set refresh interval to 0 to disable auto-refresh entirely

### Fixed
- **Auto-refresh now scans live stats** - The auto-refresh interval now properly re-scans JSONL files for today's usage, fixing an issue where today's numbers stayed stale until manual refresh

### Changed
- **Refresh interval now in seconds** - Replaced `refreshIntervalMinutes` setting with `refreshIntervalSeconds` for finer control (0=disabled, 10-3600 seconds, default 900 = 15 minutes)

## [1.1.0] - 2025-12-27

### Added
- **SQLite persistence** - Usage history now preserved forever in a local SQLite database, surviving Claude Code's 30-day rolling window
- **Configurable refresh interval** - New `refreshIntervalMinutes` setting (1-60 min, default 15) to control auto-refresh frequency
- **Historical data import** - On first install, automatically imports existing data from stats-cache.json
- **Local history stats** - "Local History" totals now include full data from your local SQLite database, not just the last 30 days
- **7 new achievements** - Token Titan (1M+ tokens), $100 Club, $500 Spender, $1K Whale, Refactor Pro, Refactor King, Weekend Warrior
- **Export to CSV/JSON** - Export your usage data via dashboard button or view title menu
- **Budget tracking** - New `dailyBudget` and `weeklyBudget` settings with status bar color coding (green/yellow/red)
- **Cost alerts** - New `costAlertThreshold` setting triggers VS Code notifications when daily cost exceeds threshold
- **Date range filter** - Filter dashboard stats by Last 7 days, Last 30 days, This Month, or All Time
- **Session breakdown** - New section in Messages tab showing recent sessions with project, messages, tokens, and cost
- **Activity heatmap** - GitHub-style contribution calendar on Personality tab showing last 90 days of activity
- **Theme-aware colors** - All UI elements now adapt to light and dark VS Code themes
- **Backfill script** - Python script to import full Claude.ai conversation history from data export
- **Personality analytics** - Request types, sentiment tracking, and celebration moments
- **GitHub Gist sync** - Backup your analytics database to a private Gist for multi-machine sync
- **Status bar visibility settings** - 7 new settings to show/hide individual status bar items (lifetime cost, today cost, messages, tokens, personality, activity, rate limits)

### Changed
- Chart toggle buttons now use emojis (messages, cost, tokens)
- Footer includes Analytic Endeavors branding with logo and links

## [1.0.3] - 2025-12-21

### Added
- **Real-time today's cost** - Now reads directly from conversation JSONL files for accurate current-day statistics
- **Subscription tier display** - Shows Max 20x, Max, Pro, or Free tier instead of rate limit percentages
- **Improved tooltips** - All status bar widgets now show "Click to open [Tab Name]" for clarity

### Changed
- **Fully offline** - Removed all network API calls; extension operates completely locally
- **Fixed credentials reading** - Now correctly reads from `~/.claude/.credentials.json`

### Removed
- **Rate limit monitoring** - Removed Limits section and rate limit progress bars (obsolete after API changes)

## [1.0.0] - 2025-12-20

### Initial Release

First public release as a standalone VS Code extension.

### Features
- **4-Tab Dashboard** - Interactive sidebar with Overview, Cost, Messages, and Personality tabs
- **7 Status Bar Widgets** - Live statistics always visible:
  - Lifetime Cost with trend analysis
  - Today's Cost with comparisons
  - Total Messages with activity patterns
  - Token Count with cache efficiency
  - Personality Score with trait breakdown
  - Activity Stats with coding metrics
  - Subscription Tier display

- **Cost Analytics**
  - Accurate pricing using model-specific rates (Opus vs Sonnet)
  - Daily, weekly, and monthly trends
  - Cost projections and comparisons
  - Cache savings tracking

- **Personality Insights**
  - Politeness, frustration, and curiosity scores
  - Achievement badges for milestones
  - Expression style analysis
  - Mood and sentiment tracking

- **Activity Tracking**
  - Code block and line counts
  - Top languages used
  - Request type distribution (debug, feature, explain, etc.)
  - Peak hours and activity patterns

### Keyboard Shortcuts
- `Ctrl+Alt+C` (`Cmd+Alt+C` on Mac) - Show Analytics Panel
- `Ctrl+Alt+R` (`Cmd+Alt+R` on Mac) - Refresh Data

---

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
