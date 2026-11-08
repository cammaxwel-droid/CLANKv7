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

// Repair the lossy experimental path by undoing the enabled stages in reverse
// order and then tagging the exact loose end being repaired with a generation-
// anchored 64-bit PRNG tail. This stays local to the experimental wrapper and
// does not change the original generator stream.
inline std::uint64_t invert_seed_experiment(
    std::uint64_t seed, const SeedExperiments& options = SeedExperiments()) noexcept {
    if (options.quadratic_bend) {
        const std::uint64_t constant = 0x434C414E4B5F5131ULL;
        std::uint64_t candidate = seed - constant;
        candidate = candidate - 2ULL * candidate * candidate;
        seed = candidate;
    }
    if (options.rotate_fold) {
        seed = seed ^ seed_detail::rotate_left(seed, 17)
                    ^ seed_detail::rotate_left(seed, 41);
    }
    if (options.cross_feed) {
        seed = seed - seed_detail::rotate_left(seed, 23)
                    * (seed_detail::rotate_left(seed, 47) | 1ULL);
    }
    return seed;
}

inline std::uint64_t generation_rng_tail(std::uint64_t generation) noexcept {
    std::uint64_t value = 0x9E3779B97F4A7C15ULL ^ (generation + 1ULL);
    value ^= seed_detail::rotate_left(value, 13) ^ seed_detail::rotate_left(value, 37);
    value ^= value >> 31;
    value *= 0xD1B54A35C8A8A0D1ULL;
    value ^= value >> 27;
    return value;
}

inline std::uint64_t experimental_seed_repaired(
    std::uint64_t seed,
    std::uint64_t generation,
    const SeedExperiments& options = SeedExperiments()) noexcept {
    std::uint64_t repaired = experimental_seed(seed, options);
    repaired = invert_seed_experiment(repaired, options);
    repaired ^= generation_rng_tail(generation);
    repaired ^= seed_detail::rotate_left(repaired, 31) ^ seed_detail::rotate_left(repaired, 17);
    return repaired;
}

}  // namespace clank

#endif
