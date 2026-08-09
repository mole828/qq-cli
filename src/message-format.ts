import type { ChatMessage, ImageReference, MessageSegment } from "./types.js";
import type { ImageMode } from "./config.js";
import { isWebUrl, terminalLink } from "./terminal-text.js";

interface CompactOptions {
  imageMode?: ImageMode;
  terminalLinks?: boolean;
  forwardMessageId?: boolean;
  forwardSegmentId?: boolean;
  replyLookup?: ReadonlyMap<string, ChatMessage>;
}

export function decodeCQValue(value: string) {
  return value
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&#44;/g, ",")
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

function stringAttrs(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

export function getImageSource(data: Record<string, string>) {
  const source = data.url || data.file || data.path;
  if (!source) return null;
  // Some OneBot implementations return array-format segment values with CQ/HTML
  // escaping still applied. Decode at the resource boundary so signed QQ CDN
  // query strings such as `...?appid=...&fileid=...` remain valid.
  return decodeCQValue(decodeCQValue(source));
}

export function getImageReferences(msg: ChatMessage) {
  const references: ImageReference[] = [];

  if (msg.segments?.length) {
    for (const seg of msg.segments) {
      if (seg.type !== "image") continue;
      const data = stringAttrs(seg.data);
      const source = getImageSource(data);
      if (source) {
        references.push({
          source,
          ...(data.file ? { file: data.file } : {}),
        });
      }
    }

    if (references.length > 0) return references;
  }

  for (const match of msg.content.matchAll(/\[CQ:image((?:,[^\]]*)?)\]/g)) {
    const data = parseCQAttrs(match[1]);
    const source = getImageSource(data);
    if (source) {
      references.push({
        source,
        ...(data.file ? { file: data.file } : {}),
      });
    }
  }

  return references;
}

export function getImageSources(msg: ChatMessage) {
  return getImageReferences(msg).map(({ source }) => source);
}

export function getForwardSegmentId(segment: MessageSegment): string | null {
  if (segment.type !== "forward") return null;

  const rawId = segment.data.id ?? segment.data.message_id;
  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return rawId.trim();
  }
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return String(rawId);
  }
  return null;
}

export function getForwardIdsFromText(raw: string): string[] {
  const text = decodeCQValue(raw);
  return Array.from(text.matchAll(/\[CQ:forward((?:,[^\]]*)?)\]/g)).flatMap(
    (match) => {
      const data = parseCQAttrs(match[1]);
      const id = data.id || data.message_id;
      return id?.trim() ? [id.trim()] : [];
    }
  );
}

export function compactCQ(raw: string, options?: CompactOptions): string {
  return raw.replace(
    /\[CQ:([^,\]]+)((?:,[^\]]*)?)\]/g,
    (_, type: string, attrs: string) => {
      const data = parseCQAttrs(attrs);

      return compactSegment(
        type,
        data,
        options?.imageMode ?? "off",
        options?.terminalLinks ?? false,
        options?.replyLookup
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
  rawData: Record<string, unknown>,
  imageMode: ImageMode,
  terminalLinks = false,
  replyLookup?: ReadonlyMap<string, ChatMessage>
): string {
  const data = stringAttrs(rawData);
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
      return data.text ? compactCQ(data.text, { imageMode, terminalLinks }) : "";
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
      return replyToken(data, replyLookup, imageMode);
    case "at": {
      const qq = data.qq || (typeof rawData.qq === "number" ? String(rawData.qq) : "");
      return `@${qq || "user"}`;
    }
    case "face":
      return "[face]";
    case "forward": {
      const id = data.id || data.message_id;
      return id ? `[forward #${id}]` : "[forward]";
    }
    default:
      return `[${type}]`;
  }
}

function replyToken(
  data: Record<string, string>,
  replyLookup: ReadonlyMap<string, ChatMessage> | undefined,
  imageMode: ImageMode
) {
  const id = data.id || data.message_id;
  if (!id) return "[reply]";

  const target = replyLookup?.get(String(id));
  if (!target) return `[reply #${id}]`;

  const previewMessage = target.segments?.length
    ? { ...target, segments: target.segments.filter((seg) => seg.type !== "reply") }
    : target;
  const content = compactMessage(previewMessage, { imageMode })
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(content);
  const excerpt = chars.slice(0, 5).join("") + (chars.length > 5 ? "…" : "");
  const sender = target.senderName || String(target.senderId);

  return excerpt
    ? `[reply #${id} ${sender}: ${excerpt}]`
    : `[reply #${id} ${sender}]`;
}

export function compactMessage(
  msg: ChatMessage,
  options?: CompactOptions
) {
  const imageMode = options?.imageMode ?? "off";
  if (msg.segments?.length) {
    const parts = msg.segments.map((seg) =>
      seg.type === "forward"
        ? options?.forwardMessageId === false
          ? "[forward]"
          : (() => {
              const id = options?.forwardSegmentId
                ? getForwardSegmentId(seg)
                : String(msg.id);
              return id ? `[forward #${id}]` : "[forward]";
            })()
        : compactSegment(
            seg.type,
            seg.data,
            imageMode,
            options?.terminalLinks ?? false,
            options?.replyLookup
          )
    );
    return parts.join(" ");
  }

  return compactCQ(msg.content, {
    imageMode,
    terminalLinks: options?.terminalLinks,
    replyLookup: options?.replyLookup,
  });
}
