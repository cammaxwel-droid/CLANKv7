#include "../src/seed_experiments.hpp"
#include "../src/triflow_rng.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>

int main() {
    const std::uint64_t seed = 0x0123456789ABCDEFULL;
    const std::uint64_t generation = 0;
    const clank::SeedExperiments options(true, true, true);
    const std::uint64_t effective = clank::experimental_seed_repaired(seed, generation, options);
    clank::TriFlowRng rng(effective);
    std::cout << "Chain 0.6.2-rc.1 / chain-seed-v2 / triflow-v1\n"
              << "Fixed seed 0x" << std::hex << seed << ", generation " << std::dec << generation
              << ", options mask 7\nEffective seed 0x" << std::hex
              << std::setfill('0') << std::setw(16) << effective << '\n';
    for (unsigned int draw = 1; draw <= 8; ++draw) {
        std::cout << "Draw " << std::dec << draw << ": 0x" << std::hex
                  << std::setw(16) << rng.next() << '\n';
    }
    std::cout << "Deterministic experiment. Correctness checks do not establish randomness quality.\n";
    return 0;
}
