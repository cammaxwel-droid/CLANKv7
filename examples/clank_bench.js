(() => {
    "use strict";
    const byId = id => document.getElementById(id);
    const lab = globalThis.ClankSeedLab;
    const bench = globalThis.ClankBench;
    const chain = globalThis.ClankChainSeed;
    const format = new Intl.NumberFormat("en-AU");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hex = value => lab.hex64(value);
    const percent = value => (value * 100).toFixed(4) + "%";
    let current;
    let appliedSeed;
    let appliedBit = 0;
    let appliedSettings;
    let rawPlaying = false;
    let spinsRemaining = 0;
    let frameId = 0;
    let lastFrame = 0;
    let resizeId = 0;

    function node(tag, text, className) {
        const result = document.createElement(tag);
        if (text !== undefined) result.textContent = text;
        if (className) result.className = className;
        return result;
    }

    function tableRows(target, rows) {
        const fragment = document.createDocumentFragment();
        for (const cells of rows) {
            const row = node("tr");
            for (const value of cells) row.append(node("td", value));
            fragment.append(row);
        }
        byId(target).replaceChildren(fragment);
    }

    function stop() {
        rawPlaying = false;
        spinsRemaining = 0;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        if (resizeId) cancelAnimationFrame(resizeId);
        resizeId = 0;
        lastFrame = 0;
    }

    function showError(error) {
        stop();
        byId("error").textContent = error.message || String(error);
        byId("error").hidden = false;
        if (current) render(false);
    }

    function guarded(action) {
        return event => {
            try { action(event); } catch (error) { showError(error); }
        };
    }

    function draft() {
        byId("generation").disabled = byId("mode").value === "raw";
        byId("chain-mask").disabled = byId("mode").value === "raw";
        byId("draft").hidden = byId("seed").value === appliedSeed && byId("flip-bit").value === String(appliedBit)
            && byId("mode").value === appliedSettings.mode
            && (appliedSettings.mode === "raw" ||
                (byId("generation").value === appliedSettings.generation.toString(16).padStart(16, "0")
                 && byId("chain-mask").value === String(appliedSettings.mask)));
    }

    function readSettings() {
        // Disabled Chain fields do not block applying an original-stream seed.
        if (byId("mode").value === "raw") return { mode: "raw", generation: 0n, mask: 0 };
        let generation;
        try { generation = chain.parseGeneration(byId("generation").value); }
        catch (error) { byId("generation").setAttribute("aria-invalid", "true"); throw error; }
        const maskText = byId("chain-mask").value;
        if (!/^[0-7]$/.test(maskText)) throw new RangeError("Choose a Chain stage combination from the list.");
        return { mode: byId("mode").value, generation, mask: Number(maskText) };
    }

    function reset(seedText, bit, settings) {
        // Prepare and validate before replacing the current session.
        const candidate = bench.session(lab.parseSeed(seedText), bit, settings);
        candidate.advance(64);
        stop();
        current = candidate;
        appliedSeed = seedText;
        appliedBit = bit;
        appliedSettings = { ...settings };
        byId("seed").removeAttribute("aria-invalid");
        byId("flip-bit").removeAttribute("aria-invalid");
        byId("generation").removeAttribute("aria-invalid");
        byId("error").hidden = true;
        draft();
        render(true);
    }

    function renderTrace(state) {
        const trace = state.raw.trace;
        byId("raw-output").textContent = hex(trace.output);
        tableRows("lane-rows", ["a", "b", "c"].map(lane => [
            lane.toUpperCase(), hex(trace.before[lane]), hex(trace.after[lane]), hex(trace.mixed[lane])
        ]));
        byId("trace-mean").textContent = hex(trace.mean);
        byId("trace-braid").textContent = hex(trace.braid);
        byId("trace-counter").textContent = hex(trace.after.calls);
    }

    function renderReels(state) {
        const result = state.reels;
        const last = result.last;
        const cards = document.createDocumentFragment();
        for (let reel = 0; reel < 3; ++reel) {
            const card = node("div", undefined, "reel-card");
            card.append(node("p", `REEL ${reel + 1}`), node("div", last ? last.symbols[reel] : "—", "symbol"),
                node("p", last ? `Stop ${last.samples[reel].stop} of 0–5` : "Waiting for a spin"));
            cards.append(card);
        }
        byId("reel-cards").replaceChildren(cards);
        tableRows("mapping-rows", last ? last.samples.map((sample, reel) => [
            `Reel ${reel + 1}`, hex(sample.threshold),
            sample.rejected ? sample.rejectedWords.map(hex).join(", ") +
                (sample.omittedRejections ? ` (+${sample.omittedRejections} more)` : "") : "0",
            hex(sample.word), `${sample.stop} → ${last.symbols[reel]}`
        ]) : [["—", "—", "—", "—", "—"]]);
        byId("round-summary").textContent = last
            ? `Spin ${format.format(last.round)} · ${last.symbols.join(" / ")} · gross payout ${last.gross} · stake 1 · net ${last.gross - 1}`
            : "Simulate a spin to inspect the mapping.";
        byId("spins").textContent = format.format(result.spins);
        byId("reel-draws").textContent = `${format.format(result.draws)} raw words · ${format.format(result.rejected)} rejected`;
        byId("return").textContent = result.spins ? percent(result.gross / result.spins) : "—";
        byId("hit-rate").textContent = result.spins ? percent(result.hits / result.spins) : "—";
        byId("net").textContent = result.spins ? format.format(result.gross - result.spins) : "—";
        const theory = state.theoretical;
        tableRows("payout-rows", [0, 4, 8, 32].map(award => [
            ({ 0: "Other", 4: "AAA", 8: "BBB", 32: "CCC" })[award], award,
            `${theory.payouts[award]} / 216`, format.format(result.payouts[award]),
            (result.spins * theory.payouts[award] / 216).toFixed(2)
        ]));
        const mean = theory.totalPayout / theory.combinations;
        const secondMoment = [0, 4, 8, 32].reduce((total, award) => total + award * award * theory.payouts[award], 0) / 216;
        const margin = result.spins ? 1.96 * Math.sqrt((secondMoment - mean * mean) / result.spins) : 0;
        byId("uncertainty").textContent = result.spins
            ? `At ${format.format(result.spins)} spins, the ideal model's approximate 95% reference band for measured gross return is ${percent(Math.max(0, mean - margin))} to ${percent(Math.min(32, mean + margin))}. This sample is ${percent(result.gross / result.spins)}.`
            : "Run a sample to see the theoretical model's reference band.";
    }

    function surface(id) {
        const canvas = byId(id);
        const rect = canvas.parentElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("This browser cannot create a 2D canvas.");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        return { ctx, width: rect.width, height: rect.height };
    }

    function drawPlots(state) {
        if (document.hidden) return;
        const histogram = surface("histogram");
        if (histogram) {
            const { ctx, width, height } = histogram;
            const peak = Math.max(...state.raw.histogram, 1) * 1.12;
            const column = width / 32;
            ctx.fillStyle = "#7ae8c2";
            state.raw.histogram.forEach((count, index) => {
                const barHeight = count / peak * (height - 15);
                ctx.fillRect(index * column + 1, height - barHeight, Math.max(1, column - 2), barHeight);
            });
            const expected = state.raw.count / 32 / peak * (height - 15);
            ctx.strokeStyle = "#f6c17b";
            ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(0, height - expected); ctx.lineTo(width, height - expected); ctx.stroke();
            ctx.setLineDash([]);
        }
        const tail = state.raw.tail;
        const scatter = surface("scatter");
        if (scatter) {
            const { ctx, width, height } = scatter;
            ctx.strokeStyle = "#26374b";
            for (let tick = 0; tick <= 4; ++tick) {
                const x = tick * (width - 16) / 4 + 8;
                const y = tick * (height - 16) / 4 + 8;
                ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, height - 8);
                ctx.moveTo(8, y); ctx.lineTo(width - 8, y); ctx.stroke();
            }
            ctx.fillStyle = "#b6a3ff";
            for (let index = 1; index < tail.length; ++index) {
                const x = Number(tail[index - 1] >> 32n) / 4294967296;
                const y = Number(tail[index] >> 32n) / 4294967296;
                ctx.fillRect(8 + x * (width - 16), 8 + (1 - y) * (height - 16), 2, 2);
            }
        }
        const raster = surface("raster");
        if (raster) {
            const { ctx, width, height } = raster;
            const rows = tail.slice(-64);
            ctx.fillStyle = "#08121d"; ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "#7ae8c2";
            rows.forEach((word, row) => {
                const bits = word.toString(2).padStart(64, "0");
                for (let column = 0; column < 64; ++column) {
                    if (bits[column] === "1") ctx.fillRect(column * width / 64, row * height / rows.length,
                        width / 64, height / rows.length);
                }
            });
        }
        const peak = Math.max(...state.raw.histogram);
        byId("hist-summary").textContent = `${format.format(state.raw.count)} outputs · bins 0–31, left to right · largest bin ${peak}. Amber line marks n / 32.`;
        byId("scatter-summary").textContent = `${tail.length - 1} overlapping adjacent pairs from the latest ${tail.length} words. x = previous, y = next, each high32 / 2³² in [0, 1).`;
        byId("raster-summary").textContent = `Latest ${Math.min(64, tail.length)} words. Bit 63 at left, bit 0 at right. Bright = 1. These are output bits.`;
    }

    function render(plots) {
        const state = current.snapshot();
        byId("applied-seed").textContent = state.seed;
        byId("flipped-seed").textContent = state.flippedSeed;
        byId("preprocessing-summary").textContent = state.preprocessing.mode === "raw"
            ? "Original TriFlow. The original seed directly initializes the engine."
            : `Chain v2 · generation ${state.preprocessing.generation} · stage mask ${state.preprocessing.mask} · effective seed ${state.preprocessing.effectiveSeed} · flipped effective seed ${state.preprocessing.effectiveFlippedSeed}.`;
        byId("raw-count").textContent = format.format(state.raw.count);
        const ones = state.raw.bitCounts.reduce((sum, value) => sum + value, 0);
        byId("ones").textContent = percent(ones / (64 * state.raw.count));
        byId("avalanche").textContent = state.raw.meanChangedBits.toFixed(2);
        byId("repeats").textContent = format.format(state.raw.repeated);
        byId("raw-play").textContent = rawPlaying ? "Pause stream" : "Play stream";
        byId("raw-play").setAttribute("aria-pressed", String(rawPlaying));
        byId("raw-status").textContent = rawPlaying ? "Playing" : state.raw.count === bench.MAX_RAW ? "Batch complete" : "Paused";
        for (const id of ["raw-play", "raw-next", "raw-step"]) byId(id).disabled = state.raw.count >= bench.MAX_RAW;
        const busy = spinsRemaining > 0;
        byId("spin").disabled = busy || state.reels.spins >= bench.MAX_SPINS;
        byId("batch").disabled = busy || state.reels.spins >= bench.MAX_SPINS;
        byId("batch-stop").disabled = !busy;
        byId("spin-status").textContent = busy ? `${format.format(spinsRemaining)} spins left in batch`
            : state.reels.spins >= bench.MAX_SPINS ? "Session limit reached" : "Ready";
        renderTrace(state);
        renderReels(state);
        if (plots) drawPlots(state);
    }

    function schedule() {
        if (!rawPlaying && !spinsRemaining && frameId) {
            cancelAnimationFrame(frameId);
            frameId = 0;
        }
        if (!frameId && (rawPlaying || spinsRemaining > 0) && !document.hidden) {
            frameId = requestAnimationFrame(frame);
        }
    }

    function frame(time) {
        frameId = 0;
        try {
            if (document.hidden) { stop(); render(false); return; }
            if (time - lastFrame >= 1000 / 30) {
                lastFrame = time;
                const plots = rawPlaying;
                if (rawPlaying) {
                    current.advance(16);
                    rawPlaying = current.snapshot().raw.count < bench.MAX_RAW;
                }
                if (spinsRemaining) {
                    const done = current.spin(Math.min(128, spinsRemaining));
                    spinsRemaining -= done;
                    if (!done) spinsRemaining = 0;
                }
                render(plots);
            }
            schedule();
        } catch (error) { showError(error); }
    }

    function exportReport() {
        const state = current.snapshot();
        const report = JSON.stringify(state, (_, value) => typeof value === "bigint" ? hex(value) : value, 2);
        const url = URL.createObjectURL(new Blob([report + "\n"], { type: "application/json" }));
        const link = node("a");
        link.href = url;
        link.download = `clank-bench-${state.seed.slice(2)}-raw${state.raw.count}-spins${state.reels.spins}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    try {
        if (!lab || !bench || !chain) throw new Error("Keep seed_lab.js, chain_seed.js and the CLANK Bench scripts beside this HTML file.");
        reset(byId("seed").value, 0, readSettings());
        byId("seed-form").addEventListener("submit", guarded(event => {
            event.preventDefault();
            try { lab.parseSeed(byId("seed").value); }
            catch (error) { byId("seed").setAttribute("aria-invalid", "true"); throw error; }
            const text = byId("flip-bit").value;
            if (!/^\d{1,2}$/.test(text) || Number(text) > 63) {
                byId("flip-bit").setAttribute("aria-invalid", "true");
                throw new RangeError("Choose a seed bit from 0 through 63.");
            }
            reset(byId("seed").value, Number(text), readSettings());
        }));
        for (const id of ["seed", "flip-bit", "generation"]) byId(id).addEventListener("input", draft);
        for (const id of ["mode", "chain-mask"]) byId(id).addEventListener("change", draft);
        byId("reset").addEventListener("click", guarded(() => {
            byId("seed").value = appliedSeed;
            byId("flip-bit").value = String(appliedBit);
            byId("mode").value = appliedSettings.mode;
            byId("generation").value = appliedSettings.generation.toString(16).padStart(16, "0");
            byId("chain-mask").value = String(appliedSettings.mask);
            reset(appliedSeed, appliedBit, appliedSettings);
        }));
        byId("raw-next").addEventListener("click", guarded(() => { rawPlaying = false; current.advance(1); render(true); schedule(); }));
        byId("raw-step").addEventListener("click", guarded(() => { rawPlaying = false; current.advance(128); render(true); schedule(); }));
        byId("raw-play").addEventListener("click", guarded(() => { rawPlaying = !rawPlaying; render(false); schedule(); }));
        byId("spin").addEventListener("click", guarded(() => { current.spin(); render(false); }));
        byId("batch").addEventListener("click", guarded(() => {
            spinsRemaining = Math.min(10000, bench.MAX_SPINS - current.snapshot().reels.spins);
            render(false); schedule();
        }));
        byId("batch-stop").addEventListener("click", guarded(() => { spinsRemaining = 0; render(false); schedule(); }));
        byId("export").addEventListener("click", guarded(exportReport));
        const pauseAll = () => { stop(); render(false); };
        document.addEventListener("visibilitychange", guarded(() => {
            if (document.hidden) pauseAll();
            else drawPlots(current.snapshot());
        }));
        window.addEventListener("pagehide", pauseAll);
        const motionChanged = guarded(() => { if (motion.matches) pauseAll(); });
        motion.addEventListener("change", motionChanged);
        window.addEventListener("resize", guarded(() => {
            if (resizeId || document.hidden) return;
            resizeId = requestAnimationFrame(guarded(() => { resizeId = 0; drawPlots(current.snapshot()); }));
        }));
        const strips = document.createDocumentFragment();
        bench.REELS.forEach((strip, index) => strips.append(node("p", `Reel ${index + 1} · ${strip.join(" ")}`)));
        byId("strips").replaceChildren(strips);
    } catch (error) {
        showError(error);
        for (const control of document.querySelectorAll("input, button, select")) control.disabled = true;
    }
})();
