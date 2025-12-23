# Claude Data Export Backfill Guide

This guide explains how to import your historical Claude.ai usage data into the Claude Usage Analytics extension to get comprehensive lifetime statistics.

## What You'll Get

Backfilling from your Claude.ai data export provides:

| Metric | Description |
|--------|-------------|
| **Message Counts** | Total messages, human vs assistant breakdown per day |
| **Token Estimates** | Estimated input/output tokens based on character counts |
| **Cost Estimates** | Estimated API-equivalent costs using Sonnet pricing |
| **Personality Stats** | Politeness score, questions asked, exclamations, etc. |
| **Activity Patterns** | Peak hours, night owl vs early bird scores |
| **Claude Thinking Time** | Total time Claude spent in "thinking" mode |
| **User Active Time** | Estimated time you spent actively using Claude |
| **Session Counts** | Number of conversations per day |

## Step 1: Export Your Claude Data

1. Go to [claude.ai](https://claude.ai)
2. Click your profile icon (bottom left)
3. Go to **Settings**
4. Select **Account** tab
5. Click **Export Data**
6. Wait for the email with download link (usually within minutes)
7. Download and extract the ZIP file

The extracted folder will look like:
```
data-2025-12-23-06-52-43-batch-0000/
  conversations.json    (your chat history - the main file)
  memories.json         (Claude's memory about you)
  projects.json         (your projects/workspaces)
  users.json            (your account info)
```

## Step 2: Ensure Prerequisites

You need Python 3.8+ installed. Check with:
```bash
python --version
```

No additional packages are required - the script uses only Python standard library.

## Step 3: Run the Backfill Script

### Basic Usage (Updates Database)

```bash
python backfill_claude_export.py "path/to/your/data-export-folder"
```

Example:
```bash
python backfill_claude_export.py "C:/Users/YourName/Downloads/data-2025-12-23-batch-0000"
```

### Preview Only (JSON Export)

To see what would be imported without modifying the database:

```bash
python backfill_claude_export.py "path/to/data" --json-only
```

This creates a `backfill_summary.json` file with all extracted data.

### Custom Output Location

```bash
python backfill_claude_export.py "path/to/data" --output my_summary.json
```

### Custom Database Path

```bash
python backfill_claude_export.py "path/to/data" --db "C:/custom/path/analytics.db"
```

## Step 4: Refresh the Extension

After running the backfill:

1. Open VS Code
2. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run **Claude Usage: Refresh**
4. Check the dashboard - you should see updated lifetime stats!

## Sample Output

When you run the script, you'll see output like:

```
Claude Data Export Backfill Tool
========================================
Data directory: C:\Users\you\Downloads\data-2025-12-23-batch-0000
Loading conversations from conversations.json...
Processing 583 conversations...

JSON summary exported to: backfill_summary.json

============================================================
BACKFILL SUMMARY
============================================================

                      USAGE STATISTICS
------------------------------------------------------------
  Days with activity:      110
  Total conversations:     583
  Total messages:          10,445
    Human messages:        5,250
    Assistant messages:    5,195
  Estimated tokens:        33,605,301
  Estimated cost:          $193.34

                       TIME ANALYTICS
------------------------------------------------------------
  Claude thinking time:    2.4 hours
  User active time:        216.4 hours
  Peak activity hour:      22:00
  Night owl score:         53%
  Early bird score:        3%

                    PERSONALITY METRICS
------------------------------------------------------------
  Politeness score:        7%
  Questions asked:         2,231
  Exclamations:            563
  Please count:            363
  Thanks count:            23
  CAPS RAGE messages:      31
  LOL count:               32

============================================================
```

## How Estimates Work

### Token Estimation
- Tokens are estimated at ~4 characters per token
- This is a conservative estimate; actual tokens may vary by ~10-20%

### Cost Estimation
- Uses Claude Sonnet pricing as baseline
- Input: $3/MTok, Output: $15/MTok
- Includes estimated cache savings (60% cache read rate assumed)
- **Note:** This reflects API-equivalent costs, not actual Claude.ai subscription costs

### Time Tracking
- **Thinking Time:** Extracted from Claude's thinking blocks with timestamps
- **User Active Time:** Time between consecutive human messages (capped at 30 min per gap)

### Personality Analysis
Scans your messages for:
- Polite words: please, thank you, appreciate, etc.
- Questions: count of "?" characters
- Exclamations: count of "!" characters
- CAPS RAGE: messages where >50% of characters are uppercase
- Other patterns: LOL count, curse words, frustration words

## Troubleshooting

### "Database not found"

The extension creates its database on first run. Solutions:
1. Open VS Code with the extension installed
2. Wait a few seconds for initialization
3. Re-run the backfill script

Or use `--json-only` to just export data without database update.

### "conversations.json not found"

Make sure you're pointing to the extracted folder, not the ZIP file.

### Data looks wrong

The backfill creates a backup before modifying the database:
- Look for `analytics.db.backup` in `~/.claude/`
- To restore: delete `analytics.db` and rename `.backup` to `.db`

## Data Privacy

- This script runs entirely locally on your machine
- No data is sent to any external servers
- The conversations.json file contains your full chat history - keep it secure
- Consider deleting the export folder after backfilling

## Questions?

Open an issue at the [GitHub repository](https://github.com/yourusername/claude-usage-analytics) if you encounter any problems.
