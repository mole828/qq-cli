import { WebSocket } from "ws";
import { logger } from "./logger.js";
import type {
  OneBotMessageEvent,
  OneBotApiRequest,
  OneBotApiResponse,
  Contact,
  ChatMessage,
  MessageSegment,
  ForwardNode,
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

  private onMessageCallback: ((msg: ChatMessage) => void) | null = null;
  private onContactsCallback: ((contacts: Contact[]) => void) | null = null;
  private onStatusCallback: ((connected: boolean) => void) | null = null;

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
      senderName: event.sender.card || event.sender.nickname || String(senderId),
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

    return {
      id,
      contactId: contact.id,
      chatType,
      senderId,
      senderName: sender.card || sender.nickname || String(senderId),
      content:
        typeof rawMessage === "string"
          ? rawMessage
          : this.extractText(item.message),
      timestamp: Number(item.time || 0) * 1000,
      isMine: senderId === this.selfId,
      group_id: chatType === "group" ? contact.id : undefined,
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
  ): Promise<number | null> {
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
    if (res.status === "ok" && typeof (res.data as Record<string, unknown>)?.message_id === "number") {
      const id = (res.data as Record<string, number>).message_id;
      logger.info("Message sent", { message_id: id, type: chatType, target: targetId });
      return id;
    }
    logger.warn("Send message failed", { type: chatType, target: targetId, retcode: res.retcode });
    return null;
  }

  async getForwardMessage(id: string): Promise<ForwardNode[] | null> {
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

    const nodes = rawNodes.flatMap((item): ForwardNode[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const node = record.type === "node" && record.data && typeof record.data === "object"
        ? record.data as Record<string, unknown>
        : record;
      const sender = node.sender && typeof node.sender === "object"
        ? node.sender as Record<string, unknown>
        : {};
      const content = node.content ?? node.message;
      const segments: MessageSegment[] = Array.isArray(content)
        ? content.filter((part): part is MessageSegment =>
            Boolean(part) &&
            typeof part === "object" &&
            typeof (part as { type?: unknown }).type === "string" &&
            Boolean((part as { data?: unknown }).data) &&
            typeof (part as { data?: unknown }).data === "object"
          )
        : typeof content === "string"
          ? [{ type: "text", data: { text: content } }]
          : [];
      const rawSenderId = node.user_id ?? node.uin ?? sender.user_id ?? sender.uin;
      const senderId = rawSenderId === undefined ? undefined : String(rawSenderId);
      const timestamp = Number(node.time);
      return [{
        senderId,
        senderName: typeof (node.nickname ?? node.name ?? sender.nickname) === "string"
          ? String(node.nickname ?? node.name ?? sender.nickname)
          : senderId || "unknown",
        timestamp: Number.isFinite(timestamp) ? timestamp * 1000 : undefined,
        segments,
      }];
    });

    logger.info("Forward message loaded", { id, count: nodes.length });
    return nodes;
  }

  private callApi(
    action: string,
    params?: Record<string, unknown>
  ): Promise<OneBotApiResponse> {
    return new Promise((resolve) => {
      const echo = String(++this.echoCounter);
      const request: OneBotApiRequest = { action, params, echo };

      this.pendingRequests.set(echo, resolve);

      if (this.ws?.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(request);
        logger.debug("WS send", { action, echo, params: JSON.stringify(params || {}).slice(0, 200) });
        this.ws.send(payload);
      } else {
        logger.warn("API call skipped (not connected)", { action });
        resolve({
          status: "failed",
          retcode: -1,
          data: null,
          echo,
        });
        this.pendingRequests.delete(echo);
      }
    });
  }

  async getFriendList(): Promise<Contact[]> {
    const res = await this.callApi("get_friend_list");
    if (res.status === "ok" && Array.isArray(res.data)) {
      const list = (res.data as Array<{ user_id: number; nickname: string; remark?: string }>).map((f) => ({
        id: f.user_id,
        name: f.remark || f.nickname,
        type: "friend" as const,
        remark: f.nickname,
      }));
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
