"""Expressive Performance Lab — browser-side MIDI feature extraction.

This module is executed by Pyodide in a Web Worker. It intentionally uses only
Python's standard library so the app stays lightweight on GitHub Pages.
"""

from __future__ import annotations

import json
import math
import statistics
from bisect import bisect_right
from collections import defaultdict


def _median(values):
    values = list(values)
    return statistics.median(values) if values else None


def _mean(values):
    values = list(values)
    return sum(values) / len(values) if values else None


def _clamp(value, lo, hi):
    return max(lo, min(hi, value))


def _reconstruct(events):
    """Convert raw MIDI events to note, pedal, and note-on structures."""
    active = defaultdict(list)
    notes = []
    note_ons = []
    pedals = []

    for event in sorted(events, key=lambda e: e.get("t", 0)):
        t = float(event.get("t", 0.0))
        data = event.get("data") or []
        if len(data) < 2:
            continue
        status = int(data[0])
        d1 = int(data[1]) if len(data) > 1 else 0
        d2 = int(data[2]) if len(data) > 2 else 0
        kind = status & 0xF0
        channel = status & 0x0F

        # Note on (velocity > 0)
        if kind == 0x90 and d2 > 0:
            key = (channel, d1)
            active[key].append((t, d2))
            note_ons.append({"t": t, "pitch": d1, "velocity": d2, "channel": channel})

        # Note off, including note-on with velocity 0
        elif kind == 0x80 or (kind == 0x90 and d2 == 0):
            key = (channel, d1)
            if active[key]:
                onset, velocity = active[key].pop(0)
                if t >= onset:
                    notes.append({
                        "onset": onset,
                        "offset": t,
                        "duration": t - onset,
                        "pitch": d1,
                        "velocity": velocity,
                        "channel": channel,
                    })

        # Sustain pedal CC64
        elif kind == 0xB0 and d1 == 64:
            pedals.append({"t": t, "value": d2})

    # Close currently held notes at the final timestamp so live analysis can use them.
    end_t = max([float(e.get("t", 0.0)) for e in events], default=0.0)
    for (channel, pitch), stack in active.items():
        for onset, velocity in stack:
            if end_t >= onset:
                notes.append({
                    "onset": onset,
                    "offset": end_t,
                    "duration": end_t - onset,
                    "pitch": pitch,
                    "velocity": velocity,
                    "channel": channel,
                    "open": True,
                })

    return sorted(notes, key=lambda n: n["onset"]), sorted(note_ons, key=lambda n: n["t"]), pedals


def _attack_groups(note_ons, threshold_ms=70.0):
    """Group near-simultaneous note-ons into attacks/chords."""
    if not note_ons:
        return []
    groups = []
    current = [note_ons[0]]
    start = note_ons[0]["t"]
    for note in note_ons[1:]:
        if note["t"] - start <= threshold_ms:
            current.append(note)
        else:
            groups.append(current)
            current = [note]
            start = note["t"]
    groups.append(current)
    result = []
    for g in groups:
        times = [n["t"] for n in g]
        result.append({
            "t": _mean(times),
            "spread_ms": max(times) - min(times),
            "size": len(g),
            "velocity": _mean(n["velocity"] for n in g),
            "pitch": _mean(n["pitch"] for n in g),
        })
    return result


def _pedal_at(pedals, t):
    value = 0
    for p in pedals:
        if p["t"] > t:
            break
        value = p["value"]
    return value


def _articulation_values(notes, attack_times):
    """Score-free articulation proxy: duration / time to next distinct attack.

    1.0 approximates connection to the next attack, <1 indicates a gap,
    >1 indicates overlap. This is intentionally labelled a proxy in the UI.
    """
    values = []
    if len(attack_times) < 2:
        return values
    for note in notes:
        i = bisect_right(attack_times, note["onset"] + 70.0)
        if i >= len(attack_times):
            continue
        next_t = attack_times[i]
        io_ms = next_t - note["onset"]
        if io_ms <= 20:
            continue
        ratio = note["duration"] / io_ms
        values.append({"t": note["onset"], "ratio": _clamp(ratio, 0.0, 2.0)})
    return values


def _local(values, t, half_window, key="t"):
    lo = t - half_window
    hi = t + half_window
    return [v for v in values if lo <= v[key] <= hi]


def analyze_events(events_json, window_ms=1800, step_ms=200, chord_threshold_ms=70):
    """Return JSON with reconstructed notes and time-varying expressive features."""
    events = json.loads(events_json) if isinstance(events_json, str) else events_json
    notes, note_ons, pedals = _reconstruct(events)
    attacks = _attack_groups(note_ons, float(chord_threshold_ms))
    attack_times = [a["t"] for a in attacks]
    articulation = _articulation_values(notes, attack_times)

    if events:
        end_t = max(float(e.get("t", 0.0)) for e in events)
    else:
        end_t = 0.0

    half = max(100.0, float(window_ms) / 2.0)
    step = max(50.0, float(step_ms))
    frames = []

    t = 0.0
    while t <= end_t + step:
        local_ons = _local(note_ons, t, half)
        local_attacks = _local(attacks, t, half)
        local_art = _local(articulation, t, half)

        velocity = _mean(n["velocity"] for n in local_ons)
        pitch = _mean(n["pitch"] for n in local_ons)
        density = len(local_ons) / (2.0 * half / 1000.0)
        chord_spread = _mean(a["spread_ms"] for a in local_attacks if a["size"] > 1)

        # Score-free pace proxy based on the median interval between distinct attacks.
        local_times = [a["t"] for a in local_attacks]
        intervals = [b - a for a, b in zip(local_times, local_times[1:]) if b - a >= 80]
        median_ioi = _median(intervals)
        pace = 60000.0 / median_ioi if median_ioi else None
        if pace is not None:
            pace = _clamp(pace, 20.0, 360.0)

        art = _median(a["ratio"] for a in local_art)
        pedal = _pedal_at(pedals, t)

        frames.append({
            "t": round(t, 3),
            "velocity": None if velocity is None else round(velocity, 3),
            "pace": None if pace is None else round(pace, 3),
            "articulation": None if art is None else round(art, 4),
            "density": round(density, 4),
            "register": None if pitch is None else round(pitch, 3),
            "pedal": pedal,
            "chord_spread": None if chord_spread is None else round(chord_spread, 3),
        })
        t += step

    summary = {
        "duration_ms": end_t,
        "note_count": len(note_ons),
        "completed_note_count": sum(1 for n in notes if not n.get("open")),
        "mean_velocity": _mean(n["velocity"] for n in note_ons),
        "median_chord_spread_ms": _median(a["spread_ms"] for a in attacks if a["size"] > 1),
    }

    return json.dumps({
        "frames": frames,
        "notes": notes,
        "attacks": attacks,
        "pedal": pedals,
        "summary": summary,
        "analysis": {
            "window_ms": window_ms,
            "step_ms": step_ms,
            "chord_threshold_ms": chord_threshold_ms,
            "version": "0.1.0",
        },
    }, separators=(",", ":"))
