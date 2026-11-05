#include "../src/triflow_rng.hpp"

#include <chrono>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <random>

namespace {

typedef std::chrono::steady_clock Clock;

const std::uint64_t kOutputCount = 5000000ULL;
const std::uint64_t kSeed = 0x434C414E4B5F5345ULL;

struct BenchmarkResult {
    std::int64_t elapsed_nanoseconds;
    std::uint64_t checksum;
};

template <typename Generator>
BenchmarkResult run_benchmark(Generator& generator) {
    std::uint64_t checksum = 14695981039346656037ULL;
    const Clock::time_point start = Clock::now();

    for (std::uint64_t i = 0; i < kOutputCount; ++i) {
        const std::uint64_t output =
            static_cast<std::uint64_t>(generator());
        checksum = (checksum ^ output) * 1099511628211ULL;
    }

    const Clock::time_point finish = Clock::now();
    const std::chrono::nanoseconds elapsed =
        std::chrono::duration_cast<std::chrono::nanoseconds>(finish - start);

    BenchmarkResult result = {
        static_cast<std::int64_t>(elapsed.count()),
        checksum
    };
    return result;
}

void print_result(const char* name, const BenchmarkResult& result) {
    const double nanoseconds_per_output =
        static_cast<double>(result.elapsed_nanoseconds) /
        static_cast<double>(kOutputCount);

    std::cout << name
              << ": outputs=" << kOutputCount
              << ", elapsed_ns=" << result.elapsed_nanoseconds
              << ", ns/output=" << std::fixed << std::setprecision(2)
              << nanoseconds_per_output
              << ", checksum=0x" << std::hex << result.checksum << std::dec
              << '\n';
}

}  // namespace

int main() {
    clank::TriFlowRng triflow(kSeed);
    std::mt19937_64 mt19937_64(kSeed);

    const BenchmarkResult triflow_result = run_benchmark(triflow);
    const BenchmarkResult mt19937_result = run_benchmark(mt19937_64);

    print_result("TriFlow", triflow_result);
    print_result("std::mt19937_64", mt19937_result);
    return 0;
}
