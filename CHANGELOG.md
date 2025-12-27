# Changelog

All notable changes to the Claude Usage Analytics extension will be documented in this file.

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
