export function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function charWidth(char: string) {
  const code = char.codePointAt(0) || 0;
  if (
    code === 0 ||
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  ) {
    return 0;
  }

  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 2;
  }

  return 1;
}

export function textWidth(value: string) {
  return Array.from(value).reduce((width, char) => width + charWidth(char), 0);
}

export function truncateCells(value: string, max: number) {
  const text = singleLine(value);
  if (max <= 0) return "";
  if (textWidth(text) <= max) return text;
  if (max <= 1) return "…";

  let width = 0;
  let result = "";
  for (const char of Array.from(text)) {
    const next = width + charWidth(char);
    if (next > max - 1) break;
    result += char;
    width = next;
  }

  return `${result}…`;
}

export function fillCells(value: string, width: number) {
  const clipped = truncateCells(value, width);
  return `${clipped}${" ".repeat(Math.max(width - textWidth(clipped), 0))}`;
}
