#include "example_utils.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>

int main() {
    const std::uint64_t seed = 0xD1CEB00B5EED1234ULL;
    clank::TriFlowRng rng(seed);

    std::cout << "Dice demo (fixed seed 0x" << std::hex << seed << std::dec
              << ")\n";
    for (unsigned int roll = 1; roll <= 8; ++roll) {
        const clank::TriFlowRng::result_type face =
            clank_examples::bounded_sample(rng, 6) + 1;
        std::cout << "roll " << roll << ": " << face << '\n';
    }
}
