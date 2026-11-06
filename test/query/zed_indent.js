import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "tree-sitter";
import Quint from "../../bindings/node/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const INDENT_UNIT = 2;

const compare = (a, b) => a.row - b.row || a.column - b.column;
const point = ({ row, column }) => ({ row, column });

// A port of Zed's `suggest_autoindents` (crates/language/src/buffer.rs): Zed queries `indents.scm`
// only over the previous non-blank row and the new row, merges `@indent` ranges that start at the
// same point, lets every `@outdent` capture truncate the innermost range containing it, and then
// indents a row relative to the previous one. Returns the column Zed would indent the row to when
// Enter is pressed at the end of `afterLine` (1-based).
export function indentAfterEnter(source, afterLine, queryName = "indents.scm") {
  const lines = source.split("\n");
  const indentOf = (line) => line.length - line.trimStart().length;
  lines.splice(afterLine, 0, "");
  const parser = new Parser();
  parser.setLanguage(Quint);
  const tree = parser.parse(lines.join("\n"));
  const query = new Parser.Query(
    Quint,
    readFileSync(join(projectRoot, "queries", queryName)),
  );

  const newRow = afterLine;
  const previousRow = newRow - 1;
  const window = {
    startPosition: { row: previousRow, column: 0 },
    endPosition: { row: newRow + 1, column: 0 },
  };
  const ranges = [];
  const outdents = [];
  for (const match of query.matches(tree.rootNode, window)) {
    let start = null;
    let end = null;
    for (const { name, node } of match.captures) {
      if (name === "indent") {
        start ??= point(node.startPosition);
        end ??= point(node.endPosition);
      } else if (name === "outdent") {
        outdents.push(point(node.startPosition));
      }
    }
    if (!start || !end || start.row === end.row) continue;
    const existing = ranges.find((range) => compare(range.start, start) === 0);
    if (existing) {
      if (compare(end, existing.end) > 0) existing.end = end;
    } else {
      ranges.push({ start, end });
      ranges.sort((a, b) => compare(a.start, b.start));
    }
  }
  outdents.sort(compare);
  for (const outdent of outdents) {
    const containing = ranges.filter(
      (range) => compare(range.start, outdent) <= 0 && compare(outdent, range.end) < 0,
    );
    if (containing.length) containing[containing.length - 1].end = outdent;
  }

  const rowStart = { row: newRow, column: 0 };
  const previousStart = { row: previousRow, column: 0 };
  let indentFromPrevious = false;
  let outdentToRow = Infinity;
  for (const range of ranges) {
    if (range.start.row >= newRow) break;
    if (range.start.row === previousRow && compare(range.end, rowStart) > 0) {
      indentFromPrevious = true;
    }
    if (compare(range.end, previousStart) > 0 && compare(range.end, rowStart) <= 0) {
      outdentToRow = Math.min(outdentToRow, range.start.row);
    }
  }
  if (outdentToRow === previousRow) return indentOf(lines[previousRow]);
  if (indentFromPrevious) return indentOf(lines[previousRow]) + INDENT_UNIT;
  if (outdentToRow < previousRow) return indentOf(lines[outdentToRow]);
  return indentOf(lines[previousRow]);
}
