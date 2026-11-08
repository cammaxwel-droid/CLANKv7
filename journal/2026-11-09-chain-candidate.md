# Chain repair candidate

Cam authorized fixing the reviewed seed-repair defects, committing and pushing
the result, and publishing a Chain release candidate for review while preserving
main. Work starts from `tag-chain-release` at
`c7f2f36e238cdf960526e048a67e2ae17b233ab4`, on
`codex/chain-0.6.2-rc.1`.

The original Cross-feed formula is many-to-one. Recovering every original seed
from its transformed value alone is impossible. Kept that original experiment
for comparison, corrected the reversible inverse formulas in reverse order,
and made impossible original Cross-feed inversion fail explicitly.

Added a versioned reversible Chain path using two 32-bit halves that update
one another through XOR. Each update can be undone using the other half.
The repaired generation wrapper now starts with that reversible preprocessing
of the original seed. It never tries to reconstruct a seed after discarding
its information. Effective seeds intentionally differ from the broken 0.6.1
wrapper. This is documented as `chain-seed-v2`.

Native regression tests cover 10,392 seed cases across eight modes, both inverse
directions, lossy-path rejection, the known collision and 65,536 generation/
replay cases. Independent Python uses modular Newton inversion and repeated
Rotate composition to cross-check the native fixed-point and powered inverses.
Sixty-four frozen records include 512 seeded TriFlow words. Normal verification
reads fixtures; explicit fixture creation refuses to overwrite existing data.

The common verifier passed, including frozen TriFlow identity and 60,000
native/Python comparisons. The native Chain suite passed undefined-behavior
sanitizer checks. Existing native/browser tests passed. Testing used GCC 14.2.0,
Python 3.12.14 and Node 24.22.1 on Linux x64. Windows, actual browser rendering
and the untouched raw TypeScript package need separate acceptance.

The release candidate title is Chain 0.6.2-rc.1 — Release candidate for review.
Release notes are committed alongside the source. Main and the old release tag
are preserved for debugging. No merge is authorized or performed.
