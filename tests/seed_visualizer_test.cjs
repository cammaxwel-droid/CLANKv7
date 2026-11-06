"use strict";

// Controller/local-file checks only: recorded drawing commands are not browser pixels or layout.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const examples = path.join(__dirname, "..", "examples");
const html = readFileSync(path.join(examples, "seed_visualizer.html"), "utf8");
const engine = new vm.Script(readFileSync(path.join(examples, "seed_lab.js"), "utf8"), { filename: "seed_lab.js" });
const controller = new vm.Script(readFileSync(path.join(examples, "seed_visualizer.js"), "utf8"), { filename: "seed_visualizer.js" });
const DEFAULT_SEED = 0x0123456789abcdefn;
const MAX_SEED_TEXT = "18446744073709551615";
const canvasIds = ["histogram", "scatter", "baseline-raster", "selected-raster"];
const metricIds = ["metric-mean", "metric-ones", "metric-correlation", "metric-repeats"];

class Target {
  constructor(registry, name) {
    this.name = name;
    this.listeners = new Map();
    this.registrations = 0;
    registry.push(this);
  }
  addEventListener(type, callback) {
    this.registrations += 1;
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  emit(type, properties = {}) {
    const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    for (let target = this; target; target = event.bubbles ? target.parentElement : null) {
      for (const callback of target.listeners.get(type) || []) callback(event);
    }
    return event;
  }
}

class Node extends Target {
  constructor(registry, tag) {
    super(registry, tag);
    this.tag = tag;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.id = "";
    this._text = "";
    this.hidden = this.disabled = this.checked = false;
    this.value = "";
    this.classList = {
      contains: (token) => this.className.split(/\s+/).includes(token),
      toggle: (token, enabled) => {
        const tokens = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) tokens.add(token); else tokens.delete(token);
        this.className = [...tokens].join(" ");
      }
    };
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tag === "#fragment") {
        this.append(...node.children.slice());
        node.children = [];
      } else {
        if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = value;
    if (["id", "type", "value"].includes(name)) this[name] = value;
    if (["disabled", "hidden", "checked"].includes(name)) this[name] = true;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector === "input:checked") return this.tag === "input" && this.checked;
    assert.match(selector, /^[a-z]+$/, `Unsupported mock selector: ${selector}`);
    return this.tag === selector;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  click() {
    for (let node = this; node; node = node.parentElement) if (node.disabled) return;
    if (this.type === "checkbox") {
      this.checked = !this.checked;
      this.emit("change", { bubbles: true });
    } else this.emit("click", { bubbles: true });
  }
}

