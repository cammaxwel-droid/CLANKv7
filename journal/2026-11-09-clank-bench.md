# CLANK Bench branch build

Cam requested an implemented Bench, preservation of main for debugging and
later manual transposition, no merges, and a downloadable protect-main ruleset.

The work branches from the existing reviewed optimization commit
`d317347ccf0194fc80a11f758f90e1dbf9cee85d` onto `codex/clank-bench`.
Main was observed at `9fe757f502f795ccf30070e396fac6ea3fd3b7a8` before work.

Implemented a local HTML/CSS/JavaScript workbench with exact seed entry,
raw-draw stepping and playback, histograms, scatter and bit raster, bit balance,
seed-bit-flip comparison, and a real-draw lane trace. An additive `nextTrace()`
method reuses the existing browser engine and private mixing operations.
The normal draw implementation and frozen native engine are preserved.

A separate cursor into the same seeded stream drives an ephemeral reel
diagnostic simulation. The mapping table shows rejection thresholds, discarded
words, accepted words and reel stops. The approved three-reel paytable is
enumerated over all 216 stop combinations. Measured gross return, hit frequency,
outcome counts and an assumption-dependent normal reference band are displayed
beside the exact maths. This is a diagnostics view with hypothetical stakes,
not the roadmap's durable game, sampling kit or session/snapshot implementation.

Work is chunked through requestAnimationFrame and capped at 30 updates/second,
4,096 inspected words and 100,000 simulated spins per seed. Plots retain a
bounded window. Hidden tabs and changes to reduced-motion preference pause work.
Local JSON report export keeps 64-bit words as canonical hex text. No network,
external font, dependency installation or persistent save is required.

Prepared `docs/protect-main.json` and an import guide. The active branch ruleset
targets main, restricts updates with no bypass actors, restricts deletion, and
blocks force pushes. It is deliberately a temporary freeze, including merges,
until the owner edits or disables that restriction. The settings remain a file
for the user to review and import. JSON syntax and current official schema were
checked; no live ruleset was installed or server-validated.

Validation passed 30 existing and new Node tests with zero skips. The existing
native/browser parity fixture covers 36,864 outputs across 576 profiles. New
tests cover original golden words through traced draws, exact lane arithmetic,
paytable enumeration, rejection boundaries and trace caps, BigInt limits,
independent inspector/reel positions, exact replay, snapshot isolation, fixed
session limits, control scheduling, invalid-input preservation, hidden tabs,
motion preferences and report serialization.

Actual browser rendering remains unverified. Chromium launch failed because
the execution environment denied its socket operation. The browser preview
surface also rejected local-file navigation under its URL policy. No browser
warning or policy gate was bypassed. The real controller was instead exercised
with the tested DOM/canvas/clock model, which does not verify layout or focus.
Windows hands-on operation remains pending.

The pre-release `tag-chain-release` is reserved for the next review after this
delivery, as requested. This build does not alter or merge that release.
