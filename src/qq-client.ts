import { WebSocket } from "ws";
import { logger } from "./logger.js";
import {
  CUSTOM_FACE_REQUEST_TIMEOUT_MS,
  DEFAULT_CUSTOM_FACE_COUNT,
} from "./face-config.js";
import type {
  OneBotMessageEvent,
  OneBotApiRequest,
  OneBotApiResponse,
  Contact,
  ChatMessage,
  MessageSegment,
  ForwardNode,
  GroupMember,
} from "./types.js";

function parseWsUrl(rawUrl: string): {
  url: string;
  authHeader: Record<string, string> | undefined;
} {
  const accessToken = process.env.ONEBOT_ACCESS_TOKEN || "";

  let urlStr = rawUrl;
  let authHeader: Record<string, string> | undefined;

  if (accessToken) {
    try {
      const parsed = new URL(rawUrl);
      parsed.searchParams.set("access_token", accessToken);
      urlStr = parsed.toString();
    } catch {
      const sep = urlStr.includes("?") ? "&" : "?";
      urlStr = `${urlStr}${sep}access_token=${accessToken}`;
    }
    authHeader = { Authorization: `Bearer ${accessToken}` };
  }

  return { url: urlStr, authHeader };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name || undefined;
}

function parseMessageSegments(content: unknown): MessageSegment[] {
  if (Array.isArray(content)) {
    return content.filter((part): part is MessageSegment =>
      isRecord(part) &&
      typeof part.type === "string" &&
      isRecord(part.data)
    );
  }
  if (typeof content === "string") {
    return [{ type: "text", data: { text: content } }];
  }
  return [];
}

function parseForwardNode(item: unknown): ForwardNode | null {
  if (!isRecord(item)) return null;

  const node = item.type === "node" && isRecord(item.data)
    ? item.data
    : item;
  const content = node.content ?? node.message;
  const isNode = item.type === "node" ||
    "content" in node ||
    "message" in node ||
    "user_id" in node ||
    "uin" in node ||
    "nickname" in node ||
    "name" in node;
  if (!isNode) return null;

  const sender = isRecord(node.sender) ? node.sender : {};
  const rawSenderId = node.user_id ?? node.uin ?? sender.user_id ?? sender.uin;
  const senderId = rawSenderId === undefined ? undefined : String(rawSenderId);
  const rawSenderName = node.nickname ?? node.name ?? sender.nickname;
  const timestamp = Number(node.time);

  return {
    senderId,
    senderName: typeof rawSenderName === "string"
      ? rawSenderName
      : senderId || "unknown",
    timestamp: Number.isFinite(timestamp) ? timestamp * 1000 : undefined,
    segments: parseMessageSegments(content),
  };
}

function parseForwardNodes(raw: unknown, allowInlineMessage = false): ForwardNode[] | null {
  if (typeof raw === "string") {
    return allowInlineMessage
      ? [{ senderName: "unknown", segments: parseMessageSegments(raw) }]
      : null;
  }
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];

  const nodes = raw.flatMap((item) => {
    const node = parseForwardNode(item);
    return node ? [node] : [];
  });
  if (nodes.length > 0) return nodes;
  if (!allowInlineMessage) return null;

  const segments = parseMessageSegments(raw);
  return segments.length > 0
    ? [{ senderName: "unknown", segments }]
    : null;
}

