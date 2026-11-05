#include "../examples/example_utils.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

}  // namespace

int main() {
    const std::uint64_t seed = 0xD1CEB00B5EED1234ULL;
    const std::size_t sample_count = 60000;
    const std::uint64_t bound = 6;
    std::array<std::uint32_t, 6> counts = {{0}};
    clank::TriFlowRng first(seed);
    clank::TriFlowRng replay(seed);

    require(clank_examples::bounded_sample(first, 1) == 0,
            "a bound of one must always return zero");
    require(clank_examples::bounded_sample(replay, 1) == 0,
            "same seed must reproduce a bound-one sample");

    for (std::size_t i = 0; i < sample_count; ++i) {
        const std::uint64_t value = clank_examples::bounded_sample(first, bound);
        require(value < bound, "bounded samples must be inside [0, bound)");
        require(value == clank_examples::bounded_sample(replay, bound),
                "same seed must reproduce bounded samples");
        ++counts[static_cast<std::size_t>(value)];
    }

    for (std::size_t i = 0; i < counts.size(); ++i) {
        require(counts[i] >= 9500 && counts[i] <= 10500,
                "fixed-seed six-way histogram should pass broad smoke bounds");
    }

    bool zero_bound_threw = false;
    try {
        clank::TriFlowRng rng(seed);
        clank_examples::bounded_sample(rng, 0);
    } catch (const std::invalid_argument&) {
        zero_bound_threw = true;
    }
    require(zero_bound_threw, "a zero bound must be rejected explicitly");

    std::cout << "Bounded-sampling smoke checks passed; six-way counts: ";
    for (std::size_t i = 0; i < counts.size(); ++i) {
        std::cout << (i == 0 ? "" : ", ") << counts[i];
    }
    std::cout << ". These broad checks are not a statistical certification.\n";
}
