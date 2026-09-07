# Research notes: expressive descriptors

This document states what v0.1 measures and, equally importantly, what it does **not** claim to measure.

## Design principle

The interface keeps several expressive dimensions visible rather than collapsing them into one performance-quality score. A musical phrase can be shaped through timing, dynamics, articulation, register, texture, pedalling, or combinations of them; the pedagogical value lies partly in seeing whether those dimensions converge or diverge.

## v0.1 descriptors

### MIDI velocity

For each analysis frame, the app computes the mean key velocity of note-on events inside a moving window.

Interpretation: a proxy for performed key-strike intensity. It is **not acoustic loudness** and should not be compared naively across unrelated instruments or MIDI devices.

### Onset pace

Near-simultaneous note-ons are grouped as a single attack using a configurable threshold (70 ms by default). Within each moving window the median interval between successive attacks is calculated:

```text
pace = 60,000 / median inter-attack interval in ms
```

The result is deliberately called a **BPM-like pace proxy**, not tempo. Without a score or a beat tracker, note-on spacing and musical beat tempo are not the same thing.

### Articulation proxy

For a completed note, v0.1 estimates:

```text
articulation = performed note duration / time to next distinct attack
```

Values below 1 suggest a gap before the following attack; values above 1 suggest overlap. Values are clipped to 0–2 for visualization.

This becomes much more musically grounded in a score-aware version, where performed duration can be related to the notated duration and local performed tempo.

### Note density

Number of note-on events per second inside the moving window. This can expose local activity/repose but is influenced by polyphony and ornamentation.

### Register

Mean MIDI pitch of note-on events in the moving window. It is currently exported for research use but not one of the four main timeline lanes.

### Sustain pedal

The most recent value of CC64 at each analysis frame.

### Chord onset spread

For attack groups containing more than one note, the temporal spread between earliest and latest onset is measured in milliseconds. This is exported and can later become its own visualization.

## Performance Worm

The v0.1 worm maps:

```text
x = local onset pace

y = local MIDI velocity
```

This is a contemporary browser implementation inspired by the Performance Worm tradition in expressive-performance research. The important idea is that an interpretation becomes a trajectory through an expressive parameter space rather than four disconnected numerical readouts.

## Proposed v0.2: Phrase-change salience

Rather than “detecting phrases,” the next stage should estimate **evidence for expressive/structural change**. A first transparent model could combine normalized rates of change:

```text
S(t) = wV·|dV/dt|
     + wP·|dP/dt|
     + wA·|dA/dt|
     + wD·|dD/dt|
     + wR·|dR/dt|
```

where V = velocity, P = pace, A = articulation, D = density, R = register.

Several improvements should be tested rather than assumed:

- signed vs absolute derivatives
- robust normalization per session or performer
- multiscale smoothing
- explicit pause evidence
- pedal release/re-attack as boundary evidence
- convergence measures: do several dimensions change together?
- score-informed cadence / metrical / harmonic evidence once MusicXML is available

The interface should call peaks **candidate boundaries** or **change salience**, not phrases, unless validated against annotations or a score-based model.

## Proposed validation path

1. Record repeated interpretations of the same phrase.
2. Ask performer and teacher to annotate perceived phrase boundaries and expressive intentions.
3. Compare descriptor trajectories across repetitions.
4. Evaluate whether multivariate salience peaks coincide with annotations.
5. Examine disagreements qualitatively rather than optimizing only one accuracy score.
6. Add score alignment and compare score-free vs score-aware descriptors.

This would turn the tool from a visualization utility into an empirical artistic-research platform.