function canvasContext() {
  const defaults = { fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, lineWidth: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic" };
  const context = { ...defaults, commands: [], draws: 0, stack: [], reset() { Object.assign(this, defaults); this.commands = []; } };
  for (const method of ["setTransform", "clearRect", "setLineDash", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "fillText", "save", "restore", "translate", "rotate", "rect", "clip", "arc", "fill"]) {
    context[method] = (...args) => {
      for (const value of args.flat()) if (typeof value === "number") assert.ok(Number.isFinite(value), `${method} received ${value}`);
      assert.ok(Number.isFinite(context.globalAlpha) && Number.isFinite(context.lineWidth));
      if (method === "clearRect") context.commands = [];
      if (method === "save") context.stack.push(Object.fromEntries(Object.keys(defaults).map((key) => [key, context[key]])));
      if (method === "restore") {
        assert.ok(context.stack.length, "Canvas restore must have a matching save");
        Object.assign(context, context.stack.pop());
      }
      const style = method === "stroke" ? [context.strokeStyle, context.globalAlpha, context.lineWidth]
        : ["fill", "fillRect", "fillText"].includes(method) ? [context.fillStyle, context.globalAlpha] : [];
      if (["fill", "fillRect", "stroke"].includes(method)) context.draws += 1;
      context.commands.push([method, ...args, ...style]);
    };
  }
  return context;
}

function boot({ reducedMotion = false, ratio = 2, resizeObserver = true, legacyMedia = false } = {}) {
  const registry = [];
  const nodes = [];
  const document = new Target(registry, "document");
  document.hidden = false;
  document.createElement = (tag) => { const node = new Node(registry, tag); nodes.push(node); return node; };
  document.createDocumentFragment = () => document.createElement("#fragment");
  document.createTextNode = (text) => { const node = document.createElement("#text"); node.textContent = text; return node; };
  document.getElementById = (id) => nodes.find((node) => node.id === id) || null;
  const get = (id) => { const node = document.getElementById(id); assert.ok(node, `Missing #${id}`); return node; };

  // Read real IDs/default attributes; only the parent relationships used by the controller are modeled.
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const node = document.createElement(match[1]);
    for (const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(attribute[1], attribute[2] || "");
  }
  get("seed-form").append(get("seed-input"), get("apply-seed"));
  get("equation-controls").append(get("experiment-toggles"));
  const canvases = canvasIds.map((id) => {
    const canvas = get(id);
    const wrapper = document.createElement("div");
    wrapper.bounds = { width: id === "histogram" ? 720 : 340, height: id === "histogram" ? 226 : id === "scatter" ? 280 : 109 };
    wrapper.getBoundingClientRect = () => ({ ...wrapper.bounds });
    wrapper.append(canvas);
    canvas.context = canvasContext();
    canvas.getContext = (kind) => { assert.equal(kind, "2d"); return canvas.context; };
    canvas.bitmapWrites = 0;
    for (const [property, initial] of [["width", 300], ["height", 150]]) {
      let size = initial;
      Object.defineProperty(canvas, property, {
        get: () => size,
        set: (value) => {
          assert.ok(Number.isInteger(value) && value > 0, `Invalid canvas ${property}: ${value}`);
          size = value;
          canvas.bitmapWrites += 1;
          canvas.context.reset();
        }
      });
    }
    return canvas;
  });

  const pending = new Map();
  let time = 0;
  let nextId = 0;
  const tick = (milliseconds = 34) => {
    time += milliseconds;
    for (const id of [...pending.keys()]) {
      const callback = pending.get(id);
      pending.delete(id);
      if (callback) callback(time);
    }
  };
  const window = new Target(registry, "window");
  window.devicePixelRatio = ratio;
  window.requestAnimationFrame = (callback) => { const id = ++nextId; pending.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => pending.delete(id);
  const media = new Target(registry, "motion preference");
  media.matches = reducedMotion;
  if (legacyMedia) {
    media.addEventListener = undefined;
    media.addListener = (callback) => Target.prototype.addEventListener.call(media, "change", callback);
  }
  window.matchMedia = (query) => { assert.equal(query, "(prefers-reduced-motion: reduce)"); return media; };
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    fire() { this.callback([...this.targets].map((target) => ({ target }))); }
  }
  const context = vm.createContext({ document, window, performance: { now: () => time }, ...(resizeObserver ? { ResizeObserver: Observer } : {}) });
  engine.runInContext(context, { timeout: 10000 });
  controller.runInContext(context, { timeout: 10000 });
  assert.equal(get("load-error").hidden, true, get("load-error").textContent);
  for (const observer of observers) observer.fire();
  tick(0);

  return {
    get, document, window, media, observers, canvases, pending, tick, api: context.ClankSeedLab,
    count: () => Number(get("samples-shown").dataset.count),
    click: (id) => get(id).click(),
    type: (text) => { get("seed-input").value = text; get("seed-input").emit("input", { bubbles: true }); },
    submit(text) {
      if (text !== undefined) this.type(text);
      assert.equal(get("seed-form").emit("submit").defaultPrevented, true);
    },
    toggle: (flag) => get(`equation-${flag}`).click(),
    mask: () => [1, 2, 4].reduce((mask, flag) => mask | (get(`equation-${flag}`).checked ? flag : 0), 0),
    listeners: () => registry.filter((target) => target.registrations).map((target) => [target.id || target.name, target.registrations, [...target.listeners].map(([type, callbacks]) => [type, callbacks.size])]),
    plots: () => canvases.map((canvas) => [canvas.width, canvas.height, canvas.context.commands]),
    snapshot() {
      return JSON.stringify([this.count(), this.mask(), metricIds.map((id) => get(id).textContent), get("latest-output").textContent, get("applied-seed").textContent, get("pipeline-stages").textContent, this.plots()]);
    }
  };
}

function expectStream(app, seed, mask, count) {
  const result = app.api.generate(seed, mask, count);
  const summary = app.api.summarize(result.values);
  assert.equal(app.count(), count);
  assert.equal(app.get("sample-progress").value, count);
  assert.equal(app.get("latest-output").textContent, app.api.hex64(result.values[count - 1]));
  assert.equal(app.get("applied-seed").textContent, app.api.hex64(seed));
  assert.equal(app.get("metric-mean").textContent, summary.mean.toFixed(6));
  assert.equal(app.get("metric-ones").textContent, `${(summary.onesFraction * 100).toFixed(2)}%`);
  assert.equal(app.get("metric-repeats").textContent, summary.repeatedValues.toLocaleString("en-US"));
  if (summary.correlation === null) assert.equal(app.get("metric-correlation").textContent, "—");
  else assert.ok(Math.abs(Number(app.get("metric-correlation").textContent) - summary.correlation) <= 0.000051, "Displayed correlation agrees with whole-prefix summary");
  const cards = app.get("pipeline-stages").children;
  assert.equal(cards.length, 5);
  assert.equal(cards[0].querySelectorAll(".seed-value")[0].textContent, app.api.hex64(seed));
  result.stages.forEach((stage, index) => {
    assert.equal(cards[index + 1].dataset.enabled, String(stage.enabled));
    assert.deepEqual(cards[index + 1].querySelectorAll(".seed-value").map((node) => node.textContent), [app.api.hex64(stage.before), app.api.hex64(stage.after)]);
    assert.match(cards[index + 1].textContent, new RegExp(`${stage.bitChanges} / 64 bits changed`));
  });
  assert.equal(cards[4].querySelectorAll(".seed-value")[0].textContent, app.api.hex64(result.effectiveSeed));
  for (const canvas of app.canvases) assert.equal(canvas.context.stack.length, 0);
}

function expectPaused(app) {
  assert.equal(app.get("play-pause").getAttribute("aria-pressed"), "false");
  assert.equal(app.pending.size, 0, "No recurring frame remains while paused");
}

test("local script wiring initializes 256 real outputs with all experiments off and no animation loop", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)];
  assert.deepEqual(scripts.map((match) => match[1]), ["seed_lab.js", "seed_visualizer.js"]);
  for (const [tag] of scripts) assert.match(tag, /\bdefer\b/);
  const app = boot();
  assert.equal(app.get("seed-input").type, "text");
  assert.equal(app.get("seed-input").getAttribute("maxlength"), null, "Pasted digits must not be silently truncated by the input");
  assert.equal(app.get("seed-input").value, "0x0123456789abcdef");
  assert.equal(app.get("seed-input").disabled, false);
  assert.equal(app.get("experiment-toggles").querySelectorAll("input").length, 3);
  assert.equal(app.mask(), 0);
  for (const flag of [1, 2, 4]) {
    const toggle = app.get(`equation-${flag}`);
    assert.equal(toggle.type, "checkbox");
    assert.equal(toggle.getAttribute("role"), "switch");
    assert.ok(app.get(toggle.getAttribute("aria-labelledby")).textContent);
  }
  expectStream(app, DEFAULT_SEED, 0, 256);
  expectPaused(app);
  for (const canvas of app.canvases) assert.ok(canvas.context.draws > 0, `${canvas.id} draws immediately`);
  const before = app.snapshot();
  app.tick(1000);
  assert.equal(app.snapshot(), before);
});

