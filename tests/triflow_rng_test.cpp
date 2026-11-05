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

    clank::TriFlowRng zero_seed(0);
    clank::TriFlowRng zero_seed_replay(0);
    require(zero_seed.next() == zero_seed_replay.next(),
            "zero is a valid, repeatable seed");

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
