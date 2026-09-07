const $ = (id) => document.getElementById(id);

const state = {
  midiAccess: null,
  input: null,
  recording: false,
  startPerf: 0,
  events: [],
  analysis: null,
  workerReady: false,
  analysisBusy: false,
  analysisQueued: false,
  requestId: 0,
  animationFrame: null,
  autosaveTimer: null,
  currentSessionId: null,
  sessionCreatedAt: null,
  autoSavePending: false,
};

const settings = {
  get windowMs() { return Number($("windowRange").value); },
  stepMs: 200,
  chordThresholdMs: 70,
};

const worker = new Worker("./pyworker.mjs", { type: "module" });
worker.onmessage = (e) => {
  if (e.data.type === "ready") {
    state.workerReady = true;
    $("pythonDot").classList.add("ready");
    $("pythonStatus").textContent = "Python ready";
    updateRecordAvailability();
  } else if (e.data.type === "analysis") {
    state.analysisBusy = false;
    state.analysis = e.data.result;
    drawAll();
    updateLiveMetrics();
    $("saveButton").disabled = state.events.length === 0;
    $("exportJson").disabled = state.events.length === 0;
    $("exportCsv").disabled = state.events.length === 0;
    if (state.analysisQueued) {
      state.analysisQueued = false;
      requestAnalysis();
    } else if (state.autoSavePending) {
      state.autoSavePending = false;
      saveSession(true);
    }
  } else if (e.data.type === "error") {
    state.analysisBusy = false;
    $("pythonStatus").textContent = e.data.error;
    console.error(e.data.error);
  }
};
worker.onerror = (error) => {
  $("pythonStatus").textContent = "Python worker error";
  console.error(error);
};

function updateRecordAvailability() {
  $("recordButton").disabled = !(state.workerReady && state.input);
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    $("midiStatus").textContent = "Web MIDI is unavailable in this browser.";
    return;
  }
  try {
    state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    state.midiAccess.onstatechange = refreshMidiInputs;
    refreshMidiInputs();
    $("midiStatus").textContent = "MIDI access granted";
  } catch (error) {
    $("midiStatus").textContent = `MIDI access failed: ${error.message}`;
  }
}

function refreshMidiInputs() {
  const select = $("midiInput");
  const inputs = [...state.midiAccess.inputs.values()];
  select.innerHTML = "";
  if (!inputs.length) {
    select.innerHTML = '<option value="">No MIDI inputs</option>';
    select.disabled = true;
    detachInput();
    return;
  }
  select.disabled = false;
  inputs.forEach((input) => {
    const option = document.createElement("option");
    option.value = input.id;
    option.textContent = input.name || `MIDI input ${input.id}`;
    select.appendChild(option);
  });
  const stillPresent = state.input && inputs.some(i => i.id === state.input.id);
  select.value = stillPresent ? state.input.id : inputs[0].id;
  attachInput(select.value);
}

function detachInput() {
  if (state.input) state.input.onmidimessage = null;
  state.input = null;
  updateRecordAvailability();
}

function attachInput(id) {
  detachInput();
  state.input = state.midiAccess?.inputs.get(id) || null;
  if (state.input) {
    state.input.onmidimessage = onMidiMessage;
    $("midiStatus").textContent = state.input.name || "MIDI connected";
  }
  updateRecordAvailability();
}

function onMidiMessage(event) {
  if (!state.recording) return;
  const t = performance.now() - state.startPerf;
  state.events.push({ t, data: [...event.data] });
  scheduleAnalysis();
}

function startRecording() {
  state.events = [];
  state.analysis = null;
  state.currentSessionId = null;
  state.sessionCreatedAt = null;
  state.recording = true;
  state.currentSessionId = crypto.randomUUID();
  state.sessionCreatedAt = new Date().toISOString();
  state.startPerf = performance.now();
  $("recordButton").textContent = "■ Stop";
  $("recordButton").classList.add("recording");
  $("sessionTitle").value = `Performance ${new Date().toLocaleString()}`;
  drawAll();
  tickClock();
  state.autosaveTimer = setInterval(scheduleAnalysis, 500);
}

