#include "example_utils.hpp"

#include <cstddef>
#include <cstdint>
#include <iomanip>
#include <iostream>

int main() {
    const std::uint64_t seed = 0x504F4B49455F3031ULL;
    clank::TriFlowRng rng(seed);
    const char* const symbols[] = {"Cherry", "Lemon", "Bell", "Seven"};
    const clank::TriFlowRng::result_type symbol_count =
        sizeof(symbols) / sizeof(symbols[0]);

    std::cout << "Pokie reel demo - toy simulation, not live gambling advice "
              << "(fixed seed 0x" << std::hex << seed << std::dec << ")\n";
    for (unsigned int spin = 1; spin <= 6; ++spin) {
        const std::size_t first = static_cast<std::size_t>(
            clank_examples::bounded_sample(rng, symbol_count));
        const std::size_t second = static_cast<std::size_t>(
            clank_examples::bounded_sample(rng, symbol_count));
        const std::size_t third = static_cast<std::size_t>(
            clank_examples::bounded_sample(rng, symbol_count));

        std::cout << "spin " << spin << ": " << symbols[first] << " | "
                  << symbols[second] << " | " << symbols[third];
        if (first == second && second == third) {
            std::cout << "  (three-match)";
        }
        std::cout << '\n';
    }
}
