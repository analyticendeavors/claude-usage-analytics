# Claude Data Export Backfill Guide

Import your complete Claude.ai conversation history into the Claude Usage Analytics extension to get comprehensive lifetime statistics - including data from before you installed the extension.

---

## Table of Contents

1. [What You'll Get](#what-youll-get)
2. [Prerequisites](#prerequisites)
3. [Step 1: Export Your Data from Claude.ai](#step-1-export-your-data-from-claudeai)
4. [Step 2: Download and Extract](#step-2-download-and-extract)
5. [Step 3: Run the Backfill Script](#step-3-run-the-backfill-script)
6. [Step 4: Verify in VS Code](#step-4-verify-in-vs-code)
7. [Understanding Your Data](#understanding-your-data)
8. [Command Reference](#command-reference)
9. [Troubleshooting](#troubleshooting)
10. [FAQ](#faq)
11. [Privacy & Security](#privacy--security)

---

## What You'll Get

After backfilling, your Claude Usage Analytics dashboard will include historical data for:

| Category | Metrics |
|----------|---------|
| **Usage Stats** | Daily message counts, estimated tokens, session counts |
| **Cost Estimates** | API-equivalent costs based on Sonnet pricing |
| **Code Statistics** | Code blocks generated, lines of code, top languages |
| **Personality** | Politeness score, questions asked, exclamations, please/thanks counts |
| **Activity** | Peak hours, night owl vs early bird scores, daily patterns |
| **Time Analytics** | Claude thinking time, estimated user active time |

### Example Output

```
USAGE STATISTICS
  Days with activity:      110
  Total conversations:     583
  Total messages:          10,445
  Estimated tokens:        33,605,301
  Estimated cost:          $193.34

TIME ANALYTICS
  Claude thinking time:    2.4 hours
  User active time:        216.4 hours
  Peak activity hour:      22:00
  Night owl score:         53%

CODE STATISTICS
  Code blocks:             4,292
  Lines of code:           35,715
  Top languages:
    python               10,393 lines
    typescript            2,156 lines
    javascript            1,823 lines

PERSONALITY METRICS
  Politeness score:        7%
  Questions asked:         2,231
  Please count:            363
  Thanks count:            23
```

---

## Prerequisites

### 1. Python 3.8 or higher

Check if Python is installed:

**Windows:**
```cmd
python --version
```

**macOS/Linux:**
```bash
python3 --version
```

If not installed:
- **Windows**: Download from [python.org](https://www.python.org/downloads/) or install via Microsoft Store
- **macOS**: `brew install python3` or download from python.org
- **Linux**: `sudo apt install python3` (Ubuntu/Debian) or `sudo dnf install python3` (Fedora)

### 2. Claude Usage Analytics Extension

The extension must be installed and run at least once to create the database:

1. Install the extension in VS Code
2. Open any project with Claude Code
3. Wait a few seconds for the extension to initialize
4. You should see the status bar widgets appear

This creates the database at `~/.claude/analytics.db`.

---

## Step 1: Export Your Data from Claude.ai

1. **Go to Claude.ai**
   - Open your browser and navigate to [claude.ai](https://claude.ai)
   - Log in to your account

2. **Open Settings**
   - Click your profile icon in the bottom-left corner
   - Select **Settings** from the menu

3. **Navigate to Account**
   - Click the **Account** tab in the settings panel

4. **Request Data Export**
   - Scroll down to find **Export Data**
   - Click the **Export Data** button
   - You'll see a confirmation message

5. **Wait for Email**
   - Anthropic will send you an email with a download link
   - This usually arrives within 5-15 minutes
   - Check your spam folder if you don't see it

6. **Download the Export**
   - Click the download link in the email
   - Save the ZIP file to a known location (e.g., Downloads folder)

---

## Step 2: Download and Extract

### Extract the ZIP File

**Windows:**
1. Right-click the downloaded ZIP file
2. Select **Extract All...**
3. Choose a destination folder
4. Click **Extract**

**macOS:**
- Double-click the ZIP file to extract automatically

**Linux:**
```bash
unzip data-2025-12-23-06-52-43-batch-0000.zip -d ~/Downloads/claude-export
```

### Verify the Contents

After extraction, you should see a folder containing:

```
data-2025-12-23-06-52-43-batch-0000/
    conversations.json    # Your chat history (this is the important file)
    memories.json         # Claude's memory about you
    projects.json         # Your projects/workspaces
    users.json            # Your account info
```

The `conversations.json` file is the main data source - it contains all your chat history with Claude.

---

## Step 3: Run the Backfill Script

### Download the Script

The script is included in the extension repository. You can:

**Option A: Clone the repository**
```bash
git clone https://github.com/analyticendeavors/claude-usage-analytics.git
cd claude-usage-analytics
```

**Option B: Download just the script**
- Go to the [repository](https://github.com/analyticendeavors/claude-usage-analytics)
- Download `backfill_claude_export.py`
- Save it somewhere accessible

### Run the Script

Open a terminal/command prompt and run:

**Windows (Command Prompt or PowerShell):**
```cmd
python backfill_claude_export.py "C:\Users\YourName\Downloads\data-2025-12-23-batch-0000"
```

**macOS/Linux:**
```bash
python3 backfill_claude_export.py ~/Downloads/data-2025-12-23-batch-0000
```

### What Happens

1. **Loading**: The script reads your `conversations.json` file
2. **Processing**: It analyzes each conversation and message
3. **Backup**: Creates a backup of your existing database (`.db.backup`)
4. **Import**: Writes new daily records to the database
5. **Summary**: Displays statistics about your data

### Expected Output

```
Claude Data Export Backfill Tool
========================================
Data directory: C:\Users\you\Downloads\data-2025-12-23-batch-0000
Loading conversations from conversations.json...
Processing 583 conversations...

JSON summary exported to: backfill_summary.json

Database path: C:\Users\you\.claude\analytics.db
Created backup at C:\Users\you\.claude\analytics.db.backup

Database updated:
  Imported: 96 days
  Skipped (already exist): 14 days

============================================================
BACKFILL SUMMARY
============================================================
[... detailed statistics ...]

Done! Restart VSCode or refresh the Claude Usage extension to see updated stats.
```

---

## Step 4: Verify in VS Code

1. **Refresh the Extension**
   - Open VS Code
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
   - Type "Claude Usage: Refresh" and press Enter
   - Or press `Ctrl+Alt+R` / `Cmd+Alt+R`

2. **Check the Dashboard**
   - Click any status bar widget to open the dashboard
   - Your "Account Total" section should now show historical data
   - The daily chart should include past days

3. **Verify the Numbers**
   - Compare the dashboard totals with the script output
   - The numbers should match closely

---

## Understanding Your Data

### How Token Estimation Works

Since Claude.ai doesn't expose actual token counts, the script estimates tokens based on text length:

```
Estimated Tokens = Character Count / 4
```

This is a conservative estimate. Actual tokens may vary by 10-20% depending on content.

### How Cost Estimation Works

Costs are calculated using Claude Sonnet pricing (the most common model):

| Token Type | Rate per 1M Tokens |
|------------|-------------------|
| Input | $3.00 |
| Output | $15.00 |
| Cache Read | $0.30 |
| Cache Write | $3.75 |

**Important:** These are API-equivalent costs, not what you pay for a Claude.ai subscription. They represent what it would cost to make the same requests via the API.

The script assumes:
- 30% of input tokens are regular input
- 60% of input tokens are cache reads
- 10% of input tokens are cache writes

### How Time Tracking Works

**Claude Thinking Time:**
- Extracted from thinking blocks in assistant messages
- Uses `start_timestamp` and `stop_timestamp` fields
- Only available for conversations with extended thinking enabled

**User Active Time:**
- Estimated from gaps between consecutive human messages
- Only counts gaps under 30 minutes (assumes longer gaps = breaks)
- Represents approximate time spent actively using Claude

### Personality Metrics

The script analyzes your (human) messages for:

| Metric | How It's Measured |
|--------|-------------------|
| Politeness Score | Frequency of "please" and "thanks" per message |
| Questions | Count of "?" characters |
| Exclamations | Count of "!" characters |
| CAPS RAGE | Messages where >50% of characters are uppercase |
| LOL Count | Occurrences of "lol" |
| Curse Words | Common expletives detected |

---

## Command Reference

### Basic Usage

```bash
python backfill_claude_export.py "path/to/data-export-folder"
```

### Options

| Option | Description |
|--------|-------------|
| `--json-only` | Export JSON summary without modifying database |
| `--output FILE` | Specify output JSON file path |
| `--db PATH` | Use a custom database path |

### Examples

**Preview without modifying database:**
```bash
python backfill_claude_export.py "~/Downloads/data-export" --json-only
```

**Custom output file:**
```bash
python backfill_claude_export.py "~/Downloads/data-export" --output my_stats.json
```

**Use a different database:**
```bash
python backfill_claude_export.py "~/Downloads/data-export" --db "/path/to/my/analytics.db"
```

---

## Troubleshooting

### "Database not found"

**Symptom:** Script says database not found at `~/.claude/analytics.db`

**Solutions:**
1. Open VS Code with the Claude Usage Analytics extension installed
2. Wait 5-10 seconds for the extension to initialize
3. Re-run the backfill script

Or use `--json-only` to just export the summary:
```bash
python backfill_claude_export.py "path/to/data" --json-only
```

### "conversations.json not found"

**Symptom:** Script can't find the conversations file

**Solutions:**
1. Make sure you're pointing to the extracted folder, not the ZIP file
2. Check that the path doesn't have trailing slashes
3. Verify the folder contains `conversations.json`

**Correct:**
```bash
python backfill_claude_export.py "C:\Users\you\Downloads\data-2025-12-23-batch-0000"
```

**Wrong:**
```bash
python backfill_claude_export.py "C:\Users\you\Downloads\data-2025-12-23-batch-0000.zip"
```

### "Python not found"

**Windows:** Try `python3` instead of `python`, or:
1. Open Microsoft Store
2. Search for "Python"
3. Install Python 3.11 or later

**macOS/Linux:** Use `python3` explicitly:
```bash
python3 backfill_claude_export.py "path/to/data"
```

### Data Looks Wrong After Import

The script creates a backup before modifying the database.

**To restore:**
1. Close VS Code
2. Navigate to `~/.claude/` (your home directory)
3. Delete `analytics.db`
4. Rename `analytics.db.backup` to `analytics.db`
5. Restart VS Code

**Windows path:** `C:\Users\YourName\.claude\`
**macOS/Linux path:** `~/.claude/`

### Script Runs But Shows 0 Imported

**Possible causes:**
1. All dates already exist in the database (this is normal on re-runs)
2. The conversations.json file is empty or corrupted

**Check the output:**
- "Skipped: X days" means those dates already exist
- "Imported: 0" with no skipped days means no valid data was found

---

## FAQ

### Can I run this multiple times?

Yes! The script:
- Creates a backup before each run
- Skips dates that already exist in the database
- Only imports new data

### Will this overwrite my existing data?

No. The script uses "INSERT OR REPLACE" which:
- Preserves existing records for dates already in the database
- Only adds new records for dates that don't exist

### What if I export my data again later?

Run the script again with the new export. It will:
- Skip dates already imported
- Add any new dates from the fresh export

### Does this work with Claude Pro/Free/Max subscriptions?

Yes! The data export is available for all Claude.ai subscription tiers.

### Can I import data from multiple accounts?

Yes, but be aware:
- All data goes into the same database
- Statistics will be combined
- There's no per-account separation

### How long does it take?

Depends on your conversation history:
- 100 conversations: ~5 seconds
- 500 conversations: ~15-30 seconds
- 1000+ conversations: ~1-2 minutes

### Why is my cost estimate so high/low?

The cost is an **API-equivalent estimate**, not your subscription cost:
- Uses Claude Sonnet pricing as baseline
- Assumes certain cache hit ratios
- Your actual subscription cost is different

---

## Privacy & Security

### All Processing is Local

- The script runs entirely on your machine
- No data is sent to external servers
- No network connections are made

### Secure Your Export

The `conversations.json` file contains your complete chat history. Treat it as sensitive data:

- Don't share the export folder publicly
- Don't upload it to cloud storage without encryption
- Delete the export folder after backfilling if you don't need it

### What the Script Accesses

| File | Access Type | Purpose |
|------|-------------|---------|
| `conversations.json` | Read | Extract messages and timestamps |
| `~/.claude/analytics.db` | Read/Write | Store processed statistics |
| `backfill_summary.json` | Write | Export summary (optional) |

The script does **not** access:
- Your Claude.ai credentials
- Your Claude Code authentication
- Any network resources
- Any files outside the specified paths

---

## Need Help?

- **GitHub Issues**: [Open an issue](https://github.com/analyticendeavors/claude-usage-analytics/issues)
- **Extension Homepage**: [Claude Usage Analytics](https://marketplace.visualstudio.com/items?itemName=analyticendeavors.claude-usage-analytics)

---

*This guide is part of the Claude Usage Analytics VS Code extension.*
