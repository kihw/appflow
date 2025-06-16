from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path


LOG_PATH = Path(__file__).resolve().parent.parent / "appflow.log"


def _parse_log(log_path: Path) -> list[tuple[datetime, str]]:
    """Return a list of (timestamp, app_name) for launch events."""
    events: list[tuple[datetime, str]] = []
    if not log_path.exists():
        return events
    pattern = re.compile(r"\[(.*?)\]\s+launch -> (.+)")
    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            m = pattern.search(line)
            if not m:
                continue
            try:
                ts = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
                app = m.group(2).strip()
                events.append((ts, app))
            except ValueError:
                continue
    return events


def _pair_counts(events: list[tuple[datetime, str]], window: int = 300) -> dict[tuple[str, str], int]:
    """Return counts of appA->appB launches within ``window`` seconds."""
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for (ts_a, app_a), (ts_b, app_b) in zip(events, events[1:]):
        if (ts_b - ts_a).total_seconds() <= window:
            counts[(app_a, app_b)] += 1
    return counts


def _frequency_analysis(events: list[tuple[datetime, str]]) -> dict[str, dict]:
    """Analyze app launch frequency by time of day."""
    app_times = defaultdict(list)
    for ts, app in events:
        app_times[app].append(ts.hour)
    
    patterns = {}
    for app, hours in app_times.items():
        if len(hours) >= 3:  # At least 3 launches
            most_common_hour = max(set(hours), key=hours.count)
            patterns[app] = {
                'most_common_hour': most_common_hour,
                'frequency': hours.count(most_common_hour),
                'total_launches': len(hours)
            }
    return patterns


def generate_suggestions(log_path: Path | None = None, min_count: int = 2) -> list[str]:
    """Analyze logs and return suggestion strings."""
    if log_path is None:
        log_path = LOG_PATH
    
    events = _parse_log(Path(log_path))
    if not events:
        return []
    
    suggestions: list[str] = []
    
    # Sequential app suggestions
    counts = _pair_counts(events)
    for (app_a, app_b), cnt in counts.items():
        if cnt >= min_count:
            suggestions.append(
                f"When '{app_a}' starts, consider launching '{app_b}' automatically (seen {cnt} times)"
            )
    
    # Time-based suggestions
    patterns = _frequency_analysis(events)
    for app, data in patterns.items():
        if data['frequency'] >= min_count:
            suggestions.append(
                f"'{app}' is frequently launched at {data['most_common_hour']:02d}:00 "
                f"({data['frequency']}/{data['total_launches']} times)"
            )
    
    # Battery-based suggestions (if available)
    try:
        import psutil
        battery = psutil.sensors_battery()
        if battery and battery.percent < 20:
            suggestions.append(
                "Battery is low - consider creating rules to close non-essential apps automatically"
            )
    except Exception:
        pass
    
    return suggestions


def generate_rule_template(app_a: str, app_b: str) -> dict:
    """Generate a YAML rule template for sequential app launches."""
    return {
        'name': f'Auto-launch {app_b} after {app_a}',
        'triggers': [{'app_start': app_a}],
        'actions': [
            {'wait': 2},
            {'launch': app_b},
            {'notify': f'{app_b} launched automatically'}
        ],
        'cooldown': 300,  # 5 minutes cooldown
        'enabled': True
    }


if __name__ == "__main__":
    suggestions = generate_suggestions()
    if not suggestions:
        print("No suggestions at this time.")
    else:
        print("Suggested workflows:")
        for s in suggestions:
            print(f"- {s}")