test("exact decimal/hex submissions never round 64-bit seeds or rewrite the input text", () => {
  const app = boot();
  for (const text of [MAX_SEED_TEXT, "0xffffffffffffffff", "9007199254740993", "0x0000000000000001"]) {
    app.submit(text);
    assert.equal(app.get("seed-input").value, text);
    assert.equal(app.get("seed-input").getAttribute("aria-invalid"), null);
    assert.equal(app.get("seed-error").hidden, true);
    assert.equal(app.get("seed-draft-note").hidden, true);
    expectStream(app, BigInt(text), 0, 256);
  }
});

test("invalid drafts pause and preserve plots, seed, metrics, and toggles with an accessible error", () => {
  const app = boot();
  app.toggle(1);
  app.click("play-pause");
  app.tick();
  const before = app.snapshot();
  for (const text of ["", "-1", "18446744073709551616", "0x10000000000000000", "9".repeat(512), "1.5", "1e3", "0xzz"]) {
    app.type(text);
    assert.equal(app.get("seed-draft-note").hidden, false);
    app.submit();
    assert.equal(app.get("seed-input").value, text);
    assert.equal(app.get("seed-input").getAttribute("aria-invalid"), "true");
    assert.equal(app.get("seed-error").getAttribute("role"), "alert");
    assert.equal(app.get("seed-error").hidden, false);
    assert.ok(app.get("seed-error").textContent.length > 20);
    assert.match(app.get("seed-input").getAttribute("aria-describedby"), /seed-error/);
    assert.equal(app.snapshot(), before);
    app.toggle(2);
    assert.equal(app.mask(), 1, "An invalid draft must roll back attempted switch changes");
    assert.equal(app.snapshot(), before);
    expectPaused(app);
    app.tick(1000);
    assert.equal(app.snapshot(), before);
  }
  app.submit(MAX_SEED_TEXT);
  assert.equal(app.get("seed-error").hidden, true);
  assert.equal(app.get("seed-input").getAttribute("aria-invalid"), null);
  expectStream(app, BigInt(MAX_SEED_TEXT), 1, 256);
});

