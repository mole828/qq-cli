// Shared with text formatting so linked and plain image tokens stay identical.
const formats = new Map<string, string>();

export function setImageFormat(source: string, mime?: string) {
  const format = mime?.split("/")[1]?.toUpperCase();
  if (format) formats.set(source, format);
  else formats.delete(source);
}

export function getImageFormat(source: string) {
  return formats.get(source);
}
