import type { ChatMessage, Contact, MessageSegment } from "./types.js";
import {
  compactMessage,
  getForwardIdsFromText,
  getForwardSegmentId,
} from "./message-format.js";

/** A completion's inserted text and the text shown in a candidate list. */
export interface CompletionItem {
  value: string;
  label: string;
  description?: string;
}

/** Commands which can be completed at the start of the composer. */
export const COMPLETABLE_COMMANDS = [
  "/session",
  "/contacts",
  "/groups",
  "/friends",
  "/audio",
  "/record",
  "/images",
  "/mention",
  "/faces",
  "/stickers",
  "/echo",
  "/forward",
  "/reply",
  "/reload",
  "/help",
  "/exit",
  "/quit",
] as const;

const COMMAND_ALIASES = ["/s", "/c", "/g", "/f", "/h", "/?", "/q"];

/** A complete command name or alias keeps its original Enter behavior. */
export function isCompleteCommand(input: string) {
  const command = input.trim().toLowerCase();
  return COMPLETABLE_COMMANDS.some((name) => name === command) || COMMAND_ALIASES.includes(command);
}

const COMMAND_HINTS: Record<typeof COMPLETABLE_COMMANDS[number], { args?: string; description: string }> = {
  "/session": { args: "[名称|ID]", description: "切换会话；留空打开列表" },
  "/contacts": { args: "[关键词]", description: "搜索全部会话" },
  "/groups": { args: "[关键词]", description: "搜索群会话" },
  "/friends": { args: "[关键词]", description: "搜索好友会话" },
  "/audio": { args: "<路径>", description: "发送语音文件" },
  "/record": { args: "<路径>", description: "发送语音文件，同 /audio" },
  "/images": { args: "off|inline", description: "关闭或开启内联图片" },
  "/mention": { args: "[direct|off|all]", description: "查看或设置提及提醒模式" },
  "/faces": { args: "[refresh]", description: "选择收藏表情；refresh 刷新" },
  "/stickers": { args: "[refresh]", description: "选择收藏表情，同 /faces" },
  "/echo": { description: "复读群内最近的重复消息" },
  "/forward": { args: "<消息ID>", description: "查看合并转发内容" },
  "/reply": { args: "<消息ID>", description: "设置当前会话的回复目标" },
  "/reload": { description: "重新加载账号和会话列表" },
  "/help": { description: "查看命令和快捷键" },
  "/exit": { description: "退出程序" },
  "/quit": { description: "退出程序，同 /exit" },
};

const COMMANDS_WITH_ARGUMENTS = new Set([
  "/session",
  "/audio",
  "/record",
  "/reply",
  "/forward",
  "/images",
  "/mention",
]);

function belongsToSession(message: ChatMessage, contact: Contact) {
  return (
    message.chatType === (contact.type === "group" ? "group" : "private") &&
    message.contactId === contact.id
  );
}

function hasForwardId(segments: MessageSegment[] | undefined) {
  for (const segment of segments || []) {
    if (getForwardSegmentId(segment)) return true;
    if (
      segment.type === "text" &&
      typeof segment.data.text === "string" &&
      getForwardIdsFromText(segment.data.text).length > 0
    ) {
      return true;
    }
  }

  return false;
}

function messageLabel(message: ChatMessage) {
  const author = message.senderName || String(message.senderId);
  const preview = compactMessage(message).replace(/\s+/g, " ").trim() || "(empty)";
  return `#${message.id} ${author}: ${preview}`;
}

function completeMessages(
  command: "/reply" | "/forward",
  query: string,
  messages: ChatMessage[],
  session: Contact
): CompletionItem[] {
  const idPrefix = query.trim().replace(/^#/, "");
  const seen = new Set<string>();

  return messages
    .filter((message) => belongsToSession(message, session))
    .filter((message) => command === "/reply" ? !message.isMine : hasForwardId(message.segments))
    .filter((message) => String(message.id).startsWith(idPrefix))
    .sort((a, b) => b.timestamp - a.timestamp)
    .flatMap((message) => {
      const id = String(message.id);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{
        value: `${command} ${id}`,
        label: messageLabel(message),
      }];
    });
}

function completeSessions(query: string, contacts: Contact[]) {
  const normalizedQuery = query.trim().toLowerCase();
  const seen = new Set<string>();

  return contacts
    .filter((contact) => {
      if (!normalizedQuery) return true;
      return (
        contact.name.toLowerCase().includes(normalizedQuery) ||
        String(contact.id).includes(normalizedQuery)
      );
    })
    .filter((contact) => {
      const key = `${contact.type}:${contact.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((contact) => ({
      // The type prefix makes a numeric ID unambiguous when friends and groups
      // contain the same number. The command handler accepts this canonical form.
      value: `/session ${contact.type}:${contact.id}`,
      label: `${contact.type}:${contact.id} ${contact.name}`,
    }));
}

function completeCommandNames(input: string): CompletionItem[] {
  const prefix = input.toLowerCase();
  return COMPLETABLE_COMMANDS
    .filter((command) => command.startsWith(prefix))
    .map((command) => ({
      value: COMMANDS_WITH_ARGUMENTS.has(command) ? `${command} ` : command,
      label: [command, COMMAND_HINTS[command].args].filter(Boolean).join(" "),
      description: COMMAND_HINTS[command].description,
    }));
}

/**
 * Return candidates for the command or command argument at the end of input.
 *
 * Completion is intentionally scoped to the current session for message IDs;
 * this prevents a reply or forward candidate from another chat being inserted.
 */
export function getCommandCompletions(
  input: string,
  contacts: Contact[],
  messages: ChatMessage[],
  session: Contact | null
): CompletionItem[] {
  if (!input.startsWith("/")) return [];

  const commandOnly = input.match(/^\/[^\s]*$/u);
  if (commandOnly) return completeCommandNames(input);

  const commandWithArgs = input.match(/^(\/[^\s]+)(?:\s+([\s\S]*))?$/u);
  if (!commandWithArgs) return [];

  const command = commandWithArgs[1].toLowerCase();
  const query = commandWithArgs[2] || "";
  if (command === "/session" || command === "/s") {
    return completeSessions(query, contacts);
  }
  if ((command === "/reply" || command === "/forward") && session) {
    return completeMessages(command, query, messages, session);
  }
  return [];
}
