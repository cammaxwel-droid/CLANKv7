#ifndef CLANK_EXAMPLE_UTILS_HPP
#define CLANK_EXAMPLE_UTILS_HPP

#include "../src/triflow_rng.hpp"

#include <stdexcept>

namespace clank_examples {

inline clank::TriFlowRng::result_type bounded_sample(
    clank::TriFlowRng& rng,
    clank::TriFlowRng::result_type bound) {
    if (bound == 0) {
        throw std::invalid_argument("bounded_sample requires a non-zero bound");
    }

    const clank::TriFlowRng::result_type threshold =
        (clank::TriFlowRng::result_type(0) - bound) % bound;
    for (;;) {
        const clank::TriFlowRng::result_type value = rng.next();
        if (value >= threshold) {
            return value % bound;
        }
    }
}

}  // namespace clank_examples

#endif
