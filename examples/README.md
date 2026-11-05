The first runnable example is [`triflow_demo.cpp`](triflow_demo.cpp), which
prints eight reproducible outputs for a fixed seed. Build it from the
repository root with:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic examples/triflow_demo.cpp -o triflow_demo
./triflow_demo
```

The project is not ready for key generation or live gambling. See the
[design notes](../docs/triflow-design.md).
