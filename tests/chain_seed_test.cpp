#include "../src/seed_experiments.hpp"
#include "../src/triflow_rng.hpp"

#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

clank::SeedExperiments options(unsigned int mask) {
    return clank::SeedExperiments((mask & 1U) != 0, (mask & 2U) != 0,
                                 (mask & 4U) != 0);
}

void hex(std::uint64_t word) {
    std::cout << std::hex << std::setfill('0') << std::setw(16) << word << std::dec;
}

const std::uint64_t seeds[] = {
    0, 1, ~std::uint64_t(0), 0x8000000000000000ULL,
    0x0123456789ABCDEFULL, 0x0020000000000001ULL,
    0xAAAAAAAAAAAAAAAAULL, 0x5555555555555555ULL
};
const std::uint64_t generations[] = {
    0, ~std::uint64_t(0), 1, 0x8000000000000000ULL,
    2, 0x0020000000000001ULL, 17, 0x0123456789ABCDEFULL
};

void emit_vectors() {
    for (unsigned int index = 0; index < 8; ++index) {
        for (unsigned int mask = 0; mask < 8; ++mask) {
            const clank::SeedExperiments mode = options(mask);
            const std::uint64_t prepared = clank::chain_seed(seeds[index], mode);
            const std::uint64_t repaired = clank::experimental_seed_repaired(
                seeds[index], generations[index], mode);
            hex(seeds[index]); std::cout << ' ';
            hex(generations[index]); std::cout << ' ' << mask << ' ';
            hex(prepared); std::cout << ' ';
            hex(clank::invert_chain_seed(prepared, mode)); std::cout << ' ';
            hex(repaired);
            clank::TriFlowRng rng(repaired);
            for (unsigned int draw = 0; draw < 8; ++draw) {
                std::cout << ' '; hex(rng.next());
            }
            std::cout << '\n';
        }
    }
}

void check_round_trips(std::uint64_t seed) {
    for (unsigned int mask = 0; mask < 8; ++mask) {
        const clank::SeedExperiments mode = options(mask);
        require(clank::invert_chain_seed(clank::chain_seed(seed, mode), mode) == seed,
                "chain-seed-v2 forward/inverse round trip");
        require(clank::chain_seed(clank::invert_chain_seed(seed, mode), mode) == seed,
                "chain-seed-v2 inverse/forward round trip");
        if ((mask & 4U) == 0) {
            require(clank::invert_seed_experiment(clank::experimental_seed(seed, mode), mode) == seed,
                    "original reversible stages must invert in reverse order");
            require(clank::experimental_seed(clank::invert_seed_experiment(seed, mode), mode) == seed,
                    "original reversible stages must round trip both directions");
        }
    }
}

}  // namespace

int main(int argc, char* argv[]) {
    if (argc == 2 && std::string(argv[1]) == "--vectors") {
        emit_vectors();
        std::cout.flush();
        return std::cout ? 0 : 1;
    }
    require(argc == 1, "usage: chain_seed_test [--vectors]");
    for (unsigned int index = 0; index < 8; ++index) check_round_trips(seeds[index]);
    for (unsigned int bit = 0; bit < 64; ++bit) {
        check_round_trips(std::uint64_t(1) << bit);
        check_round_trips(~(std::uint64_t(1) << bit));
    }
    for (std::uint64_t seed = 0; seed < 256; ++seed) check_round_trips(seed);
    clank::TriFlowRng corpus(0x434841494E5F5632ULL);
    for (unsigned int index = 0; index < 10000; ++index) check_round_trips(corpus.next());

    for (unsigned int mask = 4; mask < 8; ++mask) {
        bool rejected = false;
        try { clank::invert_seed_experiment(0, options(mask)); }
        catch (const std::invalid_argument&) { rejected = true; }
        require(rejected, "original lossy Cross-feed must explicitly reject inversion");
    }
    const std::uint64_t maximum = ~std::uint64_t(0);
    require(clank::experimental_seed(0, options(4)) ==
            clank::experimental_seed(maximum, options(4)),
            "original experiment remains available for comparison");
    for (unsigned int index = 0; index < 8; ++index) {
        for (unsigned int mask = 0; mask < 8; ++mask) {
            const clank::SeedExperiments mode = options(mask);
            const std::uint64_t first = clank::experimental_seed_repaired(0, generations[index], mode);
            const std::uint64_t second = clank::experimental_seed_repaired(maximum, generations[index], mode);
            require(first != second, "Chain repair must preserve the previously colliding seed pair");
            std::set<std::uint64_t> distinct_generations;
            for (std::uint64_t generation = 0; generation < 1024; ++generation) {
                const std::uint64_t value = clank::experimental_seed_repaired(seeds[index], generation, mode);
                require(value == clank::experimental_seed_repaired(seeds[index], generation, mode),
                        "same seed, generation and options must replay");
                require(distinct_generations.insert(value).second,
                        "sampled generations must remain distinct for a fixed seed and mode");
            }
        }
    }
    std::cout << "Chain v2 passed 10392 seed-case bidirectional round trips across all eight modes,\n"
              << "legacy rejection, collision regressions and 65536 generation/replay checks.\n"
              << "These are correctness checks, not statistical or cryptographic certification.\n";
    std::cout.flush();
    return std::cout ? 0 : 1;
}
