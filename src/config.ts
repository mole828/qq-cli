export type ImageMode = "off" | "link" | "inline";

export function parseImageMode(value: string | undefined): ImageMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "link" ||
    normalized === "inline"
  ) {
    return normalized;
  }

  return "off";
}

export function getInitialImageMode(): ImageMode {
  return parseImageMode(process.env.QQ_CLI_IMAGE_MODE);
}
