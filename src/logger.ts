import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve(
  process.env.QQ_CLI_LOG_DIR || path.join(process.cwd(), "logs")
);

let logStream: fs.WriteStream | null = null;
let currentLogFile = "";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFileName(): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return path.join(LOG_DIR, `qq-cli-${date}.log`);
}

function rotateIfNeeded() {
  const newFile = getLogFileName();
  if (newFile !== currentLogFile) {
    logStream?.end();
    currentLogFile = newFile;
    logStream = fs.createWriteStream(currentLogFile, { flags: "a" });
  }
}

function getStream(): fs.WriteStream {
  ensureLogDir();
  if (!logStream) {
    currentLogFile = getLogFileName();
    logStream = fs.createWriteStream(currentLogFile, { flags: "a" });
  }
  rotateIfNeeded();
  return logStream;
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minLevel);
}

function write(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(extra || {}),
  };
  const line = JSON.stringify(entry) + "\n";
  try {
    getStream().write(line);
  } catch {
    // silently fail
  }
}

export const logger = {
  debug(msg: string, extra?: Record<string, unknown>) {
    write("debug", msg, extra);
  },
  info(msg: string, extra?: Record<string, unknown>) {
    write("info", msg, extra);
  },
  warn(msg: string, extra?: Record<string, unknown>) {
    write("warn", msg, extra);
  },
  error(msg: string, extra?: Record<string, unknown>) {
    write("error", msg, extra);
  },
};

export function getLogDir() {
  return LOG_DIR;
}

export function getLogPath() {
  return getLogFileName();
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
