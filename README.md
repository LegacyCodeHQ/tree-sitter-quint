# Tree-sitter Quint

[![Built with Clarity](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FLegacyCodeHQ%2Fclarity-cli%2Frefs%2Fheads%2Fmain%2Fbadges%2Fshields.io.json)](https://github.com/LegacyCodeHQ/clarity-cli)
[![License](https://img.shields.io/github/license/LegacyCodeHQ/tree-sitter-quint)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@legacycodehq/tree-sitter-quint)](https://www.npmjs.com/package/@legacycodehq/tree-sitter-quint)

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for the
[Quint specification language](https://quint-lang.org/).

Package versions track Quint compiler releases directly. Version `0.32.0`
supports Quint `0.32.0`.

## Installation

```sh
npm install tree-sitter @legacycodehq/tree-sitter-quint
```

## Usage

```js
import Parser from "tree-sitter";
import Quint from "@legacycodehq/tree-sitter-quint";

const parser = new Parser();
parser.setLanguage(Quint);

const tree = parser.parse("module Example {}");
console.log(tree.rootNode.toString());
```

The package also includes Tree-sitter queries for syntax highlighting and local
reference resolution. Semantic checks such as types and modes remain the
responsibility of the Quint compiler.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development, testing, and release
instructions.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

Copyright (c) 2026-present, Legacy Code Headquarters (OPC) Private Limited. All
rights reserved.
