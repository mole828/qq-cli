import { WebSocket } from "ws";
import { logger } from "./logger.js";
import type {
  OneBotMessageEvent,
  OneBotApiRequest,
  OneBotApiResponse,
  Contact,
  ChatMessage,
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
    const options: Record<string, unknown> = {};
    if (this.authHeader) {
      options.headers = this.authHeader;
    }

    this.ws = new WebSocket(this.wsUrl, options);

    this.ws.on("open", () => {
      const displayUrl = this.wsUrl.replace(/(access_token=)[^&]+/, "$1***");
      logger.info("WebSocket connected", { url: displayUrl });
      this.updateStatus(true);
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        const raw = data.toString();
        logger.debug("WS recv", { raw: raw.slice(0, 500) });
        const msg = JSON.parse(raw);
        this.handleMessage(msg);
      } catch {
        // ignore parse errors
      }
    });

    this.ws.on("close", (code) => {
      const displayUrl = this.wsUrl.replace(/(access_token=)[^&]+/, "$1***");
      logger.warn("WebSocket disconnected", { code, url: displayUrl });
      this.updateStatus(false);
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      const displayUrl = this.wsUrl.replace(/(access_token=)[^&]+/, "$1***");
      logger.error("WebSocket error", { error: err.message, url: displayUrl });
      this.updateStatus(false);
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    if (msg.post_type === "message") {
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
    if (event.self_id) this.selfId = event.self_id;

    const textContent = event.raw_message || this.extractText(event.message);

    logger.info("Message received", {
      message_id: event.message_id,
      type: event.message_type,
      user_id: event.user_id,
      group_id: event.group_id,
      content: textContent.slice(0, 200),
    });

    const chatMessage: ChatMessage = {
      id: event.message_id,
      contactId:
        event.message_type === "private" ? event.user_id : event.group_id!,
      chatType: event.message_type,
      senderId: event.user_id,
      senderName: event.sender.nickname || String(event.user_id),
      content: textContent,
      timestamp: event.time * 1000,
      isMine: event.user_id === this.selfId,
      group_id: event.group_id,
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

  async sendMessage(
    chatType: "private" | "group",
    targetId: number,
    content: string
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
    this.ws?.close();
    this.ws = null;
  }
}
