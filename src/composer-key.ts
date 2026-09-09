/** Ink leaves unrecognised xterm modifyOtherKeys sequences without their ESC. */
export function isComposerNewline(input: string, key: { return: boolean; shift: boolean }) {
  return (key.return && key.shift) || /^(?:\u001b)?\[(?:27;2;13~|13;2u)$/.test(input);
}
