import { textWidth } from "../terminal-text.js";

export const COMPOSER_ROWS = 5;
export const INLINE_PICKER_ROWS = 5;
export const TERMINAL_GUTTER_ROWS = 1;

export function getComposerRows(inlinePickerOpen: boolean, inputRows = 1) {
  const safeInputRows = Math.min(Math.max(Math.floor(inputRows), 1), COMPOSER_ROWS);
  // divider + top/bottom input padding + status row account for four rows.
  return safeInputRows + 4 + (inlinePickerOpen ? INLINE_PICKER_ROWS : 0);
}

/** Width of Composer's inner box (it is surrounded by one cell of margin). */
export function getComposerBoxWidth(termWidth: number) {
  return Math.max(Math.floor(termWidth) - 2, 12);
}

/**
 * Width available to PasteAwareTextInput after inner padding, the prompt, and
 * the optional reply token. This mirrors Composer's actual row geometry.
 */
export function getComposerInputWidth(termWidth: number, hasReply = false) {
  const boxWidth = getComposerBoxWidth(termWidth);
  const innerPadding = 2;
  const promptWidth = 2; // `› `
  const replyWidth = hasReply ? textWidth("[reply] ") : 0;
  return Math.max(boxWidth - innerPadding - promptWidth - replyWidth, 1);
}
