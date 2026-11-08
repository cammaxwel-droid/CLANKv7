"use strict";

// Optional module path lets the same benchmark measure a saved pre-change model.
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const lab = require(path.resolve(process.argv[2] || "examples/seed_lab.js"));
const seed = 0x0123456789abcdefn;
const count = 65536;
const values = lab.generate(seed, 0, count).values;
let checksum = 0;

function measure(name, operation) {
    for (let run = 0; run < 4; ++run) operation();
    const samples = [];
    for (let run = 0; run < 7; ++run) {
        const start = performance.now();
        for (let repeat = 0; repeat < 5; ++repeat) operation();
        samples.push((performance.now() - start) / 5);
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    console.log(JSON.stringify({ name, words: count, median_ms: sorted[3], samples_ms: samples }));
}

console.log(JSON.stringify({ node: process.version, platform: process.platform,
    arch: process.arch, cpu: os.cpus()[0]?.model, seed: lab.hex64(seed) }));
measure("summarize", () => {
    const stats = lab.summarize(values);
    checksum += stats.bitCounts[0] + stats.histogram[0] + stats.repeatedValues;
});
console.log(JSON.stringify({ checksum }));
