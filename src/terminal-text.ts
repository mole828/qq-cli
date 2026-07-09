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

export function wrapCells(value: string, max: number, maxLines: number) {
  const text = singleLine(value);
  if (max <= 0 || maxLines <= 0) return [];
  if (!text) return [""];

  const lines: string[] = [];
  let line = "";
  let width = 0;

  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const next = width + charWidth(char);
    if (next > max && line) {
      lines.push(line);
      line = "";
      width = 0;
      if (lines.length === maxLines) {
        const remaining = chars.slice(i).join("");
        lines[lines.length - 1] = truncateCells(
          `${lines[lines.length - 1]}${remaining}`,
          max
        );
        return lines;
      }
    }
    line += char;
    width += charWidth(char);
  }

  if (line || lines.length === 0) lines.push(line);
  if (lines.length > maxLines) {
    return [
      ...lines.slice(0, maxLines - 1),
      truncateCells(lines.slice(maxLines - 1).join(""), max),
    ];
  }
  return lines;
}

export function fillCells(value: string, width: number) {
  const clipped = truncateCells(value, width);
  return `${clipped}${" ".repeat(Math.max(width - textWidth(clipped), 0))}`;
}

const osc = "\u001B]";
const stringTerminator = "\u001B\\";
const blue = "\u001B[34m";
const defaultForeground = "\u001B[39m";

export function isWebUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function terminalLink(label: string, url: string, color = false) {
  const text = color ? `${blue}${label}${defaultForeground}` : label;
  return `${osc}8;;${url}${stringTerminator}${text}${osc}8;;${stringTerminator}`;
}

export function linkifyUrls(value: string) {
  const hyperlink = /\u001B\]8;;[^\u001B]*\u001B\\[\s\S]*?\u001B\]8;;\u001B\\/g;
  let offset = 0;
  let output = "";

  for (const match of value.matchAll(hyperlink)) {
    output += linkifyPlainUrls(value.slice(offset, match.index));
    output += match[0];
    offset = (match.index || 0) + match[0].length;
  }

  return output + linkifyPlainUrls(value.slice(offset));
}

function linkifyPlainUrls(value: string) {
  return value.replace(/https?:\/\/[^\s"'\u001B\u0007]+/g, (url) =>
    isWebUrl(url) ? terminalLink(url, url) : url
  );
}
