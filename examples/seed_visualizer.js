(() => {
  "use strict";

  const BATCH_SIZE = 4096;
  const INITIAL_VISIBLE = 256;
  const STEP_SIZE = 128;
  const OUTPUTS_PER_FRAME = 16;
  const FRAME_INTERVAL = 1000 / 30;
  const RASTER_ROWS = 64;
  const lab = globalThis.ClankSeedLab;
  const byId = (id) => document.getElementById(id);
  const numbers = new Intl.NumberFormat("en-US");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const colors = {
    mint: "#79edc5",
    amber: "#f5bd73",
    grid: "#293e50",
    labels: "#a2b5c5",
    zero: "#081420"
  };
  const dom = {
    form: byId("seed-form"),
    input: byId("seed-input"),
    apply: byId("apply-seed"),
    seedError: byId("seed-error"),
    draftNote: byId("seed-draft-note"),
    equations: byId("equation-controls"),
    toggles: byId("experiment-toggles"),
    play: byId("play-pause"),
    playIcon: byId("play-icon"),
    playLabel: byId("play-label"),
    step: byId("step"),
    replay: byId("replay"),
    shown: byId("samples-shown"),
    progress: byId("sample-progress"),
    status: byId("playback-status"),
    motionNote: byId("motion-note"),
    comparisonLabel: byId("comparison-label"),
    comparisonNote: byId("comparison-note"),
    appliedSeed: byId("applied-seed"),
    mean: byId("metric-mean"),
    ones: byId("metric-ones"),
    correlation: byId("metric-correlation"),
    repeats: byId("metric-repeats"),
    pairCount: byId("pair-count"),
    rasterRange: byId("raster-range"),
    histogramSummary: byId("histogram-summary"),
    scatterSummary: byId("scatter-summary"),
    rasterSummary: byId("raster-summary"),
    latestIndex: byId("latest-index"),
    latestOutput: byId("latest-output"),
    pipeline: byId("pipeline-stages"),
    loadError: byId("load-error"),
    announcer: byId("announcer")
  };

  let baseline = null;
  let selected = null;
  let activeMask = 0;
  let appliedSeedText = "";
  let shown = 0;
  let statistics = null;
  let baselineHistogram = Array(32).fill(0);
  let playing = false;
  let animationId = 0;
  let resizeId = 0;
  let lastFrameTime = 0;
  let pauseReason = "";
  let surfaces = null;
  let resizeObserver = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function announce(message) {
    // Only deliberate actions and completion are announced, never animation frames.
    dom.announcer.textContent = message;
  }

  function createToggleControls() {
    const fragment = document.createDocumentFragment();
    lab.EXPERIMENTS.forEach((experiment, index) => {
      const label = element("label", "experiment-card");
      const input = element("input", "experiment-toggle");
      const nameId = `experiment-name-${experiment.flag}`;
      const formulaId = `experiment-formula-${experiment.flag}`;
      const descriptionId = `experiment-description-${experiment.flag}`;
      input.type = "checkbox";
      input.id = `equation-${experiment.flag}`;
      input.name = "experiment";
      input.value = String(experiment.flag);
      input.dataset.flag = String(experiment.flag);
      input.checked = false;
      input.setAttribute("role", "switch");
      input.setAttribute("aria-labelledby", nameId);
      input.setAttribute("aria-describedby", `${formulaId} ${descriptionId}`);
      label.htmlFor = input.id;

      const top = element("span", "experiment-top");
      top.append(element("span", "experiment-number", `0${index + 1}`), input);
      const name = element("span", "experiment-name", experiment.name);
      name.id = nameId;
      const formula = element("code", "experiment-formula", experiment.formula);
      formula.id = formulaId;
      const description = element("span", "experiment-description", experiment.description);
      description.id = descriptionId;
      label.append(top, name, formula, description);
      fragment.append(label);
    });
    dom.toggles.replaceChildren(fragment);
  }

  function requestedMask() {
    let mask = 0;
    dom.toggles.querySelectorAll("input:checked").forEach((input) => {
      mask |= Number(input.dataset.flag);
    });
    return mask;
  }

  function synchronizeToggles() {
    dom.toggles.querySelectorAll("input").forEach((input) => {
      input.checked = (activeMask & Number(input.dataset.flag)) !== 0;
      input.closest("label").classList.toggle("is-enabled", input.checked);
    });
  }

  function clearSeedError() {
    dom.input.removeAttribute("aria-invalid");
    dom.seedError.textContent = "";
    dom.seedError.hidden = true;
  }

  function updateDraftNote() {
    dom.draftNote.hidden = !selected || dom.input.value === appliedSeedText;
  }

  function createStatistics() {
    return {
      histogram: Array(32).fill(0),
      meanTotal: 0,
      oneBits: 0,
      seen: new Set(),
      repeatedValues: 0,
      pairCount: 0,
      pairMeanX: 0,
      pairMeanY: 0,
      pairVarianceX: 0,
      pairVarianceY: 0,
      pairCovariance: 0
    };
  }

  function extendStatistics(stats, stream, start, end) {
    if (start >= end) return;
    // Summarize just the new chunk, rather than re-counting thousands of 64-bit words each frame.
    const chunk = lab.summarize(stream.values.slice(start, end));
    stats.meanTotal += chunk.mean * chunk.count;
    stats.oneBits += chunk.bitCounts.reduce((sum, count) => sum + count, 0);
    chunk.histogram.forEach((count, index) => {
      stats.histogram[index] += count;
    });

    for (let index = start; index < end; index += 1) {
      const value = stream.values[index];
      if (stats.seen.has(value)) stats.repeatedValues += 1;
      else stats.seen.add(value);
      if (index === 0) continue;

      // Online centered covariance includes the pair across chunk boundaries and avoids cancellation.
      const x = stream.scaled[index - 1];
      const y = stream.scaled[index];
      stats.pairCount += 1;
      const dx = x - stats.pairMeanX;
      const dy = y - stats.pairMeanY;
      stats.pairMeanX += dx / stats.pairCount;
      stats.pairMeanY += dy / stats.pairCount;
      stats.pairVarianceX += dx * (x - stats.pairMeanX);
      stats.pairVarianceY += dy * (y - stats.pairMeanY);
      stats.pairCovariance += dx * (y - stats.pairMeanY);
    }
  }

  function extendHistogram(histogram, scaled, start, end) {
    for (let index = start; index < end; index += 1) {
      histogram[Math.floor(scaled[index] * 32)] += 1;
    }
  }

  function adjacentCorrelation() {
    if (!statistics || statistics.pairCount < 2 || statistics.pairVarianceX <= 0 || statistics.pairVarianceY <= 0) return null;
    const correlation = statistics.pairCovariance / Math.sqrt(statistics.pairVarianceX * statistics.pairVarianceY);
    return Number.isFinite(correlation) ? Math.max(-1, Math.min(1, correlation)) : null;
  }

  function correlationText(value) {
    if (value === null) return "—";
    const rounded = Math.abs(value) < 0.00005 ? 0 : value;
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(4)}`;
  }

  function stopAnimation() {
    playing = false;
    if (animationId) window.cancelAnimationFrame(animationId);
    animationId = 0;
    lastFrameTime = 0;
  }

  function pausePlayback(reason = "", shouldAnnounce = true) {
    stopAnimation();
    pauseReason = reason;
    updatePlaybackUI();
    if (shouldAnnounce && selected) announce(reason || `Paused at ${numbers.format(shown)} outputs.`);
  }

  function applySettings(mask, shouldAnnounce = true) {
    let seed;
    try {
      // Keep the original input string: parsing and all 64-bit seed work belong to the seed engine.
      seed = lab.parseSeed(dom.input.value);
    } catch (error) {
      pausePlayback("Paused. Previous valid plots are unchanged.", false);
      synchronizeToggles();
      dom.input.setAttribute("aria-invalid", "true");
      dom.seedError.hidden = false;
      dom.seedError.textContent = `${error.message || "Enter an unsigned 64-bit decimal or hexadecimal seed."} Previous valid plots are unchanged; equation switches were kept at their applied settings.`;
      updateDraftNote();
      return false;
    }

    stopAnimation();
    try {
      const nextBaseline = baseline && baseline.seed === seed ? baseline : lab.generate(seed, 0, BATCH_SIZE);
      const nextSelected = mask === 0 ? nextBaseline : lab.generate(seed, mask, BATCH_SIZE);
      const nextStatistics = createStatistics();
      const nextHistogram = Array(32).fill(0);
      extendStatistics(nextStatistics, nextSelected, 0, INITIAL_VISIBLE);
      extendHistogram(nextHistogram, nextBaseline.scaled, 0, INITIAL_VISIBLE);

      baseline = nextBaseline;
      selected = nextSelected;
      statistics = nextStatistics;
      baselineHistogram = nextHistogram;
      activeMask = mask;
      appliedSeedText = dom.input.value;
      shown = INITIAL_VISIBLE;
      pauseReason = "";
      clearSeedError();
      updateDraftNote();
      synchronizeToggles();
      dom.loadError.hidden = true;
      dom.loadError.textContent = "";
      dom.appliedSeed.textContent = lab.hex64(seed);
      const enabledCount = lab.EXPERIMENTS.filter((experiment) => (mask & experiment.flag) !== 0).length;
      dom.comparisonLabel.textContent = enabledCount ? `${enabledCount} experiment${enabledCount === 1 ? "" : "s"} on` : "All experiments off";
      dom.comparisonLabel.classList.toggle("is-enabled", enabledCount > 0);
      if (mask === 0) {
        dom.comparisonNote.textContent = "All switches are off: original and selected streams match exactly.";
      } else if (selected.effectiveSeed === baseline.effectiveSeed) {
        dom.comparisonNote.textContent = "Experiments are on, but the effective seed is unchanged. These two streams still match exactly.";
      } else {
        dom.comparisonNote.textContent = "Compare selected transformations with the original seed. Different input seeds can merge; this is not a quality score.";
      }
      renderPipeline(seed, selected);
      render();
      if (shouldAnnounce) announce(`Settings applied. ${numbers.format(INITIAL_VISIBLE)} outputs shown, paused. ${enabledCount} seed experiments on.`);
      return true;
    } catch (error) {
      synchronizeToggles();
      dom.loadError.textContent = `The seed engine could not prepare this batch: ${error.message || "unknown error"}. Keep seed_lab.js next to this page and reload if needed.`;
      dom.loadError.hidden = false;
      updatePlaybackUI();
      return false;
    }
  }

  function endpointCard(step, title, seed, description) {
    const card = element("li", "panel pipeline-card is-endpoint");
    card.append(
      element("p", "pipeline-step", step),
      element("h3", "", title),
      element("code", "seed-value", lab.hex64(seed)),
      element("p", "help-text", description)
    );
    return card;
  }

  function renderPipeline(seed, stream) {
    const fragment = document.createDocumentFragment();
    fragment.append(endpointCard("INPUT", "Original seed", seed, "Canonical hex shown here; your input text stays exact."));
    stream.stages.forEach((stage, index) => {
      const card = element("li", `panel pipeline-card${stage.enabled ? " is-enabled" : ""}`);
      card.dataset.stage = String(index + 1);
      card.dataset.enabled = String(stage.enabled);
      card.append(
        element("p", "pipeline-step", `STEP 0${index + 1}`),
        element("h3", "", stage.name),
        element("span", "stage-status", stage.enabled ? "On" : "Off · bypassed"),
        element("code", "stage-formula", stage.formula)
      );
      const values = element("dl", "stage-values");
      [["Before", stage.before], ["After", stage.after]].forEach(([label, value]) => {
        const row = element("div");
        const description = element("dd");
        description.append(element("code", "seed-value", lab.hex64(value)));
        row.append(element("dt", "", label), description);
        values.append(row);
      });
      const changes = element("p", "stage-bit-changes");
      changes.append(element("strong", "", String(stage.bitChanges)), document.createTextNode(" / 64 bits changed"));
      card.append(values, changes);
      fragment.append(card);
    });
    fragment.append(endpointCard("INTO TRIFLOW", "Effective seed", stream.effectiveSeed, "This value initializes TriFlow. The output algorithm is unchanged."));
    dom.pipeline.replaceChildren(fragment);
  }

  function updatePlaybackUI() {
    const complete = shown === BATCH_SIZE;
    dom.play.disabled = !selected || complete;
    dom.step.disabled = !selected || complete;
    dom.replay.disabled = !selected;
    dom.play.setAttribute("aria-pressed", String(playing));
    dom.playLabel.textContent = playing ? "Pause" : complete ? "Complete" : "Play";
    dom.playIcon.textContent = playing ? "Ⅱ" : complete ? "✓" : "▶";
    dom.motionNote.hidden = !motionPreference.matches;
    if (!selected) return;
    dom.status.textContent = playing
      ? "Playing · revealing the fixed batch."
      : complete
        ? "Batch complete. Replay to explore the same sequence again."
        : pauseReason || "Paused · same sequence, ready when you are.";
  }

  function renderReadouts() {
    const correlation = adjacentCorrelation();
    dom.shown.textContent = numbers.format(shown);
    dom.shown.dataset.count = String(shown);
    dom.progress.value = shown;
    dom.progress.textContent = `${shown} of ${BATCH_SIZE}`;
    dom.mean.textContent = (statistics.meanTotal / shown).toFixed(6);
    dom.ones.textContent = `${(statistics.oneBits / (shown * 64) * 100).toFixed(2)}%`;
    dom.correlation.textContent = correlationText(correlation);
    dom.repeats.textContent = numbers.format(statistics.repeatedValues);
    dom.latestIndex.textContent = `#${numbers.format(shown)}`;
    dom.latestOutput.textContent = lab.hex64(selected.values[shown - 1]);

    const pairs = Math.floor(shown / 2);
    const firstRow = Math.max(0, shown - RASTER_ROWS);
    const rowCount = shown - firstRow;
    dom.pairCount.textContent = `${numbers.format(pairs)} pairs per stream`;
    dom.rasterRange.textContent = `Outputs ${numbers.format(firstRow + 1)}–${numbers.format(shown)} · ${rowCount} rows`;
    const selectedPeak = Math.max(...statistics.histogram);
    const selectedPeakIndex = statistics.histogram.indexOf(selectedPeak);
    const baselinePeak = Math.max(...baselineHistogram);
    const baselinePeakIndex = baselineHistogram.indexOf(baselinePeak);
    dom.histogramSummary.textContent = `${numbers.format(shown)} outputs per stream across 32 buckets numbered 0–31. Selected peak: bucket ${selectedPeakIndex}, ${selectedPeak} outputs. Original peak: bucket ${baselinePeakIndex}, ${baselinePeak} outputs. An even split would be ${shown / 32} outputs per bucket.`;
    dom.scatterSummary.textContent = `${numbers.format(pairs)} nonoverlapping adjacent pairs per stream, using the same even/odd positions. Both axes range from zero to one. Selected correlation using all consecutive pairs: ${correlation === null ? "undefined" : correlation.toFixed(4)}.`;
    dom.rasterSummary.textContent = `${rowCount} rows per stream, outputs ${numbers.format(firstRow + 1)} through ${numbers.format(shown)}, in the same order. Each row has 64 bits, most significant on the left. Older outputs are above newer outputs. Bright pixels are one and dark pixels are zero.`;
    updatePlaybackUI();
  }

  function makeSurface(id) {
    const canvas = byId(id);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not create a 2D canvas.");
    return { canvas, context };
  }

  function fitSurface(surface) {
    // Observe the CSS-sized wrapper, not the canvas bitmap, to avoid a resize feedback loop.
    const rectangle = surface.canvas.parentElement.getBoundingClientRect();
    const width = rectangle.width;
    const height = rectangle.height;
    if (width <= 0 || height <= 0) return null;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (surface.canvas.width !== pixelWidth) surface.canvas.width = pixelWidth;
    if (surface.canvas.height !== pixelHeight) surface.canvas.height = pixelHeight;
    const context = surface.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setLineDash([]);
    context.globalAlpha = 1;
    context.lineWidth = 1;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.font = "11px ui-monospace, Consolas, monospace";
    return { context, width, height, ratio };
  }

  function drawHistogram() {
    const surface = fitSurface(surfaces.histogram);
    if (!surface) return;
    const { context: ctx, width, height } = surface;
    const left = 40;
    const top = 18;
    const plotWidth = width - left - 10;
    const plotHeight = height - top - 42;
    if (plotWidth <= 0 || plotHeight <= 0) return;
    const peak = Math.max(...baselineHistogram, ...statistics.histogram, shown / 32, 1);
    const maximum = Math.ceil(peak * 1.15 / 4) * 4;
    const yFor = (count) => top + plotHeight - count / maximum * plotHeight;

    for (let tick = 0; tick <= 4; tick += 1) {
      const count = maximum * tick / 4;
      const y = yFor(count);
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
      ctx.fillStyle = colors.labels;
      ctx.textAlign = "right";
      ctx.fillText(String(count), left - 8, y + 4);
    }

    const bucketWidth = plotWidth / 32;
    const padding = bucketWidth * 0.12;
    const gap = Math.min(1, bucketWidth * 0.08);
    const barWidth = (bucketWidth - padding * 2 - gap) / 2;
    for (let index = 0; index < 32; index += 1) {
      const x = left + index * bucketWidth + padding;
      const baselineY = yFor(baselineHistogram[index]);
      const selectedY = yFor(statistics.histogram[index]);
      ctx.fillStyle = colors.amber;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x, baselineY, barWidth, top + plotHeight - baselineY);
      ctx.fillStyle = colors.mint;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x + barWidth + gap, selectedY, barWidth, top + plotHeight - selectedY);
    }
    ctx.globalAlpha = 1;
    const referenceY = yFor(shown / 32);
    ctx.strokeStyle = "#bacad8";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(left, referenceY);
    ctx.lineTo(left + plotWidth, referenceY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.labels;
    ctx.textAlign = "left";
    ctx.fillText("count", left, 10);
    ctx.textAlign = "center";
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = tick / 4;
      ctx.fillText(String(value), left + value * plotWidth, top + plotHeight + 18);
    }
    ctx.fillText("x · high 32 bits scaled to [0, 1)", left + plotWidth / 2, height - 4);
  }

  function drawScatter() {
    const surface = fitSurface(surfaces.scatter);
    if (!surface) return;
    const { context: ctx, width, height } = surface;
    const left = 54;
    const top = 14;
    const plotWidth = width - left - 15;
    const plotHeight = height - top - 40;
    if (plotWidth <= 0 || plotHeight <= 0) return;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = tick / 4;
      const x = left + value * plotWidth;
      const y = top + (1 - value) * plotHeight;
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotHeight);
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
      ctx.fillStyle = colors.labels;
      ctx.textAlign = "center";
      ctx.fillText(String(value), x, top + plotHeight + 17);
      ctx.textAlign = "right";
      ctx.fillText(String(value), left - 8, y + 4);
    }
    ctx.fillStyle = colors.labels;
    ctx.textAlign = "center";
    ctx.fillText("x[n]", left + plotWidth / 2, height - 2);
    ctx.save();
    ctx.translate(10, top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("x[n+1]", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, plotWidth, plotHeight);
    ctx.clip();
    [[baseline, true], [selected, false]].forEach(([stream, isBaseline]) => {
      const radius = isBaseline ? 2.3 : 1.3;
      ctx.beginPath();
      for (let index = 0; index + 1 < shown; index += 2) {
        const x = left + stream.scaled[index] * plotWidth;
        const y = top + (1 - stream.scaled[index + 1]) * plotHeight;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      if (isBaseline) {
        ctx.strokeStyle = colors.amber;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 0.85;
        ctx.stroke();
      } else {
        ctx.fillStyle = colors.mint;
        ctx.globalAlpha = 0.8;
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawRaster(surfaceEntry, values, color) {
    const surface = fitSurface(surfaceEntry);
    if (!surface) return;
    const { context: ctx, width, height, ratio } = surface;
    const firstRow = Math.max(0, shown - RASTER_ROWS);
    const rowCount = shown - firstRow;
    ctx.fillStyle = colors.zero;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    for (let row = 0; row < rowCount; row += 1) {
      const bits = values[firstRow + row].toString(2).padStart(64, "0");
      const y = Math.round(row * height / rowCount * ratio) / ratio;
      const nextY = Math.round((row + 1) * height / rowCount * ratio) / ratio;
      for (let column = 0; column < 64; column += 1) {
        if (bits[column] !== "1") continue;
        const x = Math.round(column * width / 64 * ratio) / ratio;
        const nextX = Math.round((column + 1) * width / 64 * ratio) / ratio;
        ctx.fillRect(x, y, nextX - x, nextY - y);
      }
    }
    ctx.strokeStyle = "#ffffff20";
    ctx.lineWidth = 1 / ratio;
    for (let column = 8; column < 64; column += 8) {
      const x = Math.round(column * width / 64 * ratio) / ratio;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  function drawPlots() {
    if (!selected || !surfaces || document.hidden) return;
    drawHistogram();
    drawScatter();
    drawRaster(surfaces.baselineRaster, baseline.values, colors.amber);
    drawRaster(surfaces.selectedRaster, selected.values, colors.mint);
  }

  function render() {
    renderReadouts();
    drawPlots();
  }

  function advanceTo(target) {
    const next = Math.min(BATCH_SIZE, target);
    if (next <= shown) return;
    extendStatistics(statistics, selected, shown, next);
    extendHistogram(baselineHistogram, baseline.scaled, shown, next);
    shown = next;
    if (shown === BATCH_SIZE) stopAnimation();
    render();
  }

  function frame(time) {
    animationId = 0;
    if (!playing) return;
    if (document.hidden) {
      pausePlayback("Paused while the tab is hidden. Press Play to continue.", false);
      return;
    }
    const elapsed = time - lastFrameTime;
    if (elapsed >= FRAME_INTERVAL) {
      lastFrameTime = time - elapsed % FRAME_INTERVAL;
      advanceTo(shown + OUTPUTS_PER_FRAME);
      if (shown === BATCH_SIZE) announce("Batch complete. All 4,096 outputs are shown. Replay repeats the same sequence.");
    }
    if (playing) animationId = window.requestAnimationFrame(frame);
  }

  function play() {
    if (!selected || shown >= BATCH_SIZE || document.hidden) return;
    pauseReason = "";
    playing = true;
    lastFrameTime = performance.now();
    updatePlaybackUI();
    announce(`Playing from ${numbers.format(shown)} outputs. Press Pause to stop.`);
    animationId = window.requestAnimationFrame(frame);
  }

  function replay() {
    if (!selected) return;
    stopAnimation();
    statistics = createStatistics();
    baselineHistogram = Array(32).fill(0);
    shown = 0;
    pauseReason = "";
    advanceTo(INITIAL_VISIBLE);
    announce("Replayed the same sequence. The first 256 outputs are shown, paused.");
  }

  function requestResizeDraw() {
    if (resizeId || document.hidden || !selected) return;
    resizeId = window.requestAnimationFrame(() => {
      resizeId = 0;
      drawPlots();
    });
  }

  function installListeners() {
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      applySettings(requestedMask());
    });
    dom.input.addEventListener("input", () => {
      clearSeedError();
      updateDraftNote();
    });
    dom.toggles.addEventListener("change", (event) => {
      if (event.target.matches(".experiment-toggle")) applySettings(requestedMask());
    });
    dom.play.addEventListener("click", () => {
      if (playing) pausePlayback();
      else play();
    });
    dom.step.addEventListener("click", () => {
      if (!selected || shown === BATCH_SIZE) return;
      stopAnimation();
      pauseReason = "";
      advanceTo(shown + STEP_SIZE);
      announce(shown === BATCH_SIZE ? "Batch complete. All 4,096 outputs are shown." : `Stepped to ${numbers.format(shown)} outputs, paused.`);
    });
    dom.replay.addEventListener("click", replay);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (playing) pausePlayback("Paused while the tab was hidden. Press Play to continue.", false);
        if (resizeId) window.cancelAnimationFrame(resizeId);
        resizeId = 0;
      } else {
        requestResizeDraw();
      }
    });
    window.addEventListener("pagehide", () => {
      pausePlayback("Paused. Press Play to continue.", false);
      if (resizeId) window.cancelAnimationFrame(resizeId);
      resizeId = 0;
    });
    window.addEventListener("resize", requestResizeDraw);
    const onMotionChange = () => {
      if (motionPreference.matches && playing) {
        pausePlayback("Paused for reduced motion. Use Step, or explicitly press Play to continue.");
      }
      updatePlaybackUI();
    };
    if (motionPreference.addEventListener) motionPreference.addEventListener("change", onMotionChange);
    else motionPreference.addListener(onMotionChange);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(requestResizeDraw);
      Object.values(surfaces).forEach((surface) => resizeObserver.observe(surface.canvas.parentElement));
    }
  }

  try {
    if (!lab || !Array.isArray(lab.EXPERIMENTS) || lab.EXPERIMENTS.length !== 3 ||
        !["parseSeed", "generate", "summarize", "hex64"].every((name) => typeof lab[name] === "function")) {
      throw new Error("The seed engine is unavailable. Keep seed_lab.js beside this page and use a modern browser with BigInt support.");
    }
    createToggleControls();
    surfaces = {
      histogram: makeSurface("histogram"),
      scatter: makeSurface("scatter"),
      baselineRaster: makeSurface("baseline-raster"),
      selectedRaster: makeSurface("selected-raster")
    };
    if (!applySettings(0, false)) throw new Error(dom.loadError.textContent || dom.seedError.textContent);
    dom.input.disabled = false;
    dom.apply.disabled = false;
    dom.equations.disabled = false;
    installListeners();
  } catch (error) {
    stopAnimation();
    dom.loadError.textContent = error.message || "The seed lab could not be initialized.";
    dom.loadError.hidden = false;
    dom.status.textContent = "Unable to initialize. The error above explains what is missing.";
    [dom.input, dom.apply, dom.equations, dom.play, dom.step, dom.replay].forEach((control) => {
      control.disabled = true;
    });
  }
})();
