import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs";

let pyodide;
let analyzeEvents;

async function initialize() {
  pyodide = await loadPyodide();
  const source = await (await fetch("./analyzer.py", { cache: "no-cache" })).text();
  await pyodide.runPythonAsync(source);
  analyzeEvents = pyodide.globals.get("analyze_events");
  self.postMessage({ type: "ready" });
}

const ready = initialize().catch((error) => {
  self.postMessage({ type: "error", error: `Python initialization failed: ${error.message}` });
  throw error;
});

self.onmessage = async (event) => {
  await ready;
  const { type, id, events, settings } = event.data;
  if (type !== "analyze") return;

  try {
    const json = analyzeEvents(
      JSON.stringify(events),
      settings.windowMs,
      settings.stepMs,
      settings.chordThresholdMs,
    );
    self.postMessage({ type: "analysis", id, result: JSON.parse(json) });
  } catch (error) {
    self.postMessage({ type: "error", id, error: error.message });
  }
};