test("all eight switch masks follow the real pipeline and returning all off restores the original drawing", () => {
  const app = boot();
  const original = app.snapshot();
  for (const mask of [1, 3, 2, 6, 7, 5, 4, 0]) {
    app.click("step");
    for (const flag of [1, 2, 4]) if (Boolean(app.mask() & flag) !== Boolean(mask & flag)) app.toggle(flag);
    assert.equal(app.mask(), mask);
    for (const flag of [1, 2, 4]) assert.equal(app.get(`equation-${flag}`).closest("label").classList.contains("is-enabled"), Boolean(mask & flag));
    expectStream(app, DEFAULT_SEED, mask, 256);
    expectPaused(app);
  }
  assert.equal(app.snapshot(), original);
  app.submit("0");
  app.toggle(4);
  assert.match(app.get("comparison-note").textContent, /unchanged.*match exactly/);
  const zeroOutput = app.get("latest-output").textContent;
  const zeroRaster = JSON.stringify(app.get("selected-raster").context.commands);
  app.submit(MAX_SEED_TEXT);
  expectStream(app, BigInt(MAX_SEED_TEXT), 4, 256);
  assert.equal(app.get("latest-output").textContent, zeroOutput);
  assert.equal(JSON.stringify(app.get("selected-raster").context.commands), zeroRaster, "Known merged seeds display the same selected stream without a uniqueness claim");
});

test("step/replay and replay during playback deterministically restore the same prefix and statistics", () => {
  const app = boot();
  for (const flag of [1, 2, 4]) app.toggle(flag);
  const initial = app.snapshot();
  app.click("step");
  expectStream(app, DEFAULT_SEED, 7, 384);
  const stepped = app.snapshot();
  app.click("replay");
  assert.equal(app.snapshot(), initial);
  app.click("step");
  assert.equal(app.snapshot(), stepped);
  app.click("play-pause");
  app.tick();
  assert.equal(app.count(), 400);
  app.click("replay");
  expectPaused(app);
  assert.equal(app.snapshot(), initial);
  app.tick(1000);
  assert.equal(app.snapshot(), initial);
});

test("play throttles updates, pauses cleanly, stops at 4096, and cancels stale frames on settings changes", () => {
  const app = boot();
  app.click("play-pause");
  const playingAnnouncement = app.get("announcer").textContent;
  const before = app.snapshot();
  app.tick(16);
  assert.equal(app.count(), 256);
  assert.equal(app.snapshot(), before);
  app.tick(18);
  expectStream(app, DEFAULT_SEED, 0, 272);
  assert.equal(app.get("announcer").textContent, playingAnnouncement, "Animation frames do not announce metrics");
  app.click("play-pause");
  expectPaused(app);
  app.tick(1000);
  assert.equal(app.count(), 272);
  app.click("play-pause");
  let frames = 0;
  while (app.count() < 4096 && frames++ < 250) app.tick();
  expectStream(app, DEFAULT_SEED, 0, 4096);
  expectPaused(app);
  assert.equal(app.get("play-pause").disabled, true);
  assert.equal(app.get("step").disabled, true);
  assert.equal(app.get("replay").disabled, false);
  assert.equal(app.get("play-label").textContent, "Complete");
  assert.match(app.get("announcer").textContent, /Batch complete/);
  app.click("step");
  app.tick(1000);
  assert.equal(app.count(), 4096);
  app.click("replay");
  app.click("play-pause");
  app.submit(MAX_SEED_TEXT);
  expectPaused(app);
  app.tick(1000);
  expectStream(app, BigInt(MAX_SEED_TEXT), 0, 256);
  app.click("play-pause");
  app.toggle(2);
  expectPaused(app);
  app.tick(1000);
  expectStream(app, BigInt(MAX_SEED_TEXT), 2, 256);
});

