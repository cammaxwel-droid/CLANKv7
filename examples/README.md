The examples use explicit fixed seeds so each program repeats its output.
`triflow_demo.cpp` prints eight raw outputs; `dice_demo.cpp` rolls eight
six-sided dice; `pokie_demo.cpp` prints a few toy reel spins. The latter is a
programming demo, not live gambling advice.

The dice and reel examples use [`example_utils.hpp`](example_utils.hpp), which
uses rejection sampling to avoid adding modulo-remainder bias when mapping a
uniform 64-bit value to a bounded range. This does not prove TriFlow's output
is uniform. The helper throws an exception for a zero bound because that input
has no valid output range.

Build and run from the repository root:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic examples/triflow_demo.cpp -o triflow_demo
./triflow_demo
g++ -std=c++11 -Wall -Wextra -Wpedantic examples/dice_demo.cpp -o dice_demo
./dice_demo
g++ -std=c++11 -Wall -Wextra -Wpedantic examples/pokie_demo.cpp -o pokie_demo
./pokie_demo
```

These educational examples do not establish suitability for live gambling,
key generation, or security-sensitive applications. See the
[design notes](../docs/triflow-design.md).
