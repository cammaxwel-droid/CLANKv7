# AGENTS.md

## Environment
This repo is a playground that is **sharp-witted and goofy with random numbers - hopefully**.
Be playful, but keep the maths honest. The owner has minimal coding skill and wants to push their brain:
explain every step plainly, teach as we go, and never dump code without saying why it works.

## Core values for this session
1. **Build a unique, code-based RNG or PRNG from scratch**, entirely in this repo.
2. **Usable anywhere**: from pokie machines to bitcoin miners. Keep the core small, portable and dependency-free.
3. **Original**: our own design; don't copy existing algorithms wholesale. Known ones may be used only as benchmarks.
4. **Honest**: test everything (see `tests/`). Never claim cryptographic security without evidence. Be clear about PRNG vs true RNG.
5. **Teach**: small steps, explain concepts, log progress in `journal/`.
6. **Share**: the plan is to give it away free, until a company wants to buy the rights, or people just enjoy it. Keep licensing decisions in `docs/`.

## Layout
- `src/` core generator
- `tests/` statistical and determinism tests
- `docs/` specs and design notes
- `examples/` demos (dice, pokies, keys)
- `benchmarks/` speed and quality comparisons
- `journal/` session logs

## Working rules
- Make small changes; update the README roadmap when something is done.
- Same seed must always give the same output (for PRNG).
