# Expressive Performance Lab

A static, local-first web application for live MIDI visualization aimed at expressive-performance pedagogy and artistic research.

## v0.1 features

- Web MIDI input selection and live recording
- Python feature extraction in the browser through **Pyodide** and a Web Worker
- Raw MIDI preservation
- Time-varying descriptors:
  - MIDI velocity
  - score-free onset **pace proxy**
  - score-free articulation ratio
  - note density
  - register
  - sustain pedal
  - chord onset spread (included in exported analysis)
- Live **Expressive Timeline**
- **Performance Worm** (pace × velocity)
- Automatic local session persistence in IndexedDB when recording stops
- Reopen/delete previous sessions
- JSON export of raw data + analysis
- CSV export of feature curves
- Demo performance for testing without a keyboard

## Why the terminology is cautious

This prototype deliberately distinguishes measurements from musical interpretation:

- **Velocity** means MIDI key velocity, not acoustic loudness.
- **Pace** is a score-free proxy derived from inter-onset timing. In polyphonic music it is not equivalent to a definitive beat-tempo estimate.
- **Articulation** is a score-free note-duration / next-distinct-attack ratio. A score-aware version can later replace this with a more musically grounded articulation descriptor.

The goal is to expose interpretable expressive trajectories, not to assign a single score for “good phrasing.”

## Run locally

Web MIDI and module workers should be served over HTTP rather than by opening `index.html` as a file.

```bash
cd expressive-performance-lab
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a Web-MIDI-capable browser.

## Deploy to GitHub Pages

1. Create a GitHub repository and copy these files to its root.
2. Commit and push.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select your main branch and `/ (root)`.
5. Open the resulting HTTPS GitHub Pages URL.

The app has no backend and uploads no captured MIDI data.

## Browser notes

The app uses `navigator.requestMIDIAccess()`. Web MIDI requires a secure context and explicit user permission. GitHub Pages provides HTTPS. Browser support is not universal, so Chrome/Chromium is the safest target for the first prototype.

## Architecture

```text
MIDI device
   │
   ▼
Web MIDI API (JavaScript)
   │
   ├── raw MIDI events ─────► IndexedDB
   │
   ▼
Pyodide Web Worker
   │
   ▼
analyzer.py
   │
   ▼
feature frames + reconstructed notes
   │
   ▼
Canvas visualizations
```

## Research-oriented next steps

### v0.2
- multiscale smoothing / structural-resolution control
- phrase-change salience from convergent parameter change
- time annotations and teacher/student comments
- overlay/comparison of two recorded interpretations
- optional normalization per performer/device

### v0.3
- MIDI/MusicXML reference score import
- score-performance alignment
- score-relative timing deviations
- score-relative articulation
- phrase and structural annotations attached to score positions

## Files

- `index.html` — interface
- `styles.css` — visual design
- `app.js` — MIDI capture, storage, rendering, exports
- `pyworker.mjs` — Pyodide Web Worker
- `analyzer.py` — Python feature extraction

## License

MIT

## Fullscreen and remembered MIDI input

- Use the **Fullscreen** button in the top-right corner, or press **F**, to enter/leave browser fullscreen. Browsers require fullscreen to be initiated by a user gesture, so a normal web page cannot force true fullscreen automatically on page load.
- The app stores the last selected MIDI input in `localStorage` (ID, name, and manufacturer). On the next connection it restores that device when it is available.
- If the browser has already retained MIDI permission for the GitHub Pages origin, the app attempts to reconnect automatically on page load without showing a new permission prompt. If the browser does not expose MIDI permission state, **Connect MIDI** remains the fallback.
