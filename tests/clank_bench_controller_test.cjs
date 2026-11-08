"use strict";

// Runs the real scripts with a bounded DOM/canvas/clock model, not a browser.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const examples = path.join(__dirname, "../examples");
const html = readFileSync(path.join(examples, "clank_bench.html"), "utf8");
const scripts = ["seed_lab.js", "chain_seed.js", "clank_bench_model.js", "clank_bench.js"].map(name =>
    new vm.Script(readFileSync(path.join(examples, name), "utf8"), { filename: name }));

class Element {
    constructor(tag = "div") {
        this.tag = tag;
        this.children = [];
        this.attributes = new Map();
        this.listeners = new Map();
        this.value = "";
        this.hidden = false;
        this.disabled = false;
        this.text = "";
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (["id", "value"].includes(name)) this[name] = value;
        if (["hidden", "disabled"].includes(name)) this[name] = true;
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...children) {
        for (const child of children) {
            if (child.tag === "fragment") this.append(...child.children);
            else { child.parentElement = this; this.children.push(child); }
        }
    }
    replaceChildren(...children) { this.textContent = ""; this.append(...children); }
    remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(callback);
    }
    emit(type) {
        const event = { preventDefault() {} };
        for (const callback of this.listeners.get(type) || []) callback(event);
    }
    click() { if (!this.disabled) this.emit("click"); }
}

function boot() {
    const ids = new Map();
    const document = new Element("document");
    document.hidden = false;
    document.body = new Element("body");
    document.createElement = tag => new Element(tag);
    document.createDocumentFragment = () => new Element("fragment");
    document.getElementById = id => ids.get(id);
    document.querySelectorAll = () => [...ids.values()].filter(node => ["input", "button", "select"].includes(node.tag));
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
        const element = new Element(match[1]);
        for (const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
            element.setAttribute(attribute[1], attribute[2] || "");
        }
        ids.set(element.id, element);
    }
    const canvases = ["histogram", "scatter", "raster"].map(id => ids.get(id));
    for (const canvas of canvases) {
        canvas.parentElement = { getBoundingClientRect: () => ({ width: 330, height: 190 }) };
        canvas.draws = 0;
        const context = {};
        for (const method of ["setTransform", "clearRect", "fillRect", "setLineDash", "beginPath", "moveTo", "lineTo", "stroke"]) {
            context[method] = (...args) => {
                for (const value of args.flat()) if (typeof value === "number") assert.ok(Number.isFinite(value));
                ++canvas.draws;
            };
        }
        canvas.getContext = () => context;
    }
    const pending = new Map();
    let time = 0;
    let frameId = 0;
    const request = callback => { pending.set(++frameId, callback); return frameId; };
    const window = new Element("window");
    const media = new Element("media");
    media.matches = false;
    window.matchMedia = () => media;
    window.devicePixelRatio = 3;
    const blobs = [];
    const revoked = [];
    const timers = [];
    const context = vm.createContext({ document, window, structuredClone, Blob,
        requestAnimationFrame: request, cancelAnimationFrame: id => pending.delete(id),
        setTimeout: callback => timers.push(callback),
        URL: { createObjectURL(blob) { blobs.push(blob); return "blob:test"; }, revokeObjectURL: url => revoked.push(url) }
    });
    for (const script of scripts) script.runInContext(context, { timeout: 10000 });
    const get = id => ids.get(id);
    assert.equal(get("error").hidden, true, get("error").textContent);
    return {
        get, document, window, media, pending, canvases, blobs, revoked, timers,
        click: id => get(id).click(),
        tick(milliseconds = 34) {
            time += milliseconds;
            for (const id of [...pending.keys()]) {
                const callback = pending.get(id);
                pending.delete(id);
                if (callback) callback(time);
            }
        },
        submit(seed, bit = "0") {
            get("seed").value = seed;
            get("flip-bit").value = bit;
            get("seed-form").emit("submit");
        },
        count: id => Number(get(id).textContent.replace(/,/g, ""))
    };
}

