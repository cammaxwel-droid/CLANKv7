#include "../src/seed_experiments.hpp"
#include "../src/triflow_rng.hpp"

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

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

void print_hex(std::uint64_t value) {
    std::cout << "0x" << std::hex << std::setw(16) << std::setfill('0')
              << value << std::dec;
}

}  // namespace

int main(int argc, char* argv[]) {
    const bool vectors = argc == 2 && std::string(argv[1]) == "--vectors";
    require(argc == 1 || vectors, "usage: seed_experiments_test [--vectors]");
    const std::uint64_t default_seed = 0x0123456789ABCDEFULL;
    const std::uint64_t maximum = ~std::uint64_t(0);
    const std::uint64_t expected[][8] = {
        {0x0000000000000000ULL, 0x434C414E4B5F5131ULL,
         0x0000000000000000ULL, 0x7F72B57671BF4B3FULL,
         0x0000000000000000ULL, 0xE7CE52955DC28111ULL,
         0x0000000000000000ULL, 0x3CCBF1EE930B70A5ULL},
        {0x0123456789ABCDEFULL, 0xFDBB4AC6F6F06962ULL,
         0xDC77883254FF00BAULL, 0x88E462DD52A01FF9ULL,
         0x88BDFBE23F6B01B9ULL, 0x37516352E034735FULL,
         0xA8D35BE6AAA0CEF6ULL, 0x06B5D9E06E389A7AULL},
        {0xFFFFFFFFFFFFFFFFULL, 0x434C414E4B5F5132ULL,
         0xFFFFFFFFFFFFFFFFULL, 0x7F72B37671B94B3CULL,
         0x0000000000000000ULL, 0x8DEEA62835428112ULL,
         0x0000000000000000ULL, 0x1D64015B544AC511ULL}
    };
    const std::uint64_t golden_seeds[] = {0, default_seed, maximum};
    for (std::size_t index = 0; index < 3; ++index) {
        for (unsigned int mask = 0; mask < 8; ++mask) {
            require(clank::experimental_seed(golden_seeds[index], options(mask))
                    == expected[index][mask], "seed equation vector must stay stable");
        }
    }
    require(clank::experimental_seed(default_seed) == default_seed,
            "no options must preserve the seed");
    require(clank::experimental_seed(0, options(4))
            == clank::experimental_seed(maximum, options(4)),
            "documented cross-feed collision must remain visible");

    const std::uint64_t base_seeds[] = {
        0, maximum - 1, default_seed, maximum, 0xAAAAAAAAAAAAAAAAULL,
        0x5555555555555555ULL, 0x0020000000000001ULL, 0xFFFFFFFF00000000ULL
    };
    std::vector<std::uint64_t> seeds(base_seeds, base_seeds + 8);
    for (unsigned int bit = 0; bit < 64; ++bit) {
        seeds.push_back(std::uint64_t(1) << bit);
    }
    for (std::size_t index = 0; index < seeds.size(); ++index) {
        const std::uint64_t seed = seeds[index];
        for (unsigned int mask = 0; mask < 8; ++mask) {
            const std::uint64_t effective = clank::experimental_seed(seed, options(mask));
            std::uint64_t composed = seed;
            for (unsigned int flag = 1; flag <= 4; flag <<= 1) {
                if ((mask & flag) != 0) {
                    composed = clank::experimental_seed(composed, options(flag));
                }
            }
            require(effective == composed, "enabled stages must compose in fixed order");
            clank::TriFlowRng first(effective);
            clank::TriFlowRng replay(effective);
            clank::TriFlowRng original(seed);
            if (vectors) {
                print_hex(seed);
                std::cout << ' ' << mask << ' ';
                print_hex(effective);
            }
            for (unsigned int sample = 0; sample < 64; ++sample) {
                const std::uint64_t value = first.next();
                require(value == replay.next(), "same seed and options must replay");
                if (mask == 0) {
                    require(value == original.next(), "disabled experiments must preserve the original stream");
                }
                if (vectors) {
                    std::cout << ' ';
                    print_hex(value);
                }
            }
            if (vectors) {
                std::cout << '\n';
            }
        }
    }
    if (!vectors) {
        std::cout << "Seed experiments passed: 24 golden seed vectors, 576 replay profiles,\n"
                  << "disabled-stage compatibility, stage order, and a documented collision.\n"
                  << "These equations do not create entropy or certify output quality.\n";
    }
}
