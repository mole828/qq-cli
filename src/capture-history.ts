import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { QQClient } from "./qq-client.js";
import type { SavedChatHistory } from "./history-file.js";
import { getImageSource } from "./message-format.js";
import type { ChatMessage, Contact } from "./types.js";

function getOption(name: string) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function loadLocalEnv() {
  try {
    const contents = await readFile(path.resolve(".env"), "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equals = line.indexOf("=");
      if (equals <= 0) continue;
      const key = line.slice(0, equals).trim();
      if (process.env[key] !== undefined) continue;
      let value = line.slice(equals + 1).trim();
      if (
        value.length >= 2 &&
        (value.startsWith('"') && value.endsWith('"') ||
          value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 15_000) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function waitForConnection(client: QQClient) {
  return withTimeout(new Promise<void>((resolve) => {
    client.onStatus((connected) => {
      if (connected) resolve();
    });
    client.connect();
  }), "OneBot connection");
}

function selectGroup(groups: Contact[], query: string) {
  const normalized = query.trim().toLowerCase();
  const exact = groups.filter((group) => group.name.trim().toLowerCase() === normalized);
  const matches = exact.length > 0
    ? exact
    : groups.filter((group) => group.name.toLowerCase().includes(normalized));
  if (matches.length === 0) throw new Error(`No group matched: ${query}`);
  if (matches.length > 1) {
    throw new Error(
      `Group query is ambiguous: ${matches.map((group) => `${group.name} (${group.id})`).join(", ")}`
    );
  }
  return matches[0];
}

function imageExtension(contentType: string | null) {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("bmp")) return ".bmp";
  return ".jpg";
}

async function localizeImages(messages: ChatMessage[], outputPath: string) {
  const assetDirectory = outputPath.replace(/\.json$/i, "") + "-assets";
  const sources = new Map<string, { messageIndex: number; segmentIndex: number }[]>();

  messages.forEach((message, messageIndex) => {
    message.segments?.forEach((segment, segmentIndex) => {
      if (segment.type !== "image") return;
      const source = getImageSource(
        Object.fromEntries(
          Object.entries(segment.data).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      );
      if (!source || !/^https?:\/\//i.test(source)) return;
      const locations = sources.get(source) || [];
      locations.push({ messageIndex, segmentIndex });
      sources.set(source, locations);
    });
  });

  if (sources.size === 0) return;
  await mkdir(assetDirectory, { recursive: true });

  await Promise.all([...sources.entries()].map(async ([source, locations], sourceIndex) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) return;
      const extension = imageExtension(response.headers.get("content-type"));
      const assetPath = path.resolve(assetDirectory, `${String(sourceIndex + 1).padStart(3, "0")}${extension}`);
      await writeFile(assetPath, Buffer.from(await response.arrayBuffer()));
      for (const { messageIndex, segmentIndex } of locations) {
        const segment = messages[messageIndex].segments?.[segmentIndex];
        if (!segment) continue;
        segment.data = { ...segment.data, remote_url: source, url: assetPath };
      }
    } catch {
      // Keep the original URL if the asset cannot be archived.
    } finally {
      clearTimeout(timeout);
    }
  }));
}

async function main() {
  await loadLocalEnv();
  const groupQuery = getOption("--group");
  if (!groupQuery) throw new Error("Usage: npm run history:capture -- --group <name> [--count 50] [--output file]");
  const parsedCount = Number.parseInt(getOption("--count") || "50", 10);
  const count = Number.isFinite(parsedCount) ? Math.max(parsedCount, 1) : 50;
  const outputPath = path.resolve(
    getOption("--output") || `.local/history/${groupQuery.replace(/[^\p{L}\p{N}._-]+/gu, "-")}.json`
  );
  const client = new QQClient(process.env.ONEBOT_WS_URL || "ws://localhost:3001");

  try {
    await waitForConnection(client);
    const login = await withTimeout(client.getLoginInfo(), "get_login_info");
    const groups = await withTimeout(client.getGroupList(), "get_group_list");
    const contact = selectGroup(groups, groupQuery);
    const history = await withTimeout(
      client.getChatHistory(contact, count),
      "get_group_msg_history",
      30_000
    );
    if (!history) throw new Error(`History is unavailable for ${contact.name}`);

    const messages = structuredClone(history) as ChatMessage[];
    await localizeImages(messages, outputPath);
    const saved: SavedChatHistory = {
      version: 1,
      capturedAt: new Date().toISOString(),
      contact,
      selfId: login.user_id,
      nickname: login.nickname,
      messages,
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n${messages.length} messages from ${contact.name} (${contact.id})\n`);
  } finally {
    client.disconnect();
  }
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
