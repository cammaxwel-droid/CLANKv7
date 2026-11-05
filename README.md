# CLANKv7 🎲

Clankv7 was an experiment to see if I could generate random numbers.. and it hopefully succeeded in the way I wanted.

Now it's a from-scratch, **unique** random / pseudo-random number generator, built with AI help by someone pushing their brain. Free for anyone to use and join in.

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

## Roadmap (tick as we go)
- [ ] Pick the language
- [ ] Learn the basics: seed, state, output
- [ ] Design our unique algorithm (write it up in `docs/`)
- [ ] First working version in `src/`
- [ ] Tests: distribution, bias, repeatability
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
