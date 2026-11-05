#ifndef CLANK_TRIFLOW_RNG_HPP
#define CLANK_TRIFLOW_RNG_HPP

#include <cstdint>

namespace clank {

class TriFlowRng {
public:
    typedef std::uint64_t result_type;

    explicit TriFlowRng(result_type seed_value) noexcept {
        seed(seed_value);
    }

    void seed(result_type seed_value) noexcept {
        lane_a_ = seed_value ^ 0x434C414E4B5F4131ULL;
        lane_b_ = rotate_left(seed_value + 0x434C414E4B5F4232ULL, 21);
        lane_c_ = rotate_left(seed_value ^ 0x434C414E4B5F4333ULL, 43);
        calls_ = 0;
    }

    result_type next() noexcept {
        lane_a_ += 0xE6D7102B5C9A3F17ULL;
        lane_b_ += 0xB3E4F1D7A6C5928BULL;
        lane_c_ += 0xC8A35167D42E90F5ULL;
        ++calls_;

        const result_type a = mix(lane_a_ ^ rotate_left(lane_c_, 11));
        const result_type b = mix(lane_b_ ^ rotate_left(lane_a_, 27));
        const result_type c = mix(lane_c_ ^ rotate_left(lane_b_, 45));
        const result_type mean = average_three(a, b, c);
        const result_type braid =
            a ^ rotate_left(b, 17) ^ rotate_left(c, 39);

        return mix(mean ^ braid ^ calls_);
    }

    result_type operator()() noexcept {
        return next();
    }

private:
    result_type lane_a_;
    result_type lane_b_;
    result_type lane_c_;
    result_type calls_;

    static result_type rotate_left(result_type value,
                                   unsigned int distance) noexcept {
        return (value << distance) | (value >> (64U - distance));
    }

    static result_type mix(result_type value) noexcept {
        value ^= value >> 30;
        value *= 0xE6D7102B5C9A3F17ULL;
        value ^= value >> 27;
        value *= 0xB3E4F1D7A6C5928BULL;
        value ^= value >> 31;
        return value;
    }

    static result_type average_three(result_type a,
                                     result_type b,
                                     result_type c) noexcept {
        const result_type whole = a / 3 + b / 3 + c / 3;
        const result_type remainder = a % 3 + b % 3 + c % 3;
        return whole + remainder / 3;
    }
};

}  // namespace clank

#endif