test("reduced motion and hidden tabs pause without automatic resume; explicit Play and Step still work", () => {
  const app = boot({ reducedMotion: true });
  expectPaused(app);
  assert.equal(app.get("motion-note").hidden, false);
  app.click("step");
  assert.equal(app.count(), 384);
  app.click("play-pause");
  app.tick();
  assert.equal(app.count(), 400, "Explicit Play remains available with reduced motion");
  app.media.matches = false;
  app.media.emit("change");
  assert.equal(app.get("motion-note").hidden, true);
  app.media.matches = true;
  app.media.emit("change");
  expectPaused(app);
  assert.match(app.get("playback-status").textContent, /reduced motion/);
  app.click("play-pause");
  app.window.emit("resize");
  app.document.hidden = true;
  app.document.emit("visibilitychange");
  expectPaused(app);
  const hidden = app.snapshot();
  app.tick(1000);
  app.click("play-pause");
  expectPaused(app);
  assert.equal(app.snapshot(), hidden);
  app.document.hidden = false;
  app.document.emit("visibilitychange");
  assert.equal(app.pending.size, 1, "Visibility restoration requests a single redraw");
  app.tick();
  expectPaused(app);
  assert.equal(app.count(), 400);
  app.click("play-pause");
  app.tick();
  app.window.emit("pagehide");
  expectPaused(app);
  assert.equal(app.count(), 416);
});

test("canvas resizing uses finite DPR-scaled dimensions, coalesces events, and observes wrappers", () => {
  const app = boot({ ratio: 1.25 });
  assert.equal(app.observers.length, 1);
  assert.deepEqual([...app.observers[0].targets], app.canvases.map((canvas) => canvas.parentElement));
  for (const canvas of app.canvases) {
    assert.equal(canvas.width, Math.round(canvas.parentElement.bounds.width * 1.25));
    assert.equal(canvas.height, Math.round(canvas.parentElement.bounds.height * 1.25));
  }
  const writes = app.canvases.map((canvas) => canvas.bitmapWrites);
  for (let index = 0; index < 5; index += 1) app.observers[0].fire();
  assert.equal(app.pending.size, 1);
  app.tick();
  assert.deepEqual(app.canvases.map((canvas) => canvas.bitmapWrites), writes, "Unchanged sizes do not reset canvas bitmaps");
  app.window.devicePixelRatio = 2.5;
  for (const canvas of app.canvases) canvas.parentElement.bounds = { width: 247.5, height: 109.25 };
  app.observers[0].fire();
  app.tick();
  for (const canvas of app.canvases) {
    assert.equal(canvas.width, 619);
    assert.equal(canvas.height, 273);
    assert.equal(canvas.context.stack.length, 0);
  }
  for (const canvas of app.canvases) canvas.parentElement.bounds = { width: 0, height: 0 };
  app.window.emit("resize");
  app.tick();
  expectPaused(app);
  expectStream(app, DEFAULT_SEED, 0, 256);
  for (const canvas of app.canvases) canvas.parentElement.bounds = { width: 320, height: 128 };
  app.window.emit("resize");
  app.tick();
  expectPaused(app);
});

test("settings changes never accumulate listeners, including legacy media and window-resize fallback", () => {
  const app = boot({ resizeObserver: false, legacyMedia: true });
  const listeners = app.listeners();
  for (let index = 0; index < 6; index += 1) {
    app.submit(String(index));
    for (const flag of [1, 2, 4]) app.toggle(flag);
    app.click("step");
    app.click("replay");
  }
  assert.deepEqual(app.listeners(), listeners);
  app.click("step");
  assert.equal(app.count(), 384, "A click must not trigger duplicate handlers");
  for (let index = 0; index < 5; index += 1) app.window.emit("resize");
  assert.equal(app.pending.size, 1);
  app.tick();
  expectPaused(app);
  app.click("play-pause");
  app.media.matches = true;
  app.media.emit("change");
  expectPaused(app);
  assert.equal(app.get("motion-note").hidden, false);
  assert.deepEqual(app.listeners(), listeners);
});
