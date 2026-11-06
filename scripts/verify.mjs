// Portable npm entry point; reuse the existing Python/C++ verification driver.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.platform === "win32"
    ? [process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
       ["/d", "/c", "scripts\\verify.cmd --typescript"]]
    : [process.env.CLANK_PYTHON ?? "python3", ["-I", "-B", "scripts/verify.py", "--typescript"]];
const result = spawnSync(command[0], command[1], { cwd: root, stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