test("offline page boots paused with real trace data and finite canvas coordinates", () => {
    const references = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(references, ["seed_lab.js", "chain_seed.js", "clank_bench_model.js", "clank_bench.js"]);
    assert.equal(/(?:src|href)="https?:/.test(html), false);
    const app = boot();
    assert.equal(app.count("raw-count"), 64);
    assert.equal(app.count("spins"), 0);
    assert.equal(app.pending.size, 0);
    assert.equal(app.get("lane-rows").children.length, 3);
    for (const canvas of app.canvases) {
        assert.ok(canvas.draws > 0);
        assert.equal(canvas.width, 660, "Canvas DPR is capped at two");
    }
});

test("invalid seed/bit submission preserves the current session and reports accessible errors", () => {
    const app = boot();
    app.click("spin");
    const mapping = app.get("mapping-rows").textContent;
    const output = app.get("raw-output").textContent;
    app.click("raw-play");
    for (const seed of ["-1", "", "18446744073709551616"]) {
        app.submit(seed);
        assert.equal(app.get("error").hidden, false);
        assert.equal(app.get("seed").getAttribute("aria-invalid"), "true");
        assert.equal(app.get("mapping-rows").textContent, mapping);
        assert.equal(app.get("raw-output").textContent, output);
        assert.equal(app.pending.size, 0);
    }
    for (const bit of ["", "64", "1.5", "1e1", "-1"]) app.submit("0", bit);
    assert.equal(app.get("flip-bit").getAttribute("aria-invalid"), "true");
    app.submit("18446744073709551615", "63");
    assert.equal(app.get("error").hidden, true);
    assert.equal(app.get("applied-seed").textContent, "0xffffffffffffffff");
    assert.equal(app.get("flipped-seed").textContent, "0x7fffffffffffffff");
    assert.equal(app.count("spins"), 0);
});

test("stepping, exact replay, hidden tabs and motion changes control actual scheduled work", () => {
    const app = boot();
    app.click("raw-next"); assert.equal(app.count("raw-count"), 65);
    app.click("raw-step"); assert.equal(app.count("raw-count"), 193);
    app.click("spin"); const mapping = app.get("mapping-rows").textContent;
    app.click("reset"); app.click("spin");
    assert.equal(app.get("mapping-rows").textContent, mapping);
    app.click("raw-play");
    app.tick(1); assert.equal(app.count("raw-count"), 64);
    app.tick(34); assert.equal(app.count("raw-count"), 80);
    app.click("raw-play"); assert.equal(app.pending.size, 0);
    app.click("raw-play"); app.click("batch");
    app.document.hidden = true; app.document.emit("visibilitychange");
    assert.equal(app.pending.size, 0);
    assert.equal(app.get("raw-play").getAttribute("aria-pressed"), "false");
    app.document.hidden = false; app.document.emit("visibilitychange");
    assert.equal(app.pending.size, 0);
    app.click("raw-play");
    app.media.matches = true; app.media.emit("change");
    assert.equal(app.pending.size, 0);
    app.click("raw-play"); assert.equal(app.pending.size, 1, "Explicit play works with reduced motion");
    app.click("raw-next"); assert.equal(app.pending.size, 0);
});

test("reel batching is bounded, pausable, replayable and independent of raw draws", () => {
    const app = boot();
    app.click("batch"); assert.equal(app.get("spin").disabled, true);
    app.tick(); assert.equal(app.count("spins"), 128);
    app.click("batch-stop"); assert.equal(app.pending.size, 0);
    app.tick(); assert.equal(app.count("spins"), 128);
    app.click("batch");
    for (let index = 0; index < 80; ++index) app.tick();
    assert.equal(app.count("spins"), 10128);
    assert.equal(app.count("raw-count"), 64);
    assert.equal(app.pending.size, 0);
    assert.equal(app.get("batch").disabled, false);
    assert.match(app.get("uncertainty").textContent, /10,128 spins/);
    app.click("raw-play");
    for (let index = 0; index < 260; ++index) app.tick();
    assert.equal(app.count("raw-count"), 4096);
    assert.equal(app.get("raw-play").disabled, true);
    assert.equal(app.get("raw-status").textContent, "Batch complete");
    assert.equal(app.pending.size, 0);
});

test("report export serializes exact words and settings without consuming a draw", async () => {
    const app = boot();
    app.submit("18446744073709551615", "63");
    app.click("spin");
    const output = app.get("raw-output").textContent;
    app.click("export");
    assert.equal(app.blobs.length, 1);
    const report = JSON.parse(await app.blobs[0].text());
    assert.equal(report.seed, "0xffffffffffffffff");
    assert.equal(report.flipBit, 63);
    assert.equal(report.raw.count, 64);
    assert.equal(report.reels.spins, 1);
    assert.equal(report.raw.trace.output, output);
    assert.equal(report.theoretical.totalPayout, 204);
    assert.equal(app.get("raw-output").textContent, output);
    for (const callback of app.timers) callback();
    assert.deepEqual(app.revoked, ["blob:test"]);
});

test("Chain selection, canonical generation, draft preservation and exact report replay work through the page", async () => {
    const app = boot();
    assert.equal(app.get("generation").disabled, true);
    app.get("mode").value = "chain-seed-v2";
    app.get("mode").emit("change");
    assert.equal(app.get("generation").disabled, false);
    assert.equal(app.get("draft").hidden, false);
    app.get("generation").value = "ffffffffffffffff";
    app.get("chain-mask").value = "7";
    app.submit("18446744073709551615", "63");
    assert.match(app.get("preprocessing-summary").textContent, /Chain v2/);
    app.click("spin");
    const output = app.get("raw-output").textContent;
    const mapping = app.get("mapping-rows").textContent;
    app.get("generation").value = "FFFFFFFFFFFFFFFF";
    app.get("generation").emit("input");
    app.submit("0", "0");
    assert.equal(app.get("generation").getAttribute("aria-invalid"), "true");
    assert.equal(app.get("raw-output").textContent, output);
    assert.equal(app.get("mapping-rows").textContent, mapping);
    app.click("reset");
    assert.equal(app.get("generation").value, "ffffffffffffffff");
    assert.equal(app.get("seed").value, "18446744073709551615");
    assert.equal(app.get("error").hidden, true);
    assert.equal(app.get("raw-output").textContent, output);
    app.click("spin");
    assert.equal(app.get("mapping-rows").textContent, mapping);
    app.click("export");
    const report = JSON.parse(await app.blobs[0].text());
    assert.equal(report.preprocessing.mode, "chain-seed-v2");
    assert.equal(report.preprocessing.generation, "ffffffffffffffff");
    assert.equal(report.preprocessing.mask, 7);
    assert.equal(report.format, "clank-bench-report-v2");
    assert.match(report.preprocessing.effectiveSeed, /^0x[0-9a-f]{16}$/);
    app.get("mode").value = report.preprocessing.mode;
    app.get("generation").value = report.preprocessing.generation;
    app.get("chain-mask").value = String(report.preprocessing.mask);
    app.submit(report.seed, String(report.flipBit));
    assert.equal(app.get("error").hidden, true, "Exported settings paste directly into the controls");
    assert.equal(app.count("spins"), 0);
    assert.equal(app.get("raw-output").textContent, output);
    app.click("spin");
    assert.equal(app.get("mapping-rows").textContent, mapping);
    app.get("generation").value = "invalid";
    app.get("mode").value = "raw";
    app.get("mode").emit("change");
    app.submit("1");
    assert.equal(app.get("error").hidden, true, "Disabled Chain fields cannot block original mode");
    assert.equal(app.get("draft").hidden, true);
    assert.match(app.get("preprocessing-summary").textContent, /Original TriFlow/);
});

test("hiding the page cancels a pending resize and both activity loops", () => {
    const app = boot();
    app.window.emit("resize");
    app.click("raw-play");
    app.click("batch");
    assert.equal(app.pending.size, 2);
    app.document.hidden = true;
    app.document.emit("visibilitychange");
    assert.equal(app.pending.size, 0);
    app.document.hidden = false;
    app.document.emit("visibilitychange");
    app.window.emit("resize");
    assert.equal(app.pending.size, 1);
    app.tick();
    assert.equal(app.pending.size, 0);
});
