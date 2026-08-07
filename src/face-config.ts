export const DEFAULT_CUSTOM_FACE_COUNT = 500;
export const CUSTOM_FACE_REQUEST_TIMEOUT_MS = 8_000;

function parsePositiveInteger(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getConfiguredCustomFaceCount() {
  return (
    parsePositiveInteger(process.env.QQ_CLI_CUSTOM_FACE_COUNT) ??
    DEFAULT_CUSTOM_FACE_COUNT
  );
}
