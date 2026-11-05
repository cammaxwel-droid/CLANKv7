// Verification adapter only: the production generator stays untouched.
#include "../src/triflow_rng.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc != 3) {
        std::cerr << "Usage: triflow_stream <16 lowercase hex seed> <1..1000000 draws>\n";
        return 2;
    }
    const std::string seed_text(argv[1]);
    const std::string count_text(argv[2]);
    std::uint64_t seed = 0;
    if (seed_text.size() != 16) {
        std::cerr << "Seed must have exactly 16 lowercase hexadecimal digits.\n";
        return 2;
    }
    for (char digit : seed_text) {
        if (!((digit >= '0' && digit <= '9') || (digit >= 'a' && digit <= 'f'))) {
            std::cerr << "Seed must have exactly 16 lowercase hexadecimal digits.\n";
            return 2;
        }
        const unsigned int nibble = digit <= '9'
            ? static_cast<unsigned int>(digit - '0')
            : static_cast<unsigned int>(digit - 'a' + 10);
        seed = (seed << 4) | nibble;
    }
    unsigned int count = 0;
    if (count_text.empty() || count_text.size() > 7) {
        std::cerr << "Draw count must be between 1 and 1000000.\n";
        return 2;
    }
    for (char digit : count_text) {
        if (digit < '0' || digit > '9') {
            std::cerr << "Draw count must be decimal digits.\n";
            return 2;
        }
        count = count * 10 + static_cast<unsigned int>(digit - '0');
    }
    if (count == 0 || count > 1000000) {
        std::cerr << "Draw count must be between 1 and 1000000.\n";
        return 2;
    }
    clank::TriFlowRng rng(seed);
    std::cout << std::hex << std::setfill('0');
    for (unsigned int i = 0; i < count; ++i) {
        std::cout << std::setw(16) << rng.next() << '\n';
    }
    return std::cout ? 0 : 1;
}
