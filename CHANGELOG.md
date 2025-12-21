# Changelog

All notable changes to the Claude Usage Analytics extension will be documented in this file.

## [1.0.0] - 2025-12-21

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
  - Rate Limits with 5h/7d monitoring

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

- **Rate Limit Monitoring**
  - Real-time 5-hour and 7-day limit percentages
  - Color-coded warnings (green/yellow/red)
  - Opus-specific limits when applicable
  - OAuth token integration

### Keyboard Shortcuts

- `Ctrl+Alt+C` (`Cmd+Alt+C` on Mac) - Show Analytics Panel
- `Ctrl+Alt+R` (`Cmd+Alt+R` on Mac) - Refresh Data

---

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
