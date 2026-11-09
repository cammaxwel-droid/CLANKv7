# Frozen engine contract: triflow-v1

`triflow-v1` names the exact output sequence of `src/triflow_rng.hpp` at
revision `be37706466292bfccbbeed9c7df9b928579b94c3`, including the existing
working-tree regression vectors. Milestone 1 does not change that header.
Future algorithm experiments require another engine identifier and their own
fixtures; never replace old expected outputs to make a changed engine pass.

## Integer rules

Let `U(x) = x mod 2^64`. All lanes, the call counter and returned words are
unsigned 64-bit integers. Every addition and multiplication below wraps with
`U`, except the explicitly wide sum used for the average. XOR and right shifts
operate on unsigned values. For the distances used here:

`R(x, k) = U((x << k) | (x >> (64 - k)))`

Define `M(x)` by these steps in order:

1. `x = x XOR (x >> 30)`
2. `x = U(x * 0xe6d7102b5c9a3f17)`
3. `x = x XOR (x >> 27)`
4. `x = U(x * 0xb3e4f1d7a6c5928b)`
5. Return `x XOR (x >> 31)`.

## Seed and draw

For an unsigned 64-bit seed `s`, initialize:

```text
A = s XOR 0x434c414e4b5f4131
B = R(U(s + 0x434c414e4b5f4232), 21)
C = R(s XOR 0x434c414e4b5f4333, 43)
calls = 0
```

Each raw draw first advances all lanes and the counter, then calculates its
output using the advanced state:

```text
A = U(A + 0xe6d7102b5c9a3f17)
B = U(B + 0xb3e4f1d7a6c5928b)
C = U(C + 0xc8a35167d42e90f5)
calls = U(calls + 1)
a = M(A XOR R(C, 11))
b = M(B XOR R(A, 27))
c = M(C XOR R(B, 45))
mean = floor((a + b + c) / 3)       # unlimited-width sum, no wrapping
braid = a XOR R(b, 17) XOR R(c, 39)
output = M(mean XOR braid XOR calls)
```

The C++ implementation computes the same average using quotients and
remainders, so its sum cannot overflow. The Python reference uses the wide
sum directly. For example, averaging three copies of `2^64 - 1` must return
`2^64 - 1`; wrapping their sum before division would give the wrong answer.

The first output is draw **1**, after the first increment. `seed()` restarts
all state; `operator()` and `next()` are equivalent. Copying the C++ instance
copies its current position. Copies have identical streams, not independent
randomness.

## Fixed evidence and text format

The shared [fixture](../tests/fixtures/triflow-v1.json) copies all 28 existing
expected outputs from `tests/triflow_rng_test.cpp`, in their original order:
eight for seed `0123456789abcdef`, then four for each of five edge seeds.
Seeds and outputs are exactly 16 lowercase hexadecimal digits, without `0x`.
Leading zeros matter. These text words have no host-dependent byte order.
Binary stream encoding is deferred to the research milestone.

The fixture also pins the header's SHA-256 after changing CRLF line endings
to LF, leaving every other byte unchanged:

`5b275845ed1cea60f14095d10eff428096c15a8513ecd166900abec12f85ad3f`

The verifier checks this identity and the saved values. It then compares the
unchanged C++ engine against independent Python arithmetic for the first
10,000 outputs of every fixture seed. See [development](development.md).

## Period and compatibility limits

Each lane advances by an odd step modulo `2^64`, so each lane returns to its
starting value after exactly `2^64` increments. The call counter does too.
Together they therefore repeat after `2^64` raw draws, despite occupying more
than 64 bits of storage. This structural fact does not determine the output
sequence's minimal period or statistical strength.

The existing C++ prototype wraps its counter and continues. The future
TypeScript package will enforce the approved `2^64` exhausted-state marker;
that wrapper and snapshots are not implemented in milestone 1. Its raw words
before exhaustion must match this frozen sequence.

The existing `examples/example_utils.hpp` helper is preserved. It consumes a
draw for a bound of one; it is not the implemented `clank-sampling-v1` API, whose
approved shortcut consumes none. Separate helper versioning preserves that
distinction in milestone 3.

TriFlow is an experimental deterministic PRNG. This baseline establishes
reproduction evidence, not uniformity, unpredictability, security or global
originality. Practical use in this roadmap is limited to play-money games
with no cash or redeemable prizes. Broader statistical work remains open.