export class QQClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private echoCounter = 0;
  private pendingRequests = new Map<string, (res: OneBotApiResponse) => void>();
  private selfId = 0;
  private nickname = "";
  private wsUrl: string;
  private authHeader: Record<string, string> | undefined;
  private friendRemarks = new Map<string, string>();
  private groupMemberCache = new Map<number, Map<string, GroupMember>>();

  private onMessageCallback: ((msg: ChatMessage) => void) | null = null;
  private onContactsCallback: ((contacts: Contact[]) => void) | null = null;
  private onStatusCallback: ((connected: boolean) => void) | null = null;
  private onSenderNamesChangedCallback: (() => void) | null = null;

  constructor(rawUrl: string = "ws://localhost:3001") {
    const { url, authHeader } = parseWsUrl(rawUrl);
    this.wsUrl = url;
    this.authHeader = authHeader;

    const displayUrl = url.replace(/(access_token=)[^&]+/, "$1***");
    logger.info("WebSocket target", { url: displayUrl });
  }

  onMessage(cb: (msg: ChatMessage) => void) {
    this.onMessageCallback = cb;
  }

  onContacts(cb: (contacts: Contact[]) => void) {
    this.onContactsCallback = cb;
  }

  onStatus(cb: (connected: boolean) => void) {
    this.onStatusCallback = cb;
  }

  onSenderNamesChanged(cb: () => void) {
    this.onSenderNamesChangedCallback = cb;
  }

  private notifySenderNamesChanged() {
    this.onSenderNamesChangedCallback?.();
  }

  private resolveSenderName(
    senderId: number,
    groupId: number | undefined,
    sources: {
      nickname?: unknown;
      card?: unknown;
      fallback?: unknown;
    }
  ) {
    const member = groupId === undefined
      ? undefined
      : this.groupMemberCache.get(groupId)?.get(String(senderId));
    const groupCard = groupId === undefined
      ? undefined
      : normalizeDisplayName(member?.card) || normalizeDisplayName(sources.card);

    return normalizeDisplayName(this.friendRemarks.get(String(senderId))) ||
      groupCard ||
      normalizeDisplayName(sources.nickname) ||
      normalizeDisplayName(member?.nickname) ||
      normalizeDisplayName(sources.fallback) ||
      String(senderId);
  }

  refreshMessageSenderNames(messages: readonly ChatMessage[]): ChatMessage[] {
    return messages.map((message) => {
      const senderName = this.resolveSenderName(
        message.senderId,
        message.chatType === "group" ? message.group_id : undefined,
        {
          nickname: message.senderNickname,
          card: message.senderCard,
          fallback: message.senderName,
        }
      );
      return senderName === message.senderName
        ? message
        : { ...message, senderName };
    });
  }

  private updateStatus(connected: boolean) {
    this.onStatusCallback?.(connected);
  }

  connect() {
    this.shouldReconnect = true;
    this.openSocket();
  }

  private openSocket() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const options: Record<string, unknown> = {};
    if (this.authHeader) {
      options.headers = this.authHeader;
    }

    const ws = new WebSocket(this.wsUrl, options);
    this.ws = ws;

    ws.on("open", () => {
      const displayUrl = this.wsUrl.replace(/(access_token=)[^&]+/, "$1***");
      logger.info("WebSocket connected", { url: displayUrl });
      this.updateStatus(true);
    });

    ws.on("message", (data: Buffer) => {
      try {
        const raw = data.toString();
        logger.debug("WS recv", { raw: raw.slice(0, 500) });
        const msg = JSON.parse(raw);
        this.handleMessage(msg);
      } catch {
        // ignore parse errors
      }
    });

    ws.on("close", (code) => {
      if (this.ws === ws) this.ws = null;
      const displayUrl = this.wsUrl.replace(/(access_token=)[^&]+/, "$1***");
      logger.warn("WebSocket disconnected", { code, url: displayUrl });
      this.updateStatus(false);
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), 3000);
      }
    });

    ws.on("error", (err) => {
      const displayUrl = this.wsUrl.replace(/(access_token=)[^&]+/, "$1***");
      logger.error("WebSocket error", { error: err.message, url: displayUrl });
      this.updateStatus(false);
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    if (msg.post_type === "message" || msg.post_type === "message_sent") {
      this.handleMessageEvent(msg as unknown as OneBotMessageEvent);
    } else if (msg.post_type === "meta_event") {
      if (msg.meta_event_type === "lifecycle") {
        this.selfId = (msg.self_id as number) || this.selfId;
      }
    } else if (msg.status !== undefined) {
      const echo = msg.echo as string | undefined;
      if (echo && this.pendingRequests.has(echo)) {
        this.pendingRequests.get(echo)!(msg as unknown as OneBotApiResponse);
        this.pendingRequests.delete(echo);
      }
    }
  }

  private handleMessageEvent(event: OneBotMessageEvent) {
    if (event.self_id) this.selfId = Number(event.self_id);

    const senderId = Number(event.user_id);
    const groupId = event.group_id === undefined ? undefined : Number(event.group_id);
    const targetId = event.target_id === undefined ? undefined : Number(event.target_id);
    const isSent = event.post_type === "message_sent";
    const contactId = event.message_type === "group"
      ? groupId ?? targetId
      : isSent
        ? targetId
        : senderId;

    if (!senderId || !contactId) {
      logger.warn("Ignored message with invalid routing fields", {
        post_type: event.post_type,
        message_type: event.message_type,
        user_id: event.user_id,
        group_id: event.group_id,
        target_id: event.target_id,
      });
      return;
    }

    const textContent = event.raw_message || this.extractText(event.message);
    const senderNickname = normalizeDisplayName(event.sender.nickname);
    const senderCard = normalizeDisplayName(event.sender.card);

    logger.info("Message received", {
      message_id: event.message_id,
      type: event.message_type,
      user_id: event.user_id,
      group_id: groupId,
      content: textContent.slice(0, 200),
    });

    const chatMessage: ChatMessage = {
      id: event.message_id,
      contactId,
      chatType: event.message_type,
      senderId,
      senderName: this.resolveSenderName(senderId, groupId, {
        nickname: senderNickname,
        card: senderCard,
      }),
      senderNickname,
      senderCard,
      content: textContent,
      timestamp: event.time * 1000,
      isMine: isSent || senderId === this.selfId,
      group_id: groupId,
      segments: event.message,
    };

    this.onMessageCallback?.(chatMessage);
  }

  private extractText(message: unknown): string {
    if (typeof message === "string") return message;
    if (Array.isArray(message)) {
      return message
        .filter(
          (seg: { type: string }) =>
            seg.type === "text"
        )
        .map((seg: { data: { text?: string } }) => seg.data.text || "")
        .join("");
    }
    return String(message);
  }

  private historyItemToChatMessage(
    item: Record<string, unknown>,
    contact: Contact
  ): ChatMessage | null {
    const sender = (item.sender || {}) as Partial<OneBotMessageEvent["sender"]>;
    const senderId = Number(item.user_id ?? sender.user_id ?? 0);
    const id = item.message_id;
    if ((typeof id !== "number" && typeof id !== "string") || !senderId) {
      return null;
    }

    const segments = Array.isArray(item.message)
      ? (item.message as OneBotMessageEvent["message"])
      : undefined;
    const rawMessage = item.raw_message;
    const chatType = contact.type === "group" ? "group" : "private";
    const senderNickname = normalizeDisplayName(sender.nickname);
    const senderCard = normalizeDisplayName(sender.card);
    const groupId = chatType === "group" ? contact.id : undefined;

    return {
      id,
      contactId: contact.id,
      chatType,
      senderId,
      senderName: this.resolveSenderName(senderId, groupId, {
        nickname: senderNickname,
        card: senderCard,
      }),
      senderNickname,
      senderCard,
      content:
        typeof rawMessage === "string"
          ? rawMessage
          : this.extractText(item.message),
      timestamp: Number(item.time || 0) * 1000,
      isMine: senderId === this.selfId,
      group_id: groupId,
      segments,
    };
  }

  async getChatHistory(contact: Contact, count = 20): Promise<ChatMessage[] | null> {
    const isGroup = contact.type === "group";
    const action = isGroup
      ? "get_group_msg_history"
      : "get_friend_msg_history";
    const params: Record<string, unknown> = {
      [isGroup ? "group_id" : "user_id"]: String(contact.id),
      count,
    };
    if (!isGroup) {
      params.message_seq = "0";
      params.reverseOrder = false;
    }

    const res = await this.callApi(action, params);
    const data = res.data as { messages?: unknown[] } | null;
    if (res.status !== "ok" || !Array.isArray(data?.messages)) {
      logger.warn("Failed to load message history", {
        type: contact.type,
        target: contact.id,
        retcode: res.retcode,
      });
      return null;
    }

    const messages = data.messages
      .map((item) =>
        item && typeof item === "object"
          ? this.historyItemToChatMessage(item as Record<string, unknown>, contact)
          : null
      )
      .filter((item): item is ChatMessage => item !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
    logger.info("Message history loaded", {
      type: contact.type,
      target: contact.id,
      count: messages.length,
    });
    return messages;
  }

  async sendMessage(
    chatType: "private" | "group",
    targetId: number,
    content: string | MessageSegment[]
  ): Promise<number | string | null> {
    const action =
      chatType === "private" ? "send_private_msg" : "send_group_msg";
    const params: Record<string, unknown> = {
      message: content,
    };

    if (chatType === "private") {
      params.user_id = targetId;
    } else {
      params.group_id = targetId;
    }

    const res = await this.callApi(action, params);
    const rawId =
      res.data && typeof res.data === "object"
        ? (res.data as Record<string, unknown>).message_id
        : undefined;
    if (
      res.status === "ok" &&
      ((typeof rawId === "number" && Number.isFinite(rawId)) ||
        (typeof rawId === "string" && rawId.length > 0))
    ) {
      const id = rawId as number | string;
      logger.info("Message sent", { message_id: id, type: chatType, target: targetId });
      return id;
    }
    logger.warn("Send message failed", { type: chatType, target: targetId, retcode: res.retcode });
    return null;
  }

  async getCustomFaces(
    count = DEFAULT_CUSTOM_FACE_COUNT,
    action = "fetch_custom_face"
  ): Promise<string[] | null> {
    const res = await this.callApi(action, { count }, CUSTOM_FACE_REQUEST_TIMEOUT_MS);
    if (res.status !== "ok") {
      logger.info("Custom face capability unavailable", {
        action,
        retcode: res.retcode,
      });
      return null;
    }

    const raw = res.data;
    const values = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { faces?: unknown }).faces)
        ? (raw as { faces: unknown[] }).faces
        : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
          ? (raw as { data: unknown[] }).data
          : null;
    if (!values) {
      logger.warn("Custom face response has an unexpected shape", {
        action,
        dataType: raw === null ? "null" : typeof raw,
      });
      return null;
    }

    const files = values.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const file = record.url ?? record.file ?? record.path;
      return typeof file === "string" ? [file] : [];
    });
    logger.info("Custom faces loaded", { action, count: files.length });
    return files;
  }

  async getForwardMessage(id: string, inlineContent?: unknown): Promise<ForwardNode[] | null> {
    if (inlineContent !== undefined) {
      const inlineNodes = parseForwardNodes(inlineContent, true);
      if (inlineNodes) {
        logger.info("Inline forward message loaded", {
          id,
          count: inlineNodes.length,
        });
        return inlineNodes;
      }
    }

    // OneBot v11 names this parameter `id`; NapCat uses `message_id`.
    // Both implementations ignore unknown extra parameters.
    const res = await this.callApi("get_forward_msg", { id, message_id: id });
    const data = res.data as { message?: unknown; messages?: unknown } | null;
    const rawNodes = Array.isArray(data?.message)
      ? data.message
      : Array.isArray(data?.messages)
        ? data.messages
        : null;
    if (res.status !== "ok" || !rawNodes) {
      logger.warn("Failed to load forward message", {
        id,
        retcode: res.retcode,
        dataType: data === null ? "null" : typeof data,
        dataKeys: data && typeof data === "object" ? Object.keys(data) : [],
      });
      return null;
    }

    const nodes = parseForwardNodes(rawNodes) || [];

    logger.info("Forward message loaded", { id, count: nodes.length });
    return nodes;
  }

  async getImageUrl(file: string): Promise<string | null> {
    const res = await this.callApi("get_image", { file });
    const data = res.data as { url?: unknown } | null;
    if (res.status === "ok" && typeof data?.url === "string") {
      logger.info("Image URL refreshed", { file });
      return data.url;
    }
    logger.warn("Failed to refresh image URL", { file, retcode: res.retcode });
    return null;
  }

  private callApi(
    action: string,
    params?: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<OneBotApiResponse> {
    return new Promise((resolve) => {
      const echo = String(++this.echoCounter);
      const request: OneBotApiRequest = { action, params, echo };

      let timer: ReturnType<typeof setTimeout> | null = null;
      const settle = (res: OneBotApiResponse) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (this.pendingRequests.get(echo) === settle) {
          this.pendingRequests.delete(echo);
        }
        resolve(res);
      };

      this.pendingRequests.set(echo, settle);
      timer = setTimeout(() => {
        if (this.pendingRequests.get(echo) !== settle) return;
        this.pendingRequests.delete(echo);
        logger.warn("API call timed out", { action, echo, timeoutMs });
        resolve({
          status: "failed",
          retcode: -2,
          data: null,
          echo,
        });
      }, Math.max(timeoutMs, 1));

      if (this.ws?.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(request);
        logger.debug("WS send", { action, echo, params: JSON.stringify(params || {}).slice(0, 200) });
        this.ws.send(payload);
      } else {
        logger.warn("API call skipped (not connected)", { action });
        settle({
          status: "failed",
          retcode: -1,
          data: null,
          echo,
        });
      }
    });
  }

  async getFriendList(): Promise<Contact[]> {
    const res = await this.callApi("get_friend_list");
    if (res.status === "ok" && Array.isArray(res.data)) {
      this.friendRemarks.clear();
      const list = (res.data as Array<Record<string, unknown>>).flatMap((f) => {
        const id = Number(f.user_id);
        if (!Number.isFinite(id)) return [];

        const nickname = normalizeDisplayName(f.nickname) || String(id);
        const remark = normalizeDisplayName(f.remark);
        if (remark) this.friendRemarks.set(String(id), remark);

        return [{
          id,
          name: remark || nickname,
          type: "friend" as const,
          ...(remark ? { remark } : {}),
        }];
      });
      this.notifySenderNamesChanged();
      logger.info("Friend list loaded", { count: list.length });
      return list;
    }
    logger.warn("Failed to load friend list", { retcode: res.retcode });
    return [];
  }

  async getGroupList(): Promise<Contact[]> {
    const res = await this.callApi("get_group_list");
    if (res.status === "ok" && Array.isArray(res.data)) {
      const list = (res.data as Array<{ group_id: number; group_name: string }>).map((g) => ({
        id: g.group_id,
        name: g.group_name,
        type: "group" as const,
        group_id: g.group_id,
      }));
      logger.info("Group list loaded", { count: list.length });
      return list;
    }
    logger.warn("Failed to load group list", { retcode: res.retcode });
    return [];
  }

  async getGroupMemberList(groupId: number): Promise<GroupMember[]> {
    const res = await this.callApi("get_group_member_list", {
      group_id: groupId,
    });
    if (res.status !== "ok" || !Array.isArray(res.data)) {
      logger.warn("Failed to load group member list", {
        group_id: groupId,
        retcode: res.retcode,
      });
      return [];
    }

    const list = (res.data as Array<Record<string, unknown>>).flatMap((item) => {
      const rawId = item.user_id;
      if (typeof rawId !== "number" && typeof rawId !== "string") return [];

      const userId = String(rawId);
      const nickname = normalizeDisplayName(item.nickname) || userId;
      const card = normalizeDisplayName(item.card);
      const remark = normalizeDisplayName(this.friendRemarks.get(userId));
      const role = normalizeDisplayName(item.role);
      return [{
        userId,
        nickname,
        ...(card ? { card } : {}),
        ...(remark ? { remark } : {}),
        ...(role ? { role } : {}),
      }];
    });
    this.groupMemberCache.set(
      groupId,
      new Map(list.map((member) => [member.userId, member]))
    );
    this.notifySenderNamesChanged();
    logger.info("Group member list loaded", { group_id: groupId, count: list.length });
    return list;
  }

  async getRecentContactActivity(
    count: number
  ): Promise<Array<{ contact: Contact; timestamp: number }>> {
    const res = await this.callApi("get_recent_contact", { count });
    if (res.status !== "ok" || !Array.isArray(res.data)) {
      logger.warn("Recent contact activity unavailable", {
        retcode: res.retcode,
      });
      return [];
    }

    const activity = (res.data as Array<{
      peerUin?: string | number;
      msgTime?: string | number;
      chatType?: number;
      peerName?: string;
    }>)
      .map((item) => {
        const id = Number(item.peerUin);
        const timestamp = Number(item.msgTime) * 1000;
        const type =
          item.chatType === 2
            ? "group" as const
            : item.chatType === 1
            ? "friend" as const
            : null;
        if (!type || !Number.isFinite(id) || !Number.isFinite(timestamp)) {
          return null;
        }
        return {
          contact: {
            id,
            name: item.peerName || String(id),
            type,
          },
          timestamp,
        };
      })
      .filter(
        (
          item
        ): item is {
          contact: Contact;
          timestamp: number;
        } => item !== null
      );

    logger.info("Recent contact activity loaded", { count: activity.length });
    return activity;
  }

  async getLoginInfo(): Promise<{ user_id: number; nickname: string }> {
    const res = await this.callApi("get_login_info");
    if (res.status === "ok") {
      const data = res.data as { user_id: number; nickname: string };
      this.selfId = data.user_id;
      this.nickname = data.nickname;
      logger.info("Login info loaded", { user_id: data.user_id, nickname: data.nickname });
      return data;
    }
    logger.warn("Failed to load login info", { retcode: res.retcode });
    return { user_id: 0, nickname: "" };
  }

  getSelfId() {
    return this.selfId;
  }

  getNickname() {
    return this.nickname;
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
