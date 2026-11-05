#include "../src/triflow_rng.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iostream>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

void check_seed_edges_and_reseeding() {
    struct SeedCase {
        std::uint64_t seed;
        std::uint64_t expected[4];
    };
    const SeedCase cases[] = {
        {0x0000000000000000ULL, {
            0x085A291D48FA42C1ULL, 0xEB9E879704FB09B6ULL,
            0xCB2674C925F90FB8ULL, 0xDEB71520E8CBD7C8ULL}},
        {0x0000000000000001ULL, {
            0x280CF43651378B4FULL, 0x555C3C8EABAD12F4ULL,
            0x2994BCFAE3636E0DULL, 0x1BBA778ECB4F93F2ULL}},
        {0x8000000000000000ULL, {
            0x9654838B2FE77925ULL, 0x2442103D32B02BEFULL,
            0x8B6B7E6557276B26ULL, 0x383A1E38377A18E9ULL}},
        {0xFFFFFFFFFFFFFFFFULL, {
            0x39CBF5FE4C32268FULL, 0xBECA11C359E6A587ULL,
            0xD987BFAA00086CF2ULL, 0xC9D97E63E615BEDDULL}},
        {0x434C414E4B5F4131ULL, {
            0xB38997EFA81A86C1ULL, 0xDCE047DC5C6DBE92ULL,
            0x1D854C4A68939814ULL, 0xB1567D7CE63EF494ULL}}
    };
    clank::TriFlowRng reused(42);
    for (unsigned int i = 0; i < 137; ++i) {
        reused.next();
    }

    for (const SeedCase& test : cases) {
        clank::TriFlowRng fresh(test.seed);
        clank::TriFlowRng callable(test.seed);
        reused.seed(test.seed);
        for (unsigned int i = 0; i < 1024; ++i) {
            const std::uint64_t value = fresh.next();
            if (i < 4) {
                require(value == test.expected[i],
                        "edge-seed output vector must stay stable");
            }
            require(reused.next() == value,
                    "reseeding must reset every lane and the call counter");
            const std::uint64_t called = i % 2 == 0 ? callable() : callable.next();
            require(called == value,
                    "operator() and next() must advance the same stream");
        }

        reused.seed(test.seed);
        for (std::uint64_t expected : test.expected) {
            require(reused.next() == expected,
                    "reseeding with the current seed must restart the stream");
        }
    }
}

void check_copied_state() {
    clank::TriFlowRng original(0x0123456789ABCDEFULL);
    for (unsigned int i = 0; i < 137; ++i) {
        original.next();
    }
    clank::TriFlowRng copied(original);
    clank::TriFlowRng assigned(0);
    assigned = original;

    for (unsigned int i = 0; i < 1024; ++i) {
        const std::uint64_t value = original.next();
        require(copied.next() == value,
                "a copied generator must independently continue its saved state");
        require(assigned.next() == value,
                "copy assignment must replace all generator state");
    }
}

}  // namespace

int main() {
    const std::uint64_t seed = 0x0123456789ABCDEFULL;
    const std::uint64_t expected[] = {
        0x0EF50F516AF9ED39ULL,
        0x873896253787D290ULL,
        0xDE01CC510BDC225CULL,
        0xFC9DD86B363FF4D6ULL,
        0x8CC30E48E9D9DBCAULL,
        0x9535F178C0B812D6ULL,
        0x36F0F0A8C323D53BULL,
        0xCA346ECDAE6496B5ULL
    };
    const std::size_t expected_count = sizeof(expected) / sizeof(expected[0]);
    clank::TriFlowRng first(seed);
    clank::TriFlowRng replay(seed);
    clank::TriFlowRng other(seed + 1);
    bool different_seed_diverges = false;

    for (unsigned int i = 0; i < 10000; ++i) {
        const std::uint64_t value = first.next();
        require(value == replay.next(), "same seed must replay the same stream");
        if (i < expected_count) {
            require(value == expected[i], "fixed-seed output vector must stay stable");
        }
        if (value != other.next()) {
            different_seed_diverges = true;
        }
    }
    require(different_seed_diverges, "different seeds should produce different streams");

    check_seed_edges_and_reseeding();
    check_copied_state();

    const std::size_t sample_count = 262144;
    std::array<std::uint32_t, 256> buckets = {{0}};
    clank::TriFlowRng distribution(seed);
    for (std::size_t i = 0; i < sample_count; ++i) {
        const std::size_t bucket =
            static_cast<std::size_t>(distribution.next() >> 56);
        ++buckets[bucket];
    }

    const std::uint32_t min_count =
        *std::min_element(buckets.begin(), buckets.end());
    const std::uint32_t max_count =
        *std::max_element(buckets.begin(), buckets.end());
    require(min_count >= 750 && max_count <= 1300,
            "high-byte histogram should pass the broad smoke-test bounds");

    std::cout << "TriFlow smoke checks passed; 256 high-byte buckets ranged from "
              << min_count << " to " << max_count << ".\n"
              << "This small check is not a statistical certification.\n";
}
