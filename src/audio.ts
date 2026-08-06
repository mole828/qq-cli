import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

export const AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".amr",
  ".flac",
  ".m4a",
  ".mp3",
  ".oga",
  ".ogg",
  ".opus",
  ".silk",
  ".wav",
]);

const AUDIO_COMMAND_PATTERN = /^(\/audio|\/record)(\s+)(.*)$/i;

export interface AudioPathCompletionInput {
  commandPrefix: string;
  pathToken: string;
  pathStart: number;
  pathEnd: number;
  quote: '"' | "'" | null;
  hasClosingQuote: boolean;
  suffix: string;
}

export interface AudioPathCompletionMatch {
  value: string;
  isDirectory: boolean;
}

export interface AudioFileData {
  path: string;
  name: string;
  size: number;
  base64: string;
}

/**
 * Parse the small shell-like argument subset needed by command input.
 * Environment-variable expansion is intentionally not performed here.
 */
export function parseCommandArgs(input: string): string[] | null {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let tokenStarted = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      tokenStarted = true;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/u.test(char)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaping) current += "\\";
  if (quote) return null;
  if (tokenStarted) args.push(current);
  return args;
}

function unescapeCompletionPath(value: string) {
  return value.replace(/\\([\\\s"'])/g, "$1");
}

function escapeCompletionPath(value: string, quote: '"' | "'" | null) {
  if (quote === '"') return value.replace(/([\\"])/g, "\\$1");
  if (quote === "'") return value.replace(/'/g, "'\\''");
  return value.replace(/([\\\s])/g, "\\$1");
}

/**
 * Expand a path typed in qq-cli. The returned path always points to the
 * local machine, which is important because media is read before it is sent
 * to a remote OneBot endpoint.
 */
export function expandLocalPath(rawPath: string, cwd = process.cwd()) {
  const value = rawPath.trim();
  if (!value) throw new Error("audio path is empty");

  let expanded = value;
  if (expanded.startsWith("file://")) {
    expanded = fileURLToPath(expanded);
  } else if (expanded === "~") {
    expanded = homedir();
  } else if (expanded.startsWith("~/")) {
    expanded = join(homedir(), expanded.slice(2));
  }

  return resolve(cwd, expanded);
}

export function isAudioFilePath(path: string) {
  return AUDIO_EXTENSIONS.has(extname(path).toLowerCase());
}

export async function readAudioFile(rawPath: string): Promise<AudioFileData> {
  let path: string;
  try {
    path = expandLocalPath(rawPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid audio path: ${detail}`);
  }

  if (!isAudioFilePath(path)) {
    throw new Error(`unsupported audio format: ${basename(path)}`);
  }

  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`not a file: ${rawPath}`);
  if (metadata.size === 0) throw new Error(`empty audio file: ${basename(path)}`);

  const bytes = await readFile(path);
  return {
    path,
    name: basename(path),
    size: metadata.size,
    base64: `base64://${bytes.toString("base64")}`,
  };
}

/**
 * Extract the single path argument from /audio or /record while preserving
 * enough source information to replace it during completion.
 */
export function getAudioPathCompletionInput(
  input: string
): AudioPathCompletionInput | null {
  const match = input.match(AUDIO_COMMAND_PATTERN);
  if (!match) return null;

  const commandPrefix = input.slice(0, match[1].length + match[2].length);
  const pathStart = commandPrefix.length;
  const rest = input.slice(pathStart);
  if (!rest) {
    return {
      commandPrefix,
      pathToken: "",
      pathStart,
      pathEnd: pathStart,
      quote: null,
      hasClosingQuote: false,
      suffix: "",
    };
  }

  const first = rest[0];
  if (first === '"' || first === "'") {
    let escaped = false;
    for (let index = 1; index < rest.length; index += 1) {
      const char = rest[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\" && first === '"') {
        escaped = true;
        continue;
      }
      if (char === first) {
        const pathEnd = pathStart + index;
        const suffix = input.slice(pathEnd + 1);
        if (suffix.trim()) return null;
        return {
          commandPrefix,
          pathToken: unescapeCompletionPath(rest.slice(1, index)),
          pathStart: pathStart + 1,
          pathEnd,
          quote: first,
          hasClosingQuote: true,
          suffix,
        };
      }
    }

    return {
      commandPrefix,
      pathToken: unescapeCompletionPath(rest.slice(1)),
      pathStart: pathStart + 1,
      pathEnd: input.length,
      quote: first,
      hasClosingQuote: false,
      suffix: "",
    };
  }

  let pathLength = 0;
  while (pathLength < rest.length && !/\s/u.test(rest[pathLength])) {
    pathLength += 1;
  }
  const pathEnd = pathStart + pathLength;
  const suffix = input.slice(pathEnd);
  if (suffix.trim()) return null;

  return {
    commandPrefix,
    pathToken: unescapeCompletionPath(rest.slice(0, pathLength)),
    pathStart,
    pathEnd,
    quote: null,
    hasClosingQuote: false,
    suffix,
  };
}

function completionDirectoryAndPrefix(pathToken: string) {
  if (pathToken === "~") {
    return {
      directory: homedir(),
      partial: "",
      displayPrefix: "~/",
    };
  }

  const localPath = expandLocalPath(pathToken || ".");
  const hasTrailingSlash = pathToken.endsWith("/");
  const directory = hasTrailingSlash ? localPath : dirname(localPath);
  const partial = hasTrailingSlash ? "" : basename(localPath);
  const slash = pathToken.lastIndexOf("/");
  const displayPrefix = hasTrailingSlash
    ? pathToken
    : slash >= 0
      ? pathToken.slice(0, slash + 1)
      : "";

  return { directory, partial, displayPrefix };
}

export async function findAudioPathCompletions(
  input: AudioPathCompletionInput
): Promise<AudioPathCompletionMatch[]> {
  let completion: ReturnType<typeof completionDirectoryAndPrefix>;
  try {
    completion = completionDirectoryAndPrefix(input.pathToken);
  } catch {
    return [];
  }

  let entries;
  try {
    entries = await readdir(completion.directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const partial = completion.partial.toLowerCase();
  return entries
    .filter((entry) =>
      entry.isDirectory() ||
      (entry.isFile() && isAudioFilePath(entry.name))
    )
    .filter((entry) => entry.name.toLowerCase().startsWith(partial))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((entry) => ({
      value: `${completion.displayPrefix}${entry.name}${entry.isDirectory() ? "/" : ""}`,
      isDirectory: entry.isDirectory(),
    }));
}

export function formatAudioPathCompletion(
  input: AudioPathCompletionInput,
  match: AudioPathCompletionMatch
) {
  const value = escapeCompletionPath(match.value, input.quote);
  const closeQuote = input.quote && (input.hasClosingQuote || !match.isDirectory)
    ? input.quote
    : "";
  const openingQuote = input.quote || "";
  return `${input.commandPrefix}${openingQuote}${value}${closeQuote}${input.suffix}`;
}
