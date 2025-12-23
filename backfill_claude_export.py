#!/usr/bin/env python3
"""
Claude Data Export Backfill Script for claude-usage-analytics VSCode Extension

This script imports historical data from a Claude.ai data export into the
extension's SQLite database to provide comprehensive lifetime analytics.

WHAT THIS EXTRACTS:
  - Daily message counts and estimated token usage
  - Estimated API costs based on model pricing
  - Personality analysis (politeness, questions, exclamations)
  - Activity patterns (peak hours, sessions per day)
  - Claude thinking time analytics
  - Session duration estimates

HOW TO USE:
  1. Export your data from claude.ai (Settings > Account > Export Data)
  2. Extract the downloaded ZIP file
  3. Run: python backfill_claude_export.py "path/to/data-export-folder"

  Example: python backfill_claude_export.py "C:/Users/you/Downloads/data-2025-12-23-batch-0000"

Author: Claude Usage Analytics Extension
License: MIT
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

# Try to import sql.js compatible library for direct DB access
# If not available, we'll output JSON for manual import
try:
    import sqlite3
    HAS_SQLITE = True
except ImportError:
    HAS_SQLITE = False


# ============================================================================
# MODEL PRICING (per 1M tokens) - Same as extension
# ============================================================================
MODEL_PRICING = {
    'opus': {'input': 15, 'output': 75, 'cache_read': 1.875, 'cache_write': 18.75},
    'sonnet': {'input': 3, 'output': 15, 'cache_read': 0.30, 'cache_write': 3.75},
    'haiku': {'input': 0.25, 'output': 1.25, 'cache_read': 0.03, 'cache_write': 0.30},
    'default': {'input': 3, 'output': 15, 'cache_read': 0.30, 'cache_write': 3.75}
}

# Token estimation: ~4 characters per token (conservative)
CHARS_PER_TOKEN = 4


# ============================================================================
# PERSONALITY ANALYSIS PATTERNS
# ============================================================================
CURSE_WORDS = {'damn', 'hell', 'crap', 'shit', 'fuck', 'ass', 'bastard', 'bitch'}
POLITE_WORDS = {'please', 'thank', 'thanks', 'appreciate', 'grateful', 'kindly'}
FRUSTRATION_WORDS = {'frustrated', 'annoying', 'broken', 'stupid', 'hate', 'ugh', 'argh', 'wtf'}


def get_model_pricing(model_name: str) -> dict:
    """Get pricing for a model based on its name."""
    lower = model_name.lower()
    if 'opus' in lower:
        return MODEL_PRICING['opus']
    if 'haiku' in lower:
        return MODEL_PRICING['haiku']
    if 'sonnet' in lower:
        return MODEL_PRICING['sonnet']
    return MODEL_PRICING['default']


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length."""
    return len(text) // CHARS_PER_TOKEN


def parse_timestamp(ts: str) -> datetime:
    """Parse ISO timestamp to datetime."""
    if not ts:
        return None
    try:
        # Handle various timestamp formats
        ts = ts.replace('Z', '+00:00')
        return datetime.fromisoformat(ts)
    except:
        return None


def analyze_text_personality(text: str) -> dict:
    """Analyze text for personality metrics."""
    text_lower = text.lower()
    words = re.findall(r'\b\w+\b', text_lower)

    return {
        'curse_words': sum(1 for w in words if w in CURSE_WORDS),
        'polite_words': sum(1 for w in words if w in POLITE_WORDS),
        'frustration_words': sum(1 for w in words if w in FRUSTRATION_WORDS),
        'questions': text.count('?'),
        'exclamations': text.count('!'),
        'please_count': text_lower.count('please'),
        'thanks_count': text_lower.count('thank'),
        'caps_rage': 1 if sum(1 for c in text if c.isupper()) / max(len(text), 1) > 0.5 else 0,
        'lol_count': len(re.findall(r'\blol\b', text_lower)),
        'word_count': len(words)
    }


