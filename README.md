# CLANKv7 🎲

Clankv7 was an experiment to see if I could generate random numbers.. and it hopefully succeeded in the way I wanted.

Now we're experimenting with our own random / pseudo-random number generator from scratch, built with AI help by someone pushing their brain. Free for anyone to use and join in; statistical and security claims still need evidence.

## Folder tour
| Folder | What lives there |
|---|---|
| `src/` | the RNG itself |
| `tests/` | randomness and determinism tests |
| `docs/` | design notes and specs |
| `examples/` | pokie machine, dice, key demos |
| `benchmarks/` | speed and quality comparisons |
| `journal/` | session logs |

See [AGENTS.md](AGENTS.md) for how the AI helper behaves.

## First experiment: TriFlow

The first prototype is a dependency-free C++11 PRNG. Each call advances three
deterministic number lanes, averages their mixed values, then mixes that
average with the lanes to return a 64-bit result. The average is not returned
by itself because plain averaging tends to bunch values near the middle.

Build and run the fixed-seed demo:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic examples/triflow_demo.cpp -o triflow_demo
./triflow_demo
```

Run the repeatability and basic histogram smoke checks:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/triflow_rng_test.cpp -o triflow_rng_test
./triflow_rng_test
```

This is an experimental PRNG, not true randomness or a cryptographic generator.
Do not use it for Bitcoin keys, live gambling, passwords, or other
security-sensitive uses. See the [design notes](docs/triflow-design.md).

## Roadmap (tick as we go)
- [x] Pick the language: C++11
- [x] Learn the basics: seed, state, output
- [x] Design our first algorithm (write it up in `docs/`)
- [x] First working version in `src/`
- [ ] Tests: full distribution, bias, runs, and correlation (repeatability and a basic histogram smoke check added)
- [ ] Examples: dice and pokie reels
- [ ] Benchmarks against known generators
- [ ] Choose a licence / release for free
- [ ] Security review before any bitcoin-style use

## Join in
1. Pick an unchecked roadmap item (or propose one in an issue).
2. Ask the AI helper to explain it, then try it yourself.
3. Add a short note to `journal/`.
4. Open a PR and tick the box.

## Questions to ponder
- What is the difference between random and pseudo-random?
- What should our seed be?
- What makes ours *unique*?
