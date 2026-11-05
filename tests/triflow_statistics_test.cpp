#include "../src/triflow_rng.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <iomanip>
#include <iostream>

namespace {

template <std::size_t BucketCount>
double chi_square(const std::array<std::uint64_t, BucketCount>& counts,
                  double expected_count) {
    double statistic = 0.0;
    for (std::size_t i = 0; i < BucketCount; ++i) {
        const double difference =
            static_cast<double>(counts[i]) - expected_count;
        statistic += difference * difference / expected_count;
    }
    return statistic;
}

}  // namespace

int main() {
    const std::uint64_t seed = 0x0123456789ABCDEFULL;
    const std::size_t sample_count = 1000000;

    // These deliberately broad thresholds are smoke-test bounds, not
    // certification cutoffs or evidence of cryptographic quality.
    const double byte_chi_square_bound = 450.0;
    const double bit_balance_chi_square_bound = 64.0;
    const double transition_chi_square_bound = 40.0;

    std::array<std::uint64_t, 256> byte_counts = {{0}};
    std::array<std::uint64_t, 2> bit_counts = {{0, 0}};
    std::array<std::uint64_t, 4> transition_counts = {{0, 0, 0, 0}};
    clank::TriFlowRng rng(seed);
    std::uint64_t one_bit_count = 0;
    std::uint64_t previous_low_bit = 0;
    bool have_previous_value = false;

    for (std::size_t i = 0; i < sample_count; ++i) {
        const std::uint64_t value = rng.next();

        for (unsigned int byte_index = 0; byte_index < 8; ++byte_index) {
            const unsigned int shift = 8U * byte_index;
            const std::size_t byte_value =
                static_cast<std::size_t>((value >> shift) & 0xFFULL);
            ++byte_counts[byte_value];
        }

        for (unsigned int bit_index = 0; bit_index < 64; ++bit_index) {
            one_bit_count += (value >> bit_index) & 1ULL;
        }

        const std::uint64_t low_bit = value & 1ULL;
        if (have_previous_value) {
            const std::size_t transition =
                static_cast<std::size_t>((previous_low_bit << 1) | low_bit);
            ++transition_counts[transition];
        }
        previous_low_bit = low_bit;
        have_previous_value = true;
    }

    const std::uint64_t total_byte_count =
        static_cast<std::uint64_t>(sample_count) * 8U;
    const std::uint64_t total_bit_count =
        static_cast<std::uint64_t>(sample_count) * 64U;
    const std::uint64_t transition_count =
        static_cast<std::uint64_t>(sample_count - 1);
    bit_counts[0] = total_bit_count - one_bit_count;
    bit_counts[1] = one_bit_count;

    const double expected_bytes_per_bucket =
        static_cast<double>(total_byte_count) / byte_counts.size();
    const double byte_chi_square =
        chi_square(byte_counts, expected_bytes_per_bucket);
    const double expected_bits_per_value =
        static_cast<double>(total_bit_count) / bit_counts.size();
    const double bit_balance_chi_square =
        chi_square(bit_counts, expected_bits_per_value);
    const double expected_transitions_per_bucket =
        static_cast<double>(transition_count) / transition_counts.size();
    const double transition_chi_square =
        chi_square(transition_counts, expected_transitions_per_bucket);

    const std::uint64_t min_byte_count =
        *std::min_element(byte_counts.begin(), byte_counts.end());
    const std::uint64_t max_byte_count =
        *std::max_element(byte_counts.begin(), byte_counts.end());
    const bool byte_check_passed =
        byte_chi_square <= byte_chi_square_bound;
    const bool bit_balance_check_passed =
        bit_balance_chi_square <= bit_balance_chi_square_bound;
    const bool transition_check_passed =
        transition_chi_square <= transition_chi_square_bound;

    std::cout << "TriFlow deterministic statistical smoke test\n"
              << "Seed: 0x0123456789ABCDEF; outputs: " << sample_count
              << " (64-bit each)\n"
              << "Byte frequencies: " << total_byte_count
              << " bytes across 256 byte values; expected "
              << expected_bytes_per_bucket << " per value; chi-square="
              << std::fixed << std::setprecision(4) << byte_chi_square
              << ", upper smoke bound=" << byte_chi_square_bound
              << ", observed bucket range=[" << min_byte_count << ", "
              << max_byte_count << "] -> "
              << (byte_check_passed ? "PASS" : "FAIL") << '\n'
              << "Bit balance: ones=" << one_bit_count << " of "
              << total_bit_count << " bits; one fraction="
              << std::setprecision(8)
              << static_cast<double>(one_bit_count) / total_bit_count
              << "; chi-square=" << std::setprecision(4)
              << bit_balance_chi_square
              << ", upper smoke bound=" << bit_balance_chi_square_bound
              << " -> " << (bit_balance_check_passed ? "PASS" : "FAIL")
              << '\n'
              << "Adjacent-output low-bit transitions: " << transition_count
              << " pairs (00=" << transition_counts[0]
              << ", 01=" << transition_counts[1]
              << ", 10=" << transition_counts[2]
              << ", 11=" << transition_counts[3]
              << "); chi-square=" << transition_chi_square
              << ", upper smoke bound=" << transition_chi_square_bound
              << " -> " << (transition_check_passed ? "PASS" : "FAIL")
              << '\n'
              << "Caveat: these fixed-seed checks are basic smoke tests, not "
                 "statistical certification. The bounds are deliberately "
                 "broad; adjacent transition pairs overlap, and passing one "
                 "sample does not prove randomness, uniformity, independence, "
                 "or cryptographic security. TriFlow is a deterministic PRNG, "
                 "not a true-random source.\n";

    return byte_check_passed && bit_balance_check_passed &&
                   transition_check_passed
               ? 0
               : 1;
}
