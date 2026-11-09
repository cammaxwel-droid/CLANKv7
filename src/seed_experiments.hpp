#ifndef CLANK_SEED_EXPERIMENTS_HPP
#define CLANK_SEED_EXPERIMENTS_HPP

#include <cstdint>
#include <stdexcept>

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

inline std::uint32_t cross_mix(std::uint32_t value,
                               std::uint32_t multiplier,
                               unsigned int distance) noexcept {
    // Widen explicitly so uint32_t integer promotions cannot make multiplication
    // signed on implementations whose int is wider than 32 bits.
    const std::uint64_t wide = value;
    const std::uint32_t rotated =
        static_cast<std::uint32_t>((wide << distance) | (wide >> (32U - distance)));
    return static_cast<std::uint32_t>(wide * multiplier + rotated);
}

inline std::uint64_t cross_feed(std::uint64_t seed, bool inverse) noexcept {
    std::uint32_t left = static_cast<std::uint32_t>(seed >> 32);
    std::uint32_t right = static_cast<std::uint32_t>(seed);
    if (inverse) {
        right ^= cross_mix(left, 0xD42E90F5U, 13);
        left ^= cross_mix(right, 0xA6C5928BU, 7);
    } else {
        left ^= cross_mix(right, 0xA6C5928BU, 7);
        right ^= cross_mix(left, 0xD42E90F5U, 13);
    }
    return (static_cast<std::uint64_t>(left) << 32) | right;
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

// Invert the original reversible stages. The original Cross-feed discards
// information and cannot be inverted from its output alone.
inline std::uint64_t invert_seed_experiment(
    std::uint64_t seed, const SeedExperiments& options = SeedExperiments()) {
    if (options.cross_feed) {
        throw std::invalid_argument("Original Cross-feed is lossy; use chain_seed and invert_chain_seed.");
    }
    if (options.rotate_fold) {
        // F^8 = I, so F^-1 = F * F^2 * F^4 for F = I XOR R17 XOR R41.
        for (unsigned int power = 1; power <= 4; power <<= 1) {
            seed ^= seed_detail::rotate_left(seed, (17U * power) % 64U)
                  ^ seed_detail::rotate_left(seed, (41U * power) % 64U);
        }
    }
    if (options.quadratic_bend) {
        const std::uint64_t target = seed - 0x434C414E4B5F5131ULL;
        std::uint64_t candidate = target;
        // Matching parity adds at least two correct low bits per iteration.
        for (unsigned int round = 0; round < 32; ++round) {
            candidate = target - 2ULL * candidate * candidate;
        }
        seed = candidate;
    }
    return seed;
}

// chain-seed-v2 uses a reversible replacement for the original Cross-feed.
inline std::uint64_t chain_seed(
    std::uint64_t seed, const SeedExperiments& options = SeedExperiments()) noexcept {
    const SeedExperiments reversible(options.quadratic_bend, options.rotate_fold, false);
    seed = experimental_seed(seed, reversible);
    if (options.cross_feed) seed = seed_detail::cross_feed(seed, false);
    return seed;
}

inline std::uint64_t invert_chain_seed(
    std::uint64_t seed, const SeedExperiments& options = SeedExperiments()) {
    if (options.cross_feed) seed = seed_detail::cross_feed(seed, true);
    const SeedExperiments reversible(options.quadratic_bend, options.rotate_fold, false);
    return invert_seed_experiment(seed, reversible);
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
    // Preserve the original seed through a permutation before adding generation.
    // This intentionally replaces the broken Chain 0.6.1 wrapper sequence.
    std::uint64_t repaired = chain_seed(seed, options);
    repaired ^= generation_rng_tail(generation);
    repaired ^= seed_detail::rotate_left(repaired, 31) ^ seed_detail::rotate_left(repaired, 17);
    return repaired;
}

}  // namespace clank

#endif
