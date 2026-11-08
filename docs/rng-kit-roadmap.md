# Approved RNG-kit roadmap

The first kit will be a small TypeScript package around the unchanged C++
reference, for browser and Electron play-money games with no cash or
redeemable prizes. Initial distribution is a pinned local npm archive;
public publication requires a later decision about ownership and licensing.

Provisional package: `@clankv7/rng`, candidate `0.1.0-experimental.1`.
Keep it private during development and use zero third-party runtime packages.
The raw engine identifier is `triflow-v1`; the implemented helper identifier is
`clank-sampling-v1`. The identifiers preserve replay as future versions evolve.

## Bounded milestones

1. **Freeze and reproduce:** preserve existing work, document the exact engine,
   retain all current vectors, add the independent Python reference and
   repeatable C++ build/check commands. See [the contract](triflow-v1.md) and
   [development guide](development.md) for evidence and how to rerun it.
2. **TypeScript engine:** strict BigInt port with explicit 64-bit wrapping,
   shared fixtures and C++/Python/TypeScript comparisons. Keep the average's
   sum wide. Never store a full seed, word or state in a JS `number`. Implemented
   and checked; see the [raw-engine guide](typescript-engine.md).
3. **Game helpers:** rejection-sampled bounds through `2^32`, intervals,
   53-bit floats, integer probabilities and weights, pick and Fisher-Yates
   shuffle. Invalid inputs and deterministic shortcuts consume no draws;
   validate before shortcuts. Rejection has no arbitrary retry cutoff. Implemented
   in this candidate with mutation, validation and draw-consumption regressions.
4. **Sessions and replay:** host entropy entry points, canonical seed text,
   versioned snapshots, direct large-position restoration and exhaustion at
   `2^64` draws. Keep gameplay and cosmetics in separately seeded instances.
5. **Pokie reference:** durable single-payline three-reel example, exact
   enumeration of 216 combinations, atomic IndexedDB round/session updates,
   duplicate protection, replay, reload and storage-failure tests.
6. **Quality research:** broader bit/seed measurements, binary adapters,
   bounded PractRand runs (64 MiB per seed, eight recorded seeds), documented
   anomalies and confirmation procedure, repeatable benchmarks. Add TestU01
   after the initial harness is stable. Preserve v1 during research.
7. **Agent package:** local npm archive, declarations, guide, copyable agent
   prompts and clean consumers, with browser and isolated Electron evidence.
8. **Public release preparation:** package audit, licence decision record,
   compatibility statement, changelog and evidence. Publication remains a
   separately authorised action.

Milestones 1–3 are implemented in the unified candidate. Local package smoke
checks and diagnostic tools cover parts of later milestones, while sessions,
durable game persistence, established statistical suites and public-release
preparation remain open. The current candidate overview records its evidence.
This roadmap alone grants no authority to publish packages or merge branches.

## Locked first example, for milestone 5

Start with 1,000 play credits and stake one credit per spin. Select one stop
per reel, in reel order, with `intBelow(6)`:

```text
Reel 1: A A A B B C
Reel 2: A B A C A B
Reel 3: C B A B A A
```

`AAA` pays 4, `BBB` pays 8, `CCC` pays 32; all other results pay zero.
These are gross payouts including the stake. New balance is prior balance
minus stake plus gross payout. Under ideal independent uniform stops, total
gross payout over all 216 equally likely stop tuples is 204 credits; 36 tuples
pay. Theoretical return is `204/216`, hit frequency `36/216`. Measured TriFlow
behaviour must be reported separately. No wilds, scatters or free spins are
part of this example.

Compute and commit each accepted outcome, balance and RNG state once before
animation. Identical round retries return stored outcomes; conflicting IDs
and stale revisions fail. Old-round lookup must not replace current balance.
