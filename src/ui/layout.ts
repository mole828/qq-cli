export const COMPOSER_ROWS = 5;
export const INLINE_PICKER_ROWS = 5;
export const TERMINAL_GUTTER_ROWS = 1;

export function getComposerRows(inlinePickerOpen: boolean) {
  return COMPOSER_ROWS + (inlinePickerOpen ? INLINE_PICKER_ROWS : 0);
}
