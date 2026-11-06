#ifndef CLANK_SEED_EXPERIMENTS_HPP
#define CLANK_SEED_EXPERIMENTS_HPP

#include <cstdint>

namespace clank {

struct SeedExperiments {
    bool quadratic_bend;
    bool rotate_fold;
    bool cross_feed;

    explicit SeedExperiments(bool quadratic = false, bool fold = false,
                             bool cross = false) noexcept
        : quadratic_bend(quadratic), rotate_fold(fold), cross_feed(cross) {}
};

namespace seed_detail {

inline std::uint64_t rotate_left(std::uint64_t value,
                                 unsigned int distance) noexcept {
    return (value << distance) | (value >> (64U - distance));
}

}  // namespace seed_detail

// Optional seed preprocessing only; these equations do not add entropy.
inline std::uint64_t experimental_seed(
    std::uint64_t seed, const SeedExperiments& options = SeedExperiments()) noexcept {
    if (options.quadratic_bend) {
        seed = seed + 2ULL * seed * seed + 0x434C414E4B5F5131ULL;
    }
    if (options.rotate_fold) {
        seed = seed ^ seed_detail::rotate_left(seed, 17)
                    ^ seed_detail::rotate_left(seed, 41);
    }
    if (options.cross_feed) {
        seed = seed + seed_detail::rotate_left(seed, 23)
                    * (seed_detail::rotate_left(seed, 47) | 1ULL);
    }
    return seed;
}

}  // namespace clank

#endif
