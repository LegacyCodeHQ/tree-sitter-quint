import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "quint-scanner-"));
try {
  for (const name of ["position", "recognizer", "scaling", "repeated", "index"]) {
    const executable = path.join(temporary, name);
    const runtime = "node_modules/tree-sitter/vendor/tree-sitter/lib";
    // glibc hides endian helpers and fdopen under strict C11 without this.
    const extra = name === "repeated" ? ["-D_DEFAULT_SOURCE", "-I", `${runtime}/include`, "-I", `${runtime}/src`,
      `${runtime}/src/lib.c`, "src/parser.c"] : [];
    const compile = spawnSync(process.env.CC || "cc", ["-std=c11", "-O2", "-I", "src",
      `test/scanner/${name}_test.c`, ...extra, "-o", executable], { cwd: root, stdio: "inherit" });
    assert.equal(compile.status, 0, compile.error?.message || "scanner test compilation failed");
    const fixtures = name === "repeated" ? readdirSync(path.join(root, "test/fixtures"))
      .filter(file => file.endsWith(".qnt")).map(file => path.join(root, "test/fixtures", file)) : [];
    const result = spawnSync(executable, fixtures, { stdio: "inherit" });
    assert.equal(result.status, 0, result.error?.message || "scanner position check failed");
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