function stopRecording() {
  state.recording = false;
  clearInterval(state.autosaveTimer);
  $("recordButton").textContent = "● Record";
  $("recordButton").classList.remove("recording");
  cancelAnimationFrame(state.animationFrame);
  updateClock();
  state.autoSavePending = state.events.length > 0;
  requestAnalysis();
}

function toggleRecording() {
  if (state.recording) stopRecording(); else startRecording();
}

function tickClock() {
  updateClock();
  if (state.recording) state.animationFrame = requestAnimationFrame(tickClock);
}

function updateClock() {
  const ms = state.recording ? performance.now() - state.startPerf : (state.analysis?.summary?.duration_ms || 0);
  const total = ms / 1000;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  $("clock").textContent = `${String(mins).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}

let scheduleTimer;
function scheduleAnalysis() {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(requestAnalysis, 70);
}

function requestAnalysis() {
  if (!state.workerReady || !state.events.length) return;
  if (state.analysisBusy) {
    state.analysisQueued = true;
    return;
  }
  state.analysisBusy = true;
  worker.postMessage({
    type: "analyze",
    id: ++state.requestId,
    events: state.events,
    settings: { windowMs: settings.windowMs, stepMs: settings.stepMs, chordThresholdMs: settings.chordThresholdMs },
  });
}

function clearSession() {
  if (state.recording) stopRecording();
  state.events = [];
  state.analysis = null;
  state.currentSessionId = null;
  state.sessionCreatedAt = null;
  state.autoSavePending = false;
  $("clock").textContent = "00:00.0";
  $("sessionTitle").value = "Untitled performance";
  ["saveButton", "exportJson", "exportCsv"].forEach(id => $(id).disabled = true);
  updateLiveMetrics();
  drawAll();
}

function makeDemo() {
  if (state.recording) stopRecording();
  clearSession();
  const events = [];
  let t = 0;
  const phrase = [60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60];
  phrase.forEach((pitch, i) => {
    const arch = 1 - Math.abs((i - (phrase.length - 1) / 2) / ((phrase.length - 1) / 2));
    const velocity = Math.round(50 + 55 * arch);
    const io = 520 + 180 * Math.pow(Math.abs(i - 5) / 5, 1.8);
    const duration = io * (0.78 + 0.28 * arch);
    events.push({ t, data: [0x90, pitch, velocity] });
    events.push({ t: t + duration, data: [0x80, pitch, 0] });
    if (i === 2) events.push({ t: t + 40, data: [0xB0, 64, 127] });
    if (i === 8) events.push({ t: t + 50, data: [0xB0, 64, 0] });
    t += io;
  });
  state.events = events.sort((a, b) => a.t - b.t);
  $("sessionTitle").value = "Demo phrase";
  requestAnalysis();
}

function updateLiveMetrics() {
  const frames = state.analysis?.frames || [];
  let frame = [...frames].reverse().find(f => f.velocity != null || f.pace != null) || frames.at(-1);
  const fmt = (x, digits=0) => x == null ? "—" : Number(x).toFixed(digits);
  $("liveVelocity").textContent = fmt(frame?.velocity, 0);
  $("livePace").textContent = fmt(frame?.pace, 0);
  $("liveArticulation").textContent = fmt(frame?.articulation, 2);
  $("liveDensity").textContent = fmt(frame?.density, 1);
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.round(w * (canvas.height / canvas.width));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawAll() {
  drawTimeline();
  drawWorm();
}

function drawTimeline() {
  const { ctx, w, h } = setupCanvas($("timeline"));
  ctx.clearRect(0, 0, w, h);
  const frames = state.analysis?.frames || [];
  const pad = { l: 44, r: 14, t: 18, b: 28 };
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;
  const lanes = [
    { key: "velocity", label: "VEL", min: 1, max: 127, color: css("--velocity") },
    { key: "pace", label: "PACE", min: 40, max: 240, color: css("--pace") },
    { key: "articulation", label: "ART", min: 0, max: 2, color: css("--articulation"), ref: 1 },
    { key: "density", label: "DENS", min: 0, max: Math.max(8, ...frames.map(f => f.density || 0)), color: css("--density") },
  ];
  const laneH = chartH / lanes.length;
  const endT = Math.max(1000, state.analysis?.summary?.duration_ms || 1000);

  ctx.font = "11px system-ui";
  ctx.textBaseline = "middle";
  lanes.forEach((lane, li) => {
    const top = pad.t + li * laneH;
    ctx.strokeStyle = "#2b3038";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, top); ctx.lineTo(w - pad.r, top); ctx.stroke();
    ctx.fillStyle = "#7f8794"; ctx.fillText(lane.label, 7, top + laneH / 2);
    if (lane.ref != null) {
      const y = top + laneH - ((lane.ref - lane.min) / (lane.max - lane.min)) * laneH;
      ctx.strokeStyle = "#3a404a"; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = lane.color; ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    frames.forEach((f) => {
      const value = f[lane.key];
      if (value == null) { started = false; return; }
      const x = pad.l + (f.t / endT) * chartW;
      const norm = Math.max(0, Math.min(1, (value - lane.min) / (lane.max - lane.min)));
      const y = top + laneH - norm * (laneH - 10) - 5;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.strokeStyle = "#2b3038";
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t + chartH); ctx.lineTo(w - pad.r, pad.t + chartH); ctx.stroke();
  ctx.fillStyle = "#7f8794"; ctx.textBaseline = "top";
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (i / 4) * chartW;
    const seconds = endT * i / 4 / 1000;
    ctx.fillText(`${seconds.toFixed(seconds < 10 ? 1 : 0)}s`, x - 8, h - 21);
  }
}

function drawWorm() {
  const { ctx, w, h } = setupCanvas($("worm"));
  ctx.clearRect(0, 0, w, h);
  const pad = 38;
  const frames = (state.analysis?.frames || []).filter(f => f.velocity != null && f.pace != null);
  const xMin = 40, xMax = 240, yMin = 1, yMax = 127;
  const sx = (v) => pad + (Math.max(xMin, Math.min(xMax, v)) - xMin) / (xMax - xMin) * (w - 2 * pad);
  const sy = (v) => h - pad - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin) * (h - 2 * pad);
  ctx.strokeStyle = "#2b3038"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = pad + i / 4 * (w - 2 * pad); ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
    const y = pad + i / 4 * (h - 2 * pad); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }
  ctx.fillStyle = "#7f8794"; ctx.font = "11px system-ui";
  ctx.save(); ctx.translate(13, h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("velocity →", 0, 0); ctx.restore();
  if (!frames.length) return;
  frames.forEach((f, i) => {
    if (i === 0) return;
    const alpha = 0.12 + 0.78 * (i / frames.length);
    ctx.strokeStyle = `rgba(167,243,208,${alpha})`;
    ctx.lineWidth = 1.5 + 2 * (i / frames.length);
    ctx.beginPath(); ctx.moveTo(sx(frames[i - 1].pace), sy(frames[i - 1].velocity)); ctx.lineTo(sx(f.pace), sy(f.velocity)); ctx.stroke();
  });
  const last = frames.at(-1);
  ctx.fillStyle = css("--accent"); ctx.beginPath(); ctx.arc(sx(last.pace), sy(last.velocity), 6, 0, Math.PI * 2); ctx.fill();
}

const DB_NAME = "expressive-performance-lab";
const STORE = "sessions";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSession(silent = false) {
  if (!state.events.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const session = {
    id: state.currentSessionId || crypto.randomUUID(),
    title: $("sessionTitle").value.trim() || "Untitled performance",
    createdAt: state.sessionCreatedAt || new Date().toISOString(),
    midiDevice: state.input?.name || "unknown / demo",
    events: state.events,
    analysis: state.analysis,
    settings: { windowMs: settings.windowMs, stepMs: settings.stepMs, chordThresholdMs: settings.chordThresholdMs },
    formatVersion: 1,
  };
  tx.objectStore(STORE).put(session);
  state.currentSessionId = session.id;
  state.sessionCreatedAt = session.createdAt;
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
  await refreshSessions();
  if (!silent) $("midiStatus").textContent = "Session saved locally";
}

async function getSessions() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).getAll();
  const sessions = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  db.close();
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function refreshSessions() {
  const list = $("sessionList");
  const sessions = await getSessions();
  list.innerHTML = "";
  if (!sessions.length) {
    list.innerHTML = '<span class="muted">No saved sessions yet.</span>';
    return;
  }
  sessions.forEach((s) => {
    const item = document.createElement("div");
    item.className = "session-item";
    const dur = (s.analysis?.summary?.duration_ms || 0) / 1000;
    item.innerHTML = `<div><strong></strong><small></small></div><button class="delete" title="Delete session">×</button>`;
    item.querySelector("strong").textContent = s.title;
    item.querySelector("small").textContent = `${new Date(s.createdAt).toLocaleString()} · ${dur.toFixed(1)} s · ${s.events.length} MIDI events`;
    item.querySelector("div").onclick = () => loadSession(s);
    item.querySelector("button").onclick = async (e) => { e.stopPropagation(); await deleteSession(s.id); };
    list.appendChild(item);
  });
}

function loadSession(session) {
  if (state.recording) stopRecording();
  state.events = session.events || [];
  state.analysis = session.analysis || null;
  state.currentSessionId = session.id;
  state.sessionCreatedAt = session.createdAt;
  $("sessionTitle").value = session.title || "Untitled performance";
  if (session.settings?.windowMs) $("windowRange").value = session.settings.windowMs;
  updateWindowLabel();
  ["saveButton", "exportJson", "exportCsv"].forEach(id => $(id).disabled = !state.events.length);
  updateClock(); updateLiveMetrics(); drawAll();
  if (!state.analysis && state.events.length) requestAnalysis();
}

async function deleteSession(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
  refreshSessions();
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = {
    title: $("sessionTitle").value,
    exportedAt: new Date().toISOString(),
    events: state.events,
    analysis: state.analysis,
    settings: { windowMs: settings.windowMs, stepMs: settings.stepMs, chordThresholdMs: settings.chordThresholdMs },
  };
  download("expressive-performance-session.json", JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv() {
  const frames = state.analysis?.frames || [];
  const keys = ["t", "velocity", "pace", "articulation", "density", "register", "pedal", "chord_spread"];
  const rows = [keys.join(","), ...frames.map(f => keys.map(k => f[k] ?? "").join(","))];
  download("expressive-performance-features.csv", rows.join("\n"), "text/csv");
}

function updateWindowLabel() {
  $("windowLabel").value = `${(settings.windowMs / 1000).toFixed(1)} s`;
  $("windowLabel").textContent = `${(settings.windowMs / 1000).toFixed(1)} s`;
}

$("connectMidi").onclick = connectMidi;
$("midiInput").onchange = (e) => attachInput(e.target.value);
$("recordButton").onclick = toggleRecording;
$("demoButton").onclick = makeDemo;
$("clearButton").onclick = clearSession;
$("saveButton").onclick = () => saveSession(false);
$("exportJson").onclick = exportJson;
$("exportCsv").onclick = exportCsv;
$("windowRange").oninput = () => { updateWindowLabel(); scheduleAnalysis(); };
window.addEventListener("resize", drawAll);

updateWindowLabel();
refreshSessions();
drawAll();

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
