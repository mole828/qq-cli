import type { ChatMessage } from "./types.js";
import type { ImageMode } from "./config.js";

export function decodeCQValue(value: string) {
  return value
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&amp;/g, "&");
}

function parseCQAttrs(attrs: string) {
  const data = new Map<string, string>();
  for (const pair of attrs.slice(1).split(",")) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      data.set(pair.slice(0, eq), decodeCQValue(pair.slice(eq + 1)));
    }
  }

  return Object.fromEntries(data);
}

export function getImageSource(data: Record<string, string>) {
  return data.url || data.file || data.path || null;
}

export function getFirstImageSource(msg: ChatMessage) {
  if (msg.segments?.length) {
    for (const seg of msg.segments) {
      if (seg.type !== "image") continue;
      const source = getImageSource(seg.data);
      if (source) return source;
    }
  }

  const match = msg.content.match(/\[CQ:image((?:,[^\]]*)?)\]/);
  if (!match) return null;
  return getImageSource(parseCQAttrs(match[1]));
}

export function compactCQ(raw: string, options?: { imageMode?: ImageMode }) {
  return raw.replace(
    /\[CQ:([^,\]]+)((?:,[^\]]*)?)\]/g,
    (_, type: string, attrs: string) => {
      const data = parseCQAttrs(attrs);

      switch (type) {
        case "image":
          return imageToken(data, options?.imageMode ?? "off");
        case "record":
          return "[voice]";
        case "video":
          return "[video]";
        case "reply":
          return "[reply]";
        case "at":
          return `@${data.qq || "user"}`;
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

export function imageToken(data: Record<string, string>, imageMode: ImageMode) {
  if (imageMode !== "link") return data.summary || "[image]";

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
  options?: { imageMode?: ImageMode }
) {
  const imageMode = options?.imageMode ?? "off";
  if (msg.segments?.length) {
    const parts = msg.segments.map((seg) => {
      switch (seg.type) {
        case "text":
          return seg.data.text || "";
        case "image":
          return imageToken(seg.data, imageMode);
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

  return compactCQ(msg.content, { imageMode });
}
