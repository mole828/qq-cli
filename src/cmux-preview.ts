import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type {
  ChatMessage,
  Contact,
  MentionLabelLookup,
} from "./types.js";
import { compactMessage } from "./message-format.js";
import { logger } from "./logger.js";
import { truncateCells } from "./terminal-text.js";

const LEGACY_STATUS_KEY = "qq_cli_message";
const MAX_HEADER_CELLS = 96;
const MAX_BODY_CELLS = 512;
const UPDATE_DELAY_MS = 80;

function resolveCmuxCliPath() {
  const configured = process.env.QQ_CLI_CMUX_PATH?.trim();
  if (configured) return configured;

  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, "cmux");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep looking through PATH.
    }
  }

  if (process.platform !== "darwin") return null;

  const appCandidates = [
    "/Applications/cmux.app/Contents/Resources/bin/cmux",
    path.join(
      os.homedir(),
      "Applications/cmux.app/Contents/Resources/bin/cmux"
    ),
  ];
  for (const candidate of appCandidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // The app may be installed somewhere else or not installed at all.
    }
  }

  return null;
}

function cmuxMode() {
  const mode = process.env.QQ_CLI_CMUX?.trim().toLowerCase();
  return mode === "off" || mode === "on" ? mode : "auto";
}

function cleanPreview(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f\u001b]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatCmuxMessagePreview(
  contact: Contact,
  message: ChatMessage,
  mentionLabels?: MentionLabelLookup
): string {
  const sessionMarker = contact.type === "group" ? "#" : "@";
  const sender = message.isMine
    ? "you"
    : message.senderName || String(message.senderId);
  const header = truncateCells(
    cleanPreview(`${sessionMarker}${contact.name} · ${sender}`),
    MAX_HEADER_CELLS
  );
  const body = truncateCells(
    cleanPreview(compactMessage(message, {
      imageMode: "off",
      mentionLabels,
    })) || "(empty)",
    MAX_BODY_CELLS
  );
  return `${header}\n${body}`;
}

export class CmuxPreview {
  private readonly cliPath: string | null;
  private readonly workspaceId: string;
  private readonly enabled: boolean;
  private pendingDescription: string | null | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private failed = false;
  private disposed = false;

  constructor() {
    this.cliPath = resolveCmuxCliPath();
    this.workspaceId = process.env.CMUX_WORKSPACE_ID?.trim() || "";
    const mode = cmuxMode();
    this.enabled =
      mode !== "off" &&
      Boolean(this.cliPath) &&
      (mode === "on" || Boolean(this.workspaceId));

    if (this.enabled) {
      this.clearLegacyStatus();
      this.clear();
    }
    if (mode === "on" && !this.cliPath) {
      logger.warn("cmux preview forced but cmux CLI was not found");
    }
  }

  update(
    contact: Contact,
    message: ChatMessage,
    mentionLabels?: MentionLabelLookup
  ) {
    if (!this.enabled || this.disposed) return;
    this.pendingDescription = formatCmuxMessagePreview(
      contact,
      message,
      mentionLabels
    );
    this.scheduleFlush();
  }

  clear() {
    if (!this.enabled || this.disposed) return;
    this.pendingDescription = null;
    this.scheduleFlush();
  }

  dispose() {
    if (!this.enabled || this.disposed) return;
    this.disposed = true;
    this.pendingDescription = undefined;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.clearLegacyStatus();
  }

  private flush() {
    if (
      !this.enabled ||
      !this.cliPath ||
      this.failed ||
      this.running ||
      this.pendingDescription === undefined
    ) {
      return;
    }

    const description = this.pendingDescription;
    this.pendingDescription = undefined;
    this.running = true;
    const args = description === null
      ? ["workspace-action", "--action", "clear-description"]
      : [
          "workspace-action",
          "--action",
          "set-description",
          "--description",
          description,
        ];
    if (this.workspaceId) args.push("--workspace", this.workspaceId);

    execFile(this.cliPath, args, { env: process.env }, (error) => {
      this.running = false;
      if (error) {
        this.failed = true;
        logger.warn("cmux sidebar description update failed", {
          error: error.message,
        });
        return;
      }
      this.flush();
    });
  }

  private scheduleFlush() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, UPDATE_DELAY_MS);
  }

  private clearLegacyStatus() {
    if (!this.cliPath || !this.workspaceId) return;
    execFile(
      this.cliPath,
      ["clear-status", LEGACY_STATUS_KEY, "--workspace", this.workspaceId],
      { env: process.env },
      (error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ENOENT") {
          logger.debug("Could not clear legacy cmux status", {
            error: error.message,
          });
        }
      }
    );
  }
}