def process_conversations(data_dir: Path) -> dict:
    """Process conversations.json and extract all metrics."""

    conversations_file = data_dir / 'conversations.json'
    if not conversations_file.exists():
        print(f"ERROR: conversations.json not found in {data_dir}")
        sys.exit(1)

    print(f"Loading conversations from {conversations_file}...")
    with open(conversations_file, 'r', encoding='utf-8') as f:
        conversations = json.load(f)

    print(f"Processing {len(conversations):,} conversations...")

    # Daily aggregates
    daily_stats = defaultdict(lambda: {
        'messages': 0,
        'human_messages': 0,
        'assistant_messages': 0,
        'input_tokens': 0,
        'output_tokens': 0,
        'sessions': 0,
        'thinking_time_ms': 0,
        'user_active_time_ms': 0,
        # Personality
        'curse_words': 0,
        'polite_words': 0,
        'frustration_words': 0,
        'questions': 0,
        'exclamations': 0,
        'please_count': 0,
        'thanks_count': 0,
        'caps_rage': 0,
        'lol_count': 0,
        'word_count': 0,
        # Activity by hour (0-23)
        'hours': defaultdict(int)
    })

    # Track session times for duration estimation
    session_times = defaultdict(list)

    for conv in conversations:
        created = conv.get('created_at', '')
        if not created:
            continue

        date = created[:10]  # YYYY-MM-DD
        daily_stats[date]['sessions'] += 1

        messages = conv.get('chat_messages', [])
        prev_timestamp = None

        for msg in messages:
            sender = msg.get('sender', '')
            msg_created = msg.get('created_at', '')

            if msg_created:
                try:
                    dt = parse_timestamp(msg_created)
                    if dt:
                        hour = dt.hour
                        daily_stats[date]['hours'][hour] += 1

                        # Track user active time (time between human messages)
                        if sender == 'human' and prev_timestamp:
                            delta = (dt - prev_timestamp).total_seconds() * 1000
                            # Only count if within reasonable session time (< 30 min)
                            if 0 < delta < 30 * 60 * 1000:
                                daily_stats[date]['user_active_time_ms'] += delta

                        if sender == 'human':
                            prev_timestamp = dt
                except:
                    pass

            daily_stats[date]['messages'] += 1

            if sender == 'human':
                daily_stats[date]['human_messages'] += 1
            elif sender == 'assistant':
                daily_stats[date]['assistant_messages'] += 1

            # Process content
            for content in msg.get('content', []):
                content_type = content.get('type', '')

                # Text content
                if content_type == 'text':
                    text = content.get('text', '')
                    tokens = estimate_tokens(text)

                    if sender == 'human':
                        daily_stats[date]['input_tokens'] += tokens
                        # Analyze personality for human messages
                        personality = analyze_text_personality(text)
                        for key, value in personality.items():
                            if key != 'word_count':
                                daily_stats[date][key] += value
                            else:
                                daily_stats[date]['word_count'] += value
                    else:
                        daily_stats[date]['output_tokens'] += tokens

                # Thinking content (Claude's reasoning)
                elif content_type == 'thinking':
                    thinking_text = content.get('thinking', '')
                    daily_stats[date]['output_tokens'] += estimate_tokens(thinking_text)

                    # Calculate thinking duration
                    start = content.get('start_timestamp')
                    stop = content.get('stop_timestamp')
                    if start and stop:
                        t1 = parse_timestamp(start)
                        t2 = parse_timestamp(stop)
                        if t1 and t2:
                            thinking_ms = (t2 - t1).total_seconds() * 1000
                            daily_stats[date]['thinking_time_ms'] += thinking_ms

                # Tool use
                elif content_type == 'tool_use':
                    tool_input = content.get('input', {})
                    if isinstance(tool_input, dict):
                        tool_text = json.dumps(tool_input)
                    else:
                        tool_text = str(tool_input)
                    daily_stats[date]['output_tokens'] += estimate_tokens(tool_text)

                # Tool results
                elif content_type == 'tool_result':
                    result_content = content.get('content', [])
                    for rc in result_content if isinstance(result_content, list) else []:
                        if isinstance(rc, dict) and rc.get('text'):
                            daily_stats[date]['input_tokens'] += estimate_tokens(rc['text'])

    return dict(daily_stats)


