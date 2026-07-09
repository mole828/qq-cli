export type ImageMode = "off" | "inline";

const DEFAULT_MESSAGE_GAP = 0;

export function parseImageMode(value: string | undefined): ImageMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "inline"
  ) {
    return normalized;
  }

  return "off";
}

export function getInitialImageMode(): ImageMode {
  return parseImageMode(process.env.QQ_CLI_IMAGE_MODE);
}

export function parseMessageGap(value: string | undefined): number {
  if (value === undefined) return DEFAULT_MESSAGE_GAP;

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MESSAGE_GAP;

  return Math.max(parsed, 0);
}

export function getInitialMessageGap(): number {
  return parseMessageGap(process.env.QQ_CLI_MESSAGE_GAP);
}
