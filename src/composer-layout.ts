import {
  composerUnits,
  type ComposerPart,
  type ComposerUnit,
} from "./composer-draft.js";
import { textWidth, truncateCells } from "./terminal-text.js";

export interface ComposerInputRowItem {
  /** The rendered label. Media labels may be clipped to fit the input width. */
  label: string;
  /** The index of the source composer unit. */
  index: number;
}

export interface ComposerInputLayout {
  /** All wrapped rows, before applying the cursor-following viewport. */
  rows: ComposerInputRowItem[][];
  /** The absolute row containing the cursor. */
  cursorRow: number;
  /** The first absolute row in visibleRows. */
  startRow: number;
  /** At most maxRows rows, scrolled to keep the cursor visible. */
  visibleRows: ComposerInputRowItem[][];
  /** The number of rows the input should occupy. */
  height: number;
}

interface RowState {
  items: ComposerInputRowItem[];
  width: number;
}

function safeWidth(width: number) {
  return Math.max(Math.floor(width), 1);
}

function safeRows(maxRows: number) {
  return Math.max(Math.floor(maxRows), 1);
}

function pushRow(rows: RowState[]) {
  rows.push({ items: [], width: 0 });
}

function appendUnit(
  rows: RowState[],
  unit: ComposerUnit,
  index: number,
  width: number
) {
  const labelWidth = textWidth(unit.label);
  let row = rows[rows.length - 1];

  // A media token is atomic. If it cannot fit on the current line, move it to
  // the next line; if it is wider than the input itself, clip it in place.
  if (row.items.length > 0 && row.width + labelWidth > width) {
    pushRow(rows);
    row = rows[rows.length - 1];
  }

  const available = Math.max(width - row.width, 1);
  const label = labelWidth > available
    ? truncateCells(unit.label, available)
    : unit.label;
  row.items.push({ label, index });
  row.width += textWidth(label);
  return rows.length - 1;
}

function isNewline(unit: ComposerUnit) {
  return unit.type === "text" && unit.label === "\n";
}

/**
 * Convert composer units into cell-aware rows and a cursor-following viewport.
 * Cursor offsets are unit offsets, so a media token always advances by one.
 */
export function getComposerInputLayout(
  parts: ComposerPart[],
  cursorOffset: number,
  width: number,
  maxRows = 5
): ComposerInputLayout {
  const inputWidth = safeWidth(width);
  const rowLimit = safeRows(maxRows);
  const units = composerUnits(parts);
  const rows: RowState[] = [{ items: [], width: 0 }];
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (isNewline(unit)) {
      appendUnit(rows, { type: "text", label: " " }, index, inputWidth);
      pushRow(rows);
    } else {
      appendUnit(rows, unit, index, inputWidth);
    }
  }
  // Every cursor position has a visible cell, including newlines and the end.
  appendUnit(rows, { type: "text", label: " " }, units.length, inputWidth);
  const safeCursor = Math.min(Math.max(Math.floor(cursorOffset), 0), units.length);
  const cursorRow = rows.findIndex((row) => row.items.some((item) => item.index === safeCursor));
  const startRow = Math.min(
    Math.max(cursorRow - rowLimit + 1, 0),
    Math.max(rows.length - rowLimit, 0)
  );
  const visibleRows = rows
    .slice(startRow, startRow + rowLimit)
    .map((row) => row.items);
  const allRows = rows.map((row) => row.items);

  return {
    rows: allRows,
    cursorRow,
    startRow,
    visibleRows,
    height: Math.max(visibleRows.length, 1),
  };
}
