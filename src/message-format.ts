import type { ChatMessage } from "./types.js";

export function decodeCQValue(value: string) {
  return value
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&amp;/g, "&");
}

export function compactCQ(raw: string, options?: { expandImages?: boolean }) {
  return raw.replace(
    /\[CQ:([^,\]]+)((?:,[^\]]*)?)\]/g,
    (_, type: string, attrs: string) => {
      const data = new Map<string, string>();
      for (const pair of attrs.slice(1).split(",")) {
        const eq = pair.indexOf("=");
        if (eq > 0) {
          data.set(pair.slice(0, eq), decodeCQValue(pair.slice(eq + 1)));
        }
      }

      switch (type) {
        case "image":
          return imageToken(
            Object.fromEntries(data),
            options?.expandImages ?? false
          );
        case "record":
          return "[voice]";
        case "video":
          return "[video]";
        case "reply":
          return "[reply]";
        case "at":
          return `@${data.get("qq") || "user"}`;
        case "face":
          return "[face]";
        case "forward":
          return "[forward]";
        default:
          return `[${type}]`;
      }
    }
  );
}

export function imageToken(data: Record<string, string>, expanded: boolean) {
  if (!expanded) return data.summary || "[image]";

  const source =
    data.url ||
    data.file ||
    data.path ||
    data.md5 ||
    data.summary ||
    "unknown";
  const label = data.url
    ? "url"
    : data.file
    ? "file"
    : data.path
    ? "path"
    : data.md5
    ? "md5"
    : "ref";

  return `[image:${label}=${source}]`;
}

export function compactMessage(
  msg: ChatMessage,
  options?: { expandImages?: boolean }
) {
  const expandImages = options?.expandImages ?? false;
  if (msg.segments?.length) {
    const parts = msg.segments.map((seg) => {
      switch (seg.type) {
        case "text":
          return seg.data.text || "";
        case "image":
          return imageToken(seg.data, expandImages);
        case "record":
          return "[voice]";
        case "video":
          return "[video]";
        case "reply":
          return "[reply]";
        case "at":
          return `@${seg.data.qq || "user"}`;
        case "face":
          return "[face]";
        case "forward":
          return "[forward]";
        default:
          return `[${seg.type}]`;
      }
    });
    return parts.join(" ");
  }

  return compactCQ(msg.content, { expandImages });
}
