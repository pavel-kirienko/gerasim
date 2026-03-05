// ---------------------------------------------------------------------------
// Entry point — animation loop, bootstrap
// ---------------------------------------------------------------------------

import { NetworkConfig } from "./types.js";
import { Simulation, SimState } from "./sim.js";
import { Renderer } from "./render.js";
import { UI } from "./ui.js";

const INITIAL_NODES = 6;
const STEP_US = 1_000; // 1ms sim time per step
const MAX_BUDGET_US = 1_000_000; // cap budget to 1s sim time per frame

let sim: Simulation;
let renderer: Renderer;
let ui: UI;
let canvas: HTMLCanvasElement;
let lastWallTime: number | null = null;
let simTimeBudget = 0;

// History
let history: SimState[] = [];
let historyIndex = -1; // -1 = no snapshots yet

function createSim(seed?: number): Simulation {
  if (seed === undefined) {
    seed = Math.random() * 0xFFFFFFFF | 0;
  }
  const net: NetworkConfig = {
    delayUs: [1_000, 10_000],
    lossProbability: 0.0,
  };
  const s = new Simulation(net, seed);
  for (let i = 0; i < INITIAL_NODES; i++) {
    s.addNode(i);
  }
  return s;
}

function relayout(): void {
  const ids = [...sim.nodes.keys()].sort((a, b) => a - b);
  renderer.layoutNodes(ids);
  sim.setNodePositions(renderer.nodePositions);
}

function resizeCanvas(): void {
  const container = canvas.parentElement!;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  relayout();
}

function saveSnapshot(): void {
  // Truncate future history if navigated back
  if (historyIndex < history.length - 1) {
    history.length = historyIndex + 1;
  }
  history.push(sim.saveState());
  historyIndex = history.length - 1;
}

/** Single 10ms step. Returns true if events occurred (snapshot saved). */
function doStep(): boolean {
  const newEvents = sim.stepUntil(sim.nowUs + STEP_US);
  if (newEvents.length > 0) {
    saveSnapshot();
    renderCurrent(newEvents);
    return true;
  }
  renderCurrent([]);
  return false;
}

/** Step until next event occurs (for Step button). */
function doStepToNextEvent(): void {
  const maxUs = sim.nowUs + MAX_BUDGET_US;
  while (sim.nowUs < maxUs) {
    if (doStep()) return;
  }
}

function renderCurrent(events: import("./types.js").EventRecord[] = []): void {
  const snaps = sim.snapshot();
  renderer.render(sim.nowUs, snaps, events);
  ui.updateFrame(sim.nowUs, snaps, historyIndex + 1, history.length);
}

function navigateTo(index: number): void {
  if (index < 0 || index >= history.length) return;
  sim.loadState(history[index]);
  historyIndex = index;
  renderer.clearAnimations();
  renderCurrent();
}

function resetWithSeed(seed: number): void {
  sim = createSim(seed);
  ui.setSim(sim);
  history = [];
  historyIndex = -1;
  lastWallTime = null;
  simTimeBudget = 0;
  relayout();
  renderCurrent();
}

function tick(wallTime: number): void {
  if (lastWallTime === null) lastWallTime = wallTime;
  const wallDtMs = wallTime - lastWallTime;
  lastWallTime = wallTime;

  if (ui.playing) {
    simTimeBudget += wallDtMs * 1000 * ui.speedMultiplier;
    if (simTimeBudget > MAX_BUDGET_US) simTimeBudget = MAX_BUDGET_US;
    if (simTimeBudget < 0) simTimeBudget = 0;

    while (simTimeBudget >= STEP_US) {
      doStep();
      simTimeBudget -= STEP_US;
    }
  } else {
    // Always render when paused so UI interactions are visible
    renderCurrent();
  }

  requestAnimationFrame(tick);
}

function init(): void {
  canvas = document.getElementById("sim-canvas") as HTMLCanvasElement;
  const topBar = document.getElementById("top-bar")!;
  const sidePanel = document.getElementById("side-panel")!;
  const overlayContainer = document.getElementById("overlay-container")!;

  sim = createSim();
  renderer = new Renderer(canvas);
  ui = new UI(sim, renderer, topBar, sidePanel, overlayContainer);

  ui.onRelayout = relayout;
  ui.onStepCallback = doStepToNextEvent;
  ui.onNavigate = navigateTo;
  ui.onApplySeed = resetWithSeed;
  ui.onUserInteraction = () => { saveSnapshot(); renderCurrent(); };
  ui.setSeedDisplay(sim.seed);

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  renderCurrent();
  requestAnimationFrame(tick);
}

document.addEventListener("DOMContentLoaded", init);
