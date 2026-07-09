import type { ChatMessage } from "./types.js";
import type { ImageMode } from "./config.js";
import { isWebUrl, terminalLink } from "./terminal-text.js";

interface CompactOptions {
  imageMode?: ImageMode;
  terminalLinks?: boolean;
}

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

export function compactCQ(raw: string, options?: CompactOptions) {
  return raw.replace(
    /\[CQ:([^,\]]+)((?:,[^\]]*)?)\]/g,
    (_, type: string, attrs: string) => {
      const data = parseCQAttrs(attrs);

      return compactSegment(
        type,
        data,
        options?.imageMode ?? "off",
        options?.terminalLinks ?? false
      );
    }
  );
}

export function imageToken(data: Record<string, string>, _imageMode: ImageMode) {
  return data.summary || "[image]";
}

function resourceEntry(
  data: Record<string, string>,
  keys: string[] = ["url", "file", "path", "href"]
) {
  for (const key of keys) {
    if (data[key]) return [key, data[key]] as const;
  }
  return null;
}

function quoteTagValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resourceTag(
  type: string,
  data: Record<string, string>,
  keys?: string[]
) {
  const entry = resourceEntry(data, keys);
  if (!entry) return `[${type}]`;
  const [key, value] = entry;
  return `[${type},${key}="${quoteTagValue(value)}"]`;
}

function shareTag(data: Record<string, string>, terminalLinks = false) {
  if (terminalLinks && data.url && isWebUrl(data.url)) {
    return terminalLink(
      data.title ? `[share] ${data.title}` : "[share]",
      data.url,
      true
    );
  }

  const attrs = (data.title ? ["title"] : ["url"])
    .filter((key) => data[key])
    .map((key) => `${key}="${quoteTagValue(data[key])}"`);
  return attrs.length ? `[share,${attrs.join(",")}]` : "[share]";
}

function compactNewsJson(data: Record<string, string>, terminalLinks = false) {
  if (!data.data) return "[json]";

  try {
    const payload = JSON.parse(data.data) as unknown;
    if (!payload || typeof payload !== "object") return "[json]";

    const meta = (payload as { meta?: unknown }).meta;
    if (!meta || typeof meta !== "object") return "[json]";

    const news = (meta as { news?: unknown }).news;
    if (!news || typeof news !== "object") return "[json]";

    const { title, jumpUrl } = news as {
      title?: unknown;
      jumpUrl?: unknown;
    };
    const shareData = {
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof jumpUrl === "string" ? { url: jumpUrl } : {}),
    };
    return shareData.title || shareData.url
      ? shareTag(shareData, terminalLinks)
      : "[json]";
  } catch {
    return "[json]";
  }
}

function compactSegment(
  type: string,
  data: Record<string, string>,
  imageMode: ImageMode,
  terminalLinks = false
) {
  const resource = resourceEntry(data);
  const resourceUrl = resource?.[1];
  if (
    terminalLinks &&
    type !== "text" &&
    type !== "share" &&
    resourceUrl &&
    isWebUrl(resourceUrl)
  ) {
    const label = type === "record" ? "voice" : type;
    return terminalLink(`[${label}]`, resourceUrl, true);
  }

  switch (type) {
    case "text":
      return data.text || "";
    case "image":
      return imageToken(data, imageMode);
    case "record":
      return "[voice]";
    case "video":
      return "[video]";
    case "url":
      return resourceTag("url", data, ["url", "href", "text"]);
    case "share":
      return shareTag(data, terminalLinks);
    case "json":
      return compactNewsJson(data, terminalLinks);
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

export function compactMessage(
  msg: ChatMessage,
  options?: CompactOptions
) {
  const imageMode = options?.imageMode ?? "off";
  if (msg.segments?.length) {
    const parts = msg.segments.map((seg) =>
      compactSegment(
        seg.type,
        seg.data,
        imageMode,
        options?.terminalLinks ?? false
      )
    );
    return parts.join(" ");
  }

  return compactCQ(msg.content, {
    imageMode,
    terminalLinks: options?.terminalLinks,
  });
}
