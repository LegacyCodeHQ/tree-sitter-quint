# Tree-sitter Quint

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
