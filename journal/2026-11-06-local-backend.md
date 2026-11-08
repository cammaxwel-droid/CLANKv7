# 2026-11-06 - local RNG backend

## What changed

Added a development-only loopback HTTP service with a secret token, strict
operation allowlist and request limits. It exposes health, frozen-vector
diagnostics and bounded batches of seeded raw words. A CLI also runs the
diagnostic without starting a server.

The service does not execute supplied scripts, rewrite its own source,
implement MCP, or claim to be a firewall. Its diagnostics compare known
fixtures and the frozen C++ source hash; they cannot discover every fault or
attack. The backend guide records the boundaries and explains how to generate
the token using the operating system rather than the experimental PRNG.

## Verification

`npm test` passed 24 tests, including HTTP authentication, host/origin checks,
input bounds, known vectors, and CLI errors. These checks do not certify
security or statistical strength.
