# Expressive Performance Lab · portal presentation

This folder owns the project's presentation in the [MUK Performance Research Lab portal](https://muk-research.github.io/PORTAL/). The full MIDI application remains at the [project root](https://muk-research.github.io/Klavier/).

## Files and ownership

- `metadata.json`: version-1 project manifest, description, credits and links.
- `preview.svg`: project-owned, accessible static thumbnail.
- `index.html`: self-contained, silent interactive sketch.

The central registry contains only `id: "klavier"` and the published manifest URL: `https://muk-research.github.io/Klavier/portal/metadata.json`. It appears fourth, after PianoRules, Tutor and Tesserakt 2.0. Its category is **learning**, with a **Performance** tag so both filters can discover it. Relative assets resolve beside the manifest, not beside the central portal.

Edit the content here, allow this repository's Pages deployment to finish, then reload the central portal. Do not copy descriptions or assets into PORTAL. Branch publishing from `main` / root includes this folder; a future custom build must explicitly include `portal/` in its artifact.

## What the sketch means

**Dynamic arc** and **Timing sway** change synthetic, normalized contours. **Even**, **Arch** and **Linger** are visual presets, not pedagogical assessments. Velocity, onset pace and articulation appear over time on the left; a fading pace–velocity Performance Worm appears on the right.

These are illustrative shapes, **not recorded MIDI**, computed phrasing, calibrated loudness or a definitive beat-tempo estimate. The sketch neither imports nor duplicates the application's MIDI/Python analysis engine. Use **Open project** on the central card for live capture, fullscreen and saved sessions. See [the project's research notes](../RESEARCH_NOTES.md) for measurement terminology.

## Embed contract and privacy

Matches [PORTAL's project contract](https://github.com/MUK-research/PORTAL/blob/main/docs/PROJECTS.md): `sandbox="allow-scripts"`, inline classic JavaScript/CSS, no dependencies, no external fetches, no storage, no MIDI, no audio and no permission requests. The project link within the standalone sketch is hidden when embedded.

Supports `prlToken`, `embed=1` and `motion=on|off`; emits `prl:ready` and `prl:resize`. Incoming `prl:visibility` messages require the parent window, matching token and a boolean `active`. Motion respects parent visibility, tab visibility, offscreen state, reduced-motion preference and the local pause button. Keyboard-operable sliders/presets remain useful without animation. Canvas pixel ratio and animation updates are capped.

## Checks

`tests/portal_preview.py` exercises the actual local HTTP endpoint inside an opaque sandbox, readiness/resize, controls, keyboard operation, motion messages, reduced motion and narrow layouts. With Playwright and Chromium installed:

```bash
python tests/portal_preview.py
# Or use an existing browser:
CHROME_BIN=/usr/bin/chromium python tests/portal_preview.py
```

The central PORTAL browser suite also checks this project's published manifest, thumbnail and embedded controls. These presentation tests do not certify the full MIDI app or physical-device compatibility.
