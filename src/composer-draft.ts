import type { ImageAttachment } from "./clipboard-image.js";
import type { StickerItem } from "./types.js";

export type ComposerPart =
  | { type: "text"; text: string }
  | { type: "face"; sticker: StickerItem }
  | { type: "at"; qq: string; label: string }
  | { type: "image"; attachment: ImageAttachment };

export interface ComposerUnit {
  type: ComposerPart["type"];
  label: string;
}

export function emptyComposerParts(): ComposerPart[] {
  return [{ type: "text", text: "" }];
}

export function composerText(parts: ComposerPart[]) {
  return parts
    .filter((part): part is Extract<ComposerPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function composerUnits(parts: ComposerPart[]): ComposerUnit[] {
  return parts.flatMap<ComposerUnit>((part) => {
    if (part.type === "text") {
      return Array.from(part.text, (label) => ({ type: "text" as const, label }));
    }
    return [{
      type: part.type,
      label:
        part.type === "face"
          ? "[face]"
          : part.type === "at"
          ? `@${part.label}`
          : "[image]",
    }];
  });
}

export function composerDisplayText(parts: ComposerPart[]) {
  return composerUnits(parts).map((unit) => unit.label).join("");
}

export function composerLength(parts: ComposerPart[]) {
  return composerUnits(parts).length;
}

export function composerImages(parts: ComposerPart[]) {
  return parts.flatMap((part) => part.type === "image" ? [part.attachment] : []);
}

function normalizeParts(parts: ComposerPart[]) {
  const normalized: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text" && part.text.length === 0) continue;
    const previous = normalized[normalized.length - 1];
    if (part.type === "text" && previous?.type === "text") {
      normalized[normalized.length - 1] = {
        type: "text",
        text: previous.text + part.text,
      };
    } else {
      normalized.push(part);
    }
  }
  return normalized.length > 0 ? normalized : emptyComposerParts();
}

function splitAt(parts: ComposerPart[], offset: number) {
  const left: ComposerPart[] = [];
  const right: ComposerPart[] = [];
  let remaining = Math.max(offset, 0);
  let split = false;

  for (const part of parts) {
    if (split) {
      right.push(part);
      continue;
    }

    const length = part.type === "text" ? Array.from(part.text).length : 1;
    if (remaining >= length) {
      left.push(part);
      remaining -= length;
      continue;
    }

    split = true;
    if (part.type === "text") {
      const chars = Array.from(part.text);
      left.push({ type: "text", text: chars.slice(0, remaining).join("") });
      right.push({ type: "text", text: chars.slice(remaining).join("") });
    } else {
      right.push(part);
    }
  }

  return { left, right };
}

export interface ComposerInlineTrigger {
  start: number;
  end: number;
  query: string;
}

function isWordUnit(unit: ComposerUnit | undefined) {
  return unit?.type === "text" && /[\p{L}\p{N}_]/u.test(unit.label);
}

export function getComposerInlineTrigger(
  parts: ComposerPart[],
  offset: number
): ComposerInlineTrigger | null {
  const units = composerUnits(parts);
  const cursor = Math.min(Math.max(offset, 0), units.length);
  let runStart = cursor;

  while (runStart > 0) {
    const unit = units[runStart - 1];
    if (unit.type !== "text" || /\s/u.test(unit.label)) break;
    runStart -= 1;
  }

  const fragment = units.slice(runStart, cursor).map((unit) => unit.label).join("");
  const atOffset = fragment.lastIndexOf("@");
  if (atOffset < 0) return null;

  const start = runStart + atOffset;
  if (isWordUnit(units[start - 1])) return null;

  return {
    start,
    end: cursor,
    query: fragment.slice(atOffset + 1),
  };
}

export function insertComposerPart(
  parts: ComposerPart[],
  offset: number,
  part: Exclude<ComposerPart, { type: "text" }>
) {
  const cursor = Math.min(Math.max(offset, 0), composerLength(parts));
  const { left, right } = splitAt(parts, cursor);
  const nextParts = normalizeParts([...left, part, ...right]);
  return { parts: nextParts, cursor: cursor + 1 };
}

export function replaceComposerPart(
  parts: ComposerPart[],
  start: number,
  end: number,
  part: Exclude<ComposerPart, { type: "text" }>
) {
  const safeStart = Math.min(Math.max(start, 0), composerLength(parts));
  const safeEnd = Math.min(Math.max(end, safeStart), composerLength(parts));
  const first = splitAt(parts, safeStart);
  const second = splitAt(first.right, safeEnd - safeStart);
  const nextParts = normalizeParts([...first.left, part, ...second.right]);
  return { parts: nextParts, cursor: safeStart + 1 };
}

export function insertComposerText(
  parts: ComposerPart[],
  offset: number,
  text: string
) {
  if (!text) return { parts, cursor: Math.min(offset, composerLength(parts)) };

  const cursor = Math.min(Math.max(offset, 0), composerLength(parts));
  const { left, right } = splitAt(parts, cursor);
  const nextParts = normalizeParts([
    ...left,
    { type: "text", text },
    ...right,
  ]);
  return { parts: nextParts, cursor: cursor + Array.from(text).length };
}

function removeRange(parts: ComposerPart[], start: number, end: number) {
  const first = splitAt(parts, start);
  const second = splitAt(first.right, Math.max(end - start, 0));
  return normalizeParts([...first.left, ...second.right]);
}

export function deleteComposerBefore(parts: ComposerPart[], offset: number) {
  const cursor = Math.min(Math.max(offset, 0), composerLength(parts));
  if (cursor === 0) return { parts, cursor };
  return {
    parts: removeRange(parts, cursor - 1, cursor),
    cursor: cursor - 1,
  };
}

export function deleteComposerAt(parts: ComposerPart[], offset: number) {
  const cursor = Math.min(Math.max(offset, 0), composerLength(parts));
  if (cursor >= composerLength(parts)) return { parts, cursor };
  return {
    parts: removeRange(parts, cursor, cursor + 1),
    cursor,
  };
}
