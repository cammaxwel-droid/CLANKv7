// Internal arithmetic. Only index.ts defines the public package API.
export function uint64(value: bigint): bigint {
    return BigInt.asUintN(64, value);
}

// All engine rotation distances are in 1..63.
export function rotateLeft(value: bigint, distance: bigint): bigint {
    return uint64((value << distance) | (value >> (64n - distance)));
}

export function mix64(value: bigint): bigint {
    value ^= value >> 30n;
    value = uint64(value * 0xe6d7102b5c9a3f17n);
    value ^= value >> 27n;
    value = uint64(value * 0xb3e4f1d7a6c5928bn);
    return value ^ (value >> 31n);
}

export function averageThree(a: bigint, b: bigint, c: bigint): bigint {
    // The sum can need 66 bits. Truncating before dividing changes the engine.
    return (a + b + c) / 3n;
}