def calculate_costs(daily_stats: dict) -> dict:
    """Calculate estimated costs based on token usage."""
    # Use Sonnet pricing as default (most common model)
    pricing = MODEL_PRICING['sonnet']

    for date, stats in daily_stats.items():
        input_tokens = stats['input_tokens']
        output_tokens = stats['output_tokens']

        # Estimate cache distribution: 60% cache read, 10% cache write
        cache_read_tokens = int(input_tokens * 0.6)
        cache_write_tokens = int(input_tokens * 0.1)
        regular_input_tokens = input_tokens - cache_read_tokens - cache_write_tokens

        cost = (
            (regular_input_tokens / 1_000_000) * pricing['input'] +
            (output_tokens / 1_000_000) * pricing['output'] +
            (cache_read_tokens / 1_000_000) * pricing['cache_read'] +
            (cache_write_tokens / 1_000_000) * pricing['cache_write']
        )

        stats['cost'] = round(cost, 4)
        stats['cache_read_tokens'] = cache_read_tokens
        stats['cache_write_tokens'] = cache_write_tokens

    return daily_stats


def get_db_path() -> Path:
    """Get the extension's database path."""
    return Path.home() / '.claude' / 'analytics.db'


def write_to_sqlite(daily_stats: dict, db_path: Path) -> int:
    """Write daily stats to the SQLite database."""
    if not HAS_SQLITE:
        print("ERROR: sqlite3 module not available")
        return 0

    # Create backup
    if db_path.exists():
        backup_path = db_path.with_suffix('.db.backup')
        import shutil
        shutil.copy(db_path, backup_path)
        print(f"Created backup at {backup_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create tables if they don't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_snapshots (
            date TEXT PRIMARY KEY,
            cost REAL DEFAULT 0,
            messages INTEGER DEFAULT 0,
            tokens INTEGER DEFAULT 0,
            sessions INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS model_usage (
            date TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            cache_read_tokens INTEGER DEFAULT 0,
            cache_write_tokens INTEGER DEFAULT 0,
            PRIMARY KEY (date, model)
        )
    ''')

    # Check existing dates
    cursor.execute('SELECT date FROM daily_snapshots')
    existing_dates = {row[0] for row in cursor.fetchall()}

    imported = 0
    skipped = 0

    for date, stats in sorted(daily_stats.items()):
        if date in existing_dates:
            skipped += 1
            continue

        total_tokens = stats['input_tokens'] + stats['output_tokens']

        cursor.execute('''
            INSERT OR REPLACE INTO daily_snapshots (date, cost, messages, tokens, sessions)
            VALUES (?, ?, ?, ?, ?)
        ''', (date, stats['cost'], stats['messages'], total_tokens, stats['sessions']))

        # Also save model usage (as "claude-web" to distinguish from API)
        cursor.execute('''
            INSERT OR REPLACE INTO model_usage
            (date, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (date, 'claude-web', stats['input_tokens'], stats['output_tokens'],
              stats.get('cache_read_tokens', 0), stats.get('cache_write_tokens', 0)))

        imported += 1

    conn.commit()
    conn.close()

    return imported, skipped


def export_json_summary(daily_stats: dict, output_path: Path):
    """Export a JSON summary for manual review or import."""

    # Calculate totals
    totals = {
        'total_messages': 0,
        'total_human_messages': 0,
        'total_assistant_messages': 0,
        'total_input_tokens': 0,
        'total_output_tokens': 0,
        'total_cost': 0,
        'total_sessions': 0,
        'total_thinking_time_hours': 0,
        'total_user_active_hours': 0,
        'days_active': len(daily_stats),
        # Personality totals
        'total_curse_words': 0,
        'total_questions': 0,
        'total_exclamations': 0,
        'total_please_count': 0,
        'total_thanks_count': 0,
        'total_caps_rage': 0,
        'total_lol_count': 0,
        'total_word_count': 0,
        # Activity by hour
        'hourly_activity': defaultdict(int)
    }

    for date, stats in daily_stats.items():
        totals['total_messages'] += stats['messages']
        totals['total_human_messages'] += stats['human_messages']
        totals['total_assistant_messages'] += stats['assistant_messages']
        totals['total_input_tokens'] += stats['input_tokens']
        totals['total_output_tokens'] += stats['output_tokens']
        totals['total_cost'] += stats['cost']
        totals['total_sessions'] += stats['sessions']
        totals['total_thinking_time_hours'] += stats['thinking_time_ms'] / 1000 / 60 / 60
        totals['total_user_active_hours'] += stats['user_active_time_ms'] / 1000 / 60 / 60

        # Personality
        totals['total_curse_words'] += stats['curse_words']
        totals['total_questions'] += stats['questions']
        totals['total_exclamations'] += stats['exclamations']
        totals['total_please_count'] += stats['please_count']
        totals['total_thanks_count'] += stats['thanks_count']
        totals['total_caps_rage'] += stats['caps_rage']
        totals['total_lol_count'] += stats['lol_count']
        totals['total_word_count'] += stats['word_count']

        # Hourly activity
        for hour, count in stats['hours'].items():
            totals['hourly_activity'][hour] += count

    # Calculate derived metrics
    totals['politeness_score'] = min(100, int(
        (totals['total_please_count'] + totals['total_thanks_count']) /
        max(totals['total_human_messages'], 1) * 100
    ))

    totals['hourly_activity'] = dict(totals['hourly_activity'])

    # Peak hour
    if totals['hourly_activity']:
        peak_hour = max(totals['hourly_activity'].items(), key=lambda x: x[1])
        totals['peak_hour'] = f"{int(peak_hour[0]):02d}:00"

    # Night owl / early bird scores
    night_hours = sum(totals['hourly_activity'].get(h, 0) for h in range(22, 24)) + \
                  sum(totals['hourly_activity'].get(h, 0) for h in range(0, 6))
    early_hours = sum(totals['hourly_activity'].get(h, 0) for h in range(5, 9))
    total_activity = sum(totals['hourly_activity'].values()) or 1

    totals['night_owl_score'] = round(night_hours / total_activity * 100)
    totals['early_bird_score'] = round(early_hours / total_activity * 100)

    # Prepare output
    output = {
        'export_date': datetime.now().isoformat(),
        'source': 'claude.ai data export',
        'totals': totals,
        'daily_breakdown': {
            date: {
                'date': date,
                'messages': stats['messages'],
                'human_messages': stats['human_messages'],
                'assistant_messages': stats['assistant_messages'],
                'tokens': stats['input_tokens'] + stats['output_tokens'],
                'input_tokens': stats['input_tokens'],
                'output_tokens': stats['output_tokens'],
                'cost': stats['cost'],
                'sessions': stats['sessions'],
                'thinking_time_minutes': round(stats['thinking_time_ms'] / 1000 / 60, 2),
                'user_active_minutes': round(stats['user_active_time_ms'] / 1000 / 60, 2)
            }
            for date, stats in sorted(daily_stats.items())
        }
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    return totals


def print_summary(totals: dict):
    """Print a summary of the processed data."""
    print("\n" + "=" * 60)
    print("BACKFILL SUMMARY")
    print("=" * 60)

    print(f"\n{'USAGE STATISTICS':^60}")
    print("-" * 60)
    print(f"  Days with activity:      {totals['days_active']:,}")
    print(f"  Total conversations:     {totals['total_sessions']:,}")
    print(f"  Total messages:          {totals['total_messages']:,}")
    print(f"    Human messages:        {totals['total_human_messages']:,}")
    print(f"    Assistant messages:    {totals['total_assistant_messages']:,}")
    print(f"  Estimated tokens:        {totals['total_input_tokens'] + totals['total_output_tokens']:,}")
    print(f"    Input tokens:          {totals['total_input_tokens']:,}")
    print(f"    Output tokens:         {totals['total_output_tokens']:,}")
    print(f"  Estimated cost:          ${totals['total_cost']:,.2f}")

    print(f"\n{'TIME ANALYTICS':^60}")
    print("-" * 60)
    print(f"  Claude thinking time:    {totals['total_thinking_time_hours']:.1f} hours")
    print(f"  User active time:        {totals['total_user_active_hours']:.1f} hours")
    print(f"  Peak activity hour:      {totals.get('peak_hour', 'N/A')}")
    print(f"  Night owl score:         {totals.get('night_owl_score', 0)}%")
    print(f"  Early bird score:        {totals.get('early_bird_score', 0)}%")

    print(f"\n{'PERSONALITY METRICS':^60}")
    print("-" * 60)
    print(f"  Politeness score:        {totals.get('politeness_score', 0)}%")
    print(f"  Questions asked:         {totals['total_questions']:,}")
    print(f"  Exclamations:            {totals['total_exclamations']:,}")
    print(f"  Please count:            {totals['total_please_count']:,}")
    print(f"  Thanks count:            {totals['total_thanks_count']:,}")
    print(f"  CAPS RAGE messages:      {totals['total_caps_rage']:,}")
    print(f"  LOL count:               {totals['total_lol_count']:,}")
    print(f"  Total words:             {totals['total_word_count']:,}")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description='Backfill Claude.ai data export into claude-usage-analytics extension',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s "C:/Users/you/Downloads/data-2025-12-23-batch-0000"
  %(prog)s "~/Downloads/data-export" --json-only
  %(prog)s "C:/Users/you/Downloads/data-export" --output summary.json
        '''
    )
    parser.add_argument('data_dir', type=str, help='Path to extracted Claude data export folder')
    parser.add_argument('--json-only', action='store_true', help='Only export JSON summary, do not modify database')
    parser.add_argument('--output', '-o', type=str, help='Output JSON file path (default: backfill_summary.json)')
    parser.add_argument('--db', type=str, help='Custom database path (default: ~/.claude/analytics.db)')

    args = parser.parse_args()

    data_dir = Path(args.data_dir).expanduser().resolve()
    if not data_dir.exists():
        print(f"ERROR: Directory not found: {data_dir}")
        sys.exit(1)

    print(f"\nClaude Data Export Backfill Tool")
    print("=" * 40)
    print(f"Data directory: {data_dir}")

    # Process conversations
    daily_stats = process_conversations(data_dir)

    # Calculate costs
    daily_stats = calculate_costs(daily_stats)

    # Export JSON summary
    output_path = Path(args.output) if args.output else data_dir / 'backfill_summary.json'
    totals = export_json_summary(daily_stats, output_path)
    print(f"\nJSON summary exported to: {output_path}")

    # Write to database unless --json-only
    if not args.json_only:
        db_path = Path(args.db) if args.db else get_db_path()
        print(f"\nDatabase path: {db_path}")

        if db_path.exists():
            imported, skipped = write_to_sqlite(daily_stats, db_path)
            print(f"\nDatabase updated:")
            print(f"  Imported: {imported} days")
            print(f"  Skipped (already exist): {skipped} days")
        else:
            print(f"\nWARNING: Database not found at {db_path}")
            print("The extension creates the database on first run.")
            print("Run the VSCode extension first, then re-run this script.")
            print("\nAlternatively, use --json-only to export summary without database update.")

    # Print summary
    print_summary(totals)

    print("\nDone! Restart VSCode or refresh the Claude Usage extension to see updated stats.")


if __name__ == '__main__':
    main()
