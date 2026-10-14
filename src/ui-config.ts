import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { UiStyle } from "./config.js";

function configPath() {
  const dir = process.env.QQ_CLI_CONFIG_DIR || join(homedir(), ".qq-cli");
  return join(dir, "config.json");
}

function readConfig(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readUiStyleConfig(): string | undefined {
  const value = readConfig().ui;
  return typeof value === "string" ? value : undefined;
}

export function writeUiStyleConfig(style: UiStyle): void {
  try {
    mkdirSync(dirname(configPath()), { recursive: true });
    const next = { ...readConfig(), ui: style };
    writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    // Persistence is best-effort; the session keeps the in-memory style.
  }
}
