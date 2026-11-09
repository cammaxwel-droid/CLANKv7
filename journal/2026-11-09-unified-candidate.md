# Unified candidate review

Cam requested a full repository review and an improved version. The audit
covered current main, Chain, Bench and sampling/backend branches and their
published tag snapshots. Work stays on `codex/clank-unified-candidate`, retaining
main and existing tags for debugging.

Native, browser, sampling/backend and documentation reviews ran in parallel.
The candidate combines Chain and Bench history, selectively incorporates the
sampling/backend work without its deletions, and corrects the concrete issues
listed in docs/UNIFIED-CANDIDATE.md. It preserves existing designs and raw
streams, makes Chain inspectable in Bench, and expands the common verifier to
cover actual entry points rather than relying on disconnected test commands.

Full verification passed 65 Node and 16 Python tests, eleven native builds,
three-language raw conformance across 870,000 words per engine, existing
browser/native parity and Chain fixture comparisons. Local package consumption
also passed. Source-archive acceptance is checked separately from Git metadata.

Licensing stays undecided. No public npm package, live backend deployment,
main update, release-tag replacement or merge into a protected branch is part
of this candidate. Current browser-pixel and Windows acceptance limitations
are documented for review.
