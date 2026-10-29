# Quint Language Support

Language support for [Quint](https://quint-lang.org/) powered by
[`tree-sitter-quint`](https://github.com/LegacyCodeHQ/tree-sitter-quint).

The extension provides file detection, syntax highlighting, bracket matching,
automatic indentation, and a symbol outline for `.qnt` and `.quint` files.

## Development

In Zed's Extensions view, choose **Install Dev Extension** and select this
directory.

Run `node --test test/zed_extension_test.js` from the repository root to check
the extension. The test builds the exact grammar commit in `extension.toml` in
a temporary directory, compiles every Zed query against it, and checks error
highlighting on diagnostic fixtures. It requires that commit in local Git
history (CI checks out full history), npm, and a native build toolchain.

When changing queries, update the pin to a published grammar commit that supports
them, then rerun this test. Testing only the working grammar can hide stale pins.
