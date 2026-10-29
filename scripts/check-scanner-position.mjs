import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "quint-scanner-"));
try {
  for (const name of ["position", "recognizer"]) {
    const executable = path.join(temporary, name);
    const compile = spawnSync(process.env.CC || "cc", ["-std=c11", "-O2", "-I", "src",
      `test/scanner/${name}_test.c`, "-o", executable], { cwd: root, stdio: "inherit" });
    assert.equal(compile.status, 0, compile.error?.message || "scanner test compilation failed");
    const result = spawnSync(executable, [], { stdio: "inherit" });
    assert.equal(result.status, 0, result.error?.message || "scanner position check failed");
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
