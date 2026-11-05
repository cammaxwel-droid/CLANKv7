#include "../examples/example_utils.hpp"

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

void check_boundaries() {
    const std::uint64_t first = 0x085A291D48FA42C1ULL;
    const std::uint64_t second = 0xEB9E879704FB09B6ULL;
    const std::uint64_t maximum = (std::numeric_limits<std::uint64_t>::max)();
    struct BoundCase {
        std::uint64_t bound;
        std::uint64_t expected;
        unsigned int consumed;
    };
    // For bounds above 2^63, the rejection threshold is exactly 2^64 - bound.
    const BoundCase cases[] = {
        {1, 0, 1},
        {2, 1, 1},
        {256, 0xC1, 1},
        {0x8000000000000000ULL, first, 1},
        {maximum, first, 1},
        {std::uint64_t(0) - (first - 1), first, 1},
        {std::uint64_t(0) - first, first, 1},
        {std::uint64_t(0) - (first + 1), second, 2},
        {0x8000000000000001ULL, 0x6B9E879704FB09B5ULL, 2}
    };

    for (const BoundCase& test : cases) {
        clank::TriFlowRng rng(0);
        clank::TriFlowRng reference(0);
        require(clank_examples::bounded_sample(rng, test.bound) == test.expected,
                "boundary sample must match its fixed expected output");
        for (unsigned int i = 0; i < test.consumed; ++i) {
            reference.next();
        }
        for (unsigned int i = 0; i < 8; ++i) {
            require(rng.next() == reference.next(),
                    "sampling must consume exactly the accepted and rejected draws");
        }
    }
}

void check_multiple_rejections() {
    const std::uint64_t bound = 0x8000000000000001ULL;
    const std::uint64_t threshold = 0x7FFFFFFFFFFFFFFFULL;
    clank::TriFlowRng rng(1);
    clank::TriFlowRng reference(1);
    std::uint64_t accepted = 0;
    unsigned int rejected = 0;
    for (;;) {
        accepted = reference.next();
        if (accepted >= threshold) {
            break;
        }
        ++rejected;
        require(rejected < 64, "fixed test seed must reach an accepted draw promptly");
    }
    require(rejected >= 4, "fixed test seed must exercise consecutive rejections");
    require(clank_examples::bounded_sample(rng, bound) == accepted - bound,
            "sampling must continue rejecting until the first valid draw");
    require(rng.next() == reference.next(),
            "multiple rejections must leave the generator at the correct position");
}

void check_invalid_bound_preserves_state() {
    const std::uint64_t seeds[] = {
        0, 1, 0x0123456789ABCDEFULL, 0xFFFFFFFFFFFFFFFFULL
    };
    for (std::uint64_t seed : seeds) {
        clank::TriFlowRng rng(seed);
        for (unsigned int i = 0; i < 137; ++i) {
            rng.next();
        }
        clank::TriFlowRng unchanged(rng);
        bool threw = false;
        try {
            clank_examples::bounded_sample(rng, 0);
        } catch (const std::invalid_argument&) {
            threw = true;
        }
        require(threw, "a zero bound must throw std::invalid_argument");
        for (unsigned int i = 0; i < 8; ++i) {
            require(rng.next() == unchanged.next(),
                    "a rejected zero bound must not consume generator state");
        }
    }
}

}  // namespace

int main() {
    check_boundaries();
    check_multiple_rejections();
    check_invalid_bound_preserves_state();
    std::cout << "Bounded-sampling edge regressions passed.\n";
}
