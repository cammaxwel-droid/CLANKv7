#include "../src/triflow_rng.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>

int main() {
    const std::uint64_t seed = 0x0123456789ABCDEFULL;
    clank::TriFlowRng rng(seed);

    std::cout << "TriFlow demo (fixed seed 0x" << std::hex << seed << ")\n";
    for (unsigned int i = 0; i < 8; ++i) {
        std::cout << "output[" << std::dec << i << "] = 0x"
                  << std::hex << std::setw(16) << std::setfill('0')
                  << rng.next() << '\n';
    }
}
