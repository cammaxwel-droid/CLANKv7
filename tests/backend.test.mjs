import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createBackend, evaluateDiagnostics, runDiagnostics } from "../scripts/rng-backend.mjs";

const token = "12".repeat(32);
const authorization = `Bearer ${token}`;

async function withServer(run) {
    const server = createBackend({ token });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
        await run(server.address().port);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

function call(port, path, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = request({
            hostname: "127.0.0.1", port, path, method,
            headers: { authorization, ...headers }
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
            }));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end(body);
    });
}

test("local diagnostics check all frozen vectors and source identity", () => {
    assert.deepEqual(runDiagnostics(), {
        ok: true, engine: "triflow-v1", sourceHashMatches: true, wordsChecked: 28, mismatch: null
    });
});

test("diagnostics report altered source and incorrect output without changing code", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/triflow-v1.json", import.meta.url), "utf8"));
    const source = readFileSync(new URL("../src/triflow_rng.hpp", import.meta.url), "utf8");
    const altered = evaluateDiagnostics(fixture, source + "\n");
    assert.equal(altered.ok, false);
    assert.equal(altered.sourceHashMatches, false);
    fixture.cases[1].outputs_hex[0] = "0000000000000000";
    const wrongWord = evaluateDiagnostics(fixture, source);
    assert.equal(wrongWord.ok, false);
    assert.equal(wrongWord.sourceHashMatches, true);
    assert.deepEqual(wrongWord.mismatch, {
        seed: "0000000000000000", draw: 1,
        expected: "0000000000000000", actual: "085a291d48fa42c1"
    });
});

test("backend only accepts a correctly shaped token", () => {
    for (const invalid of [undefined, "", "a".repeat(63), "G".repeat(64), "a".repeat(64) + "\n"]) {
        assert.throws(() => createBackend({ token: invalid }), /CLANK_API_TOKEN/);
    }
});

test("health and diagnostics require authorization and reject browser and nonlocal host headers", async () => {
    await withServer(async (port) => {
        assert.equal((await call(port, "/health", { headers: { authorization: "" } })).status, 401);
        assert.equal((await call(port, "/health", { headers: { authorization: `Bearer ${"34".repeat(32)}` } })).status, 401);
        assert.equal((await call(port, "/health", { headers: { host: "evil.example" } })).status, 403);
        assert.equal((await call(port, "/health", { headers: { origin: "http://127.0.0.1" } })).status, 403);
        assert.equal((await call(port, "/health", { headers: { "sec-fetch-site": "same-origin" } })).status, 403);
        const health = await call(port, "/health");
        assert.deepEqual(health.body, { ok: true, service: "clank-rng-backend", engine: "triflow-v1" });
        assert.equal(health.status, 200);
        assert.equal(health.headers["cache-control"], "no-store");
        const result = await call(port, "/v1/diagnostics");
        assert.equal(result.status, 200);
        assert.equal(result.body.wordsChecked, 28);
        assert.equal(result.body.ok, true);
        assert.equal((await call(port, "/v1/execute")).status, 404);
    });
});

test("word API returns canonical, repeatable output and enforces request limits", async () => {
    await withServer(async (port) => {
        const json = { method: "POST", headers: { "content-type": "application/json" } };
        const body = JSON.stringify({ seed: "0123456789abcdef", count: 2 });
        const first = await call(port, "/v1/words", { ...json, body });
        const second = await call(port, "/v1/words", { ...json, body });
        assert.equal(first.status, 200);
        assert.deepEqual(first.body, {
            engine: "triflow-v1", seed: "0123456789abcdef",
            words: ["0ef50f516af9ed39", "873896253787d290"]
        });
        assert.deepEqual(second.body, first.body);
        assert.equal((await call(port, "/v1/words", { method: "POST", body })).status, 415);
        for (const invalid of [
            "{", "null", "[]",
            JSON.stringify({ seed: "0123456789abcdef\n", count: 1 }),
            JSON.stringify({ seed: "0123456789abcdef", count: 0 }),
            JSON.stringify({ seed: "0123456789abcdef", count: 1025 }),
            JSON.stringify({ seed: "0123456789abcdef", count: 1, command: "anything" })
        ]) {
            assert.equal((await call(port, "/v1/words", { ...json, body: invalid })).status, 400);
        }
        assert.equal((await call(port, "/v1/words", { ...json, body: " ".repeat(4097) })).status, 413);
    });
});

test("CLI exposes diagnostics and rejects invalid commands and server configuration", () => {
    const executable = fileURLToPath(new URL("../scripts/rng-backend.mjs", import.meta.url));
    const invoke = (...args) => spawnSync(process.execPath, [executable, ...args], {
        encoding: "utf8", env: { ...process.env, CLANK_API_TOKEN: "" }
    });
    const result = invoke("diagnostics");
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).wordsChecked, 28);
    assert.notEqual(invoke("serve").status, 0);
    assert.notEqual(invoke("serve", "0").status, 0);
    assert.notEqual(invoke("execute", "anything").status, 0);
});
