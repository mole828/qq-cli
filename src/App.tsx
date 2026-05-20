import React, { useEffect, useState, useRef, useMemo } from "react";
import { Box, Text, useInput, useStdout, useApp } from "ink";
import TextInput from "ink-text-input";
import type { Contact, ChatMessage } from "./types.js";
import { QQClient } from "./qq-client.js";

const MAX_MESSAGES = 50;

const HELP_ROWS = [
  ["/session <name|id>", "Open the session picker or jump to one match"],
  ["/contacts [query]", "Search all contacts"],
  ["/groups [query]", "Search group chats"],
  ["/friends [query]", "Search friends"],
  ["/reload", "Reload login info and contact lists"],
  ["/help", "Show this command panel"],
  ["Tab", "Cycle sessions"],
  ["Esc", "Close panel or clear input"],
  ["Ctrl+Q / Ctrl+C", "Quit"],
] as const;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function charWidth(char: string) {
  const code = char.codePointAt(0) || 0;
  if (
    code === 0 ||
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  ) {
    return 0;
  }

  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 2;
  }

  return 1;
}

function textWidth(value: string) {
  return Array.from(value).reduce((width, char) => width + charWidth(char), 0);
}

function truncateCells(value: string, max: number) {
  const text = singleLine(value);
  if (max <= 0) return "";
  if (textWidth(text) <= max) return text;
  if (max <= 1) return "…";

  let width = 0;
  let result = "";
  for (const char of Array.from(text)) {
    const next = width + charWidth(char);
    if (next > max - 1) break;
    result += char;
    width = next;
  }

  return `${result}…`;
}

export function App() {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const termWidth = stdout?.columns || 80;
  const termHeight = stdout?.rows || 24;

  const qqRef = useRef<QQClient | null>(null);
  const loadedRef = useRef(false);
  const activeSessionRef = useRef<Contact | null>(null);

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState(0);
  const [nickname, setNickname] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSession, setActiveSession] = useState<Contact | null>(null);
  const [inputText, setInputText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [helpMode, setHelpMode] = useState(false);

  // ---- scrollable picker modal ----
  const [modalMode, setModalMode] = useState(false);
  const [modalBaseList, setModalBaseList] = useState<Contact[]>([]);
  const [modalHighlight, setModalHighlight] = useState(0);
  const [modalScrollOff, setModalScrollOff] = useState(0);

  const activeMessages = activeSession
    ? messages.filter(
        (m) =>
          m.contactId === activeSession.id ||
          (m.chatType === "group" && m.group_id === activeSession.id)
      )
    : [];

  const visibleMsgs = activeMessages.slice(-MAX_MESSAGES);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // ---- WebSocket connection ----
  useEffect(() => {
    const client = new QQClient(
      process.env.ONEBOT_WS_URL || "ws://localhost:3001"
    );
    qqRef.current = client;

    client.onStatus((status) => {
      setConnected(status);
      if (status) setStatusMsg("Connected");
      else setStatusMsg("Reconnecting...");
    });

    client.onMessage((msg) => {
      setMessages((prev) => [...prev, msg]);
      const current = activeSessionRef.current;
      if (!current || current.id !== msg.contactId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.contactId]: (prev[msg.contactId] || 0) + 1,
        }));
      }
    });

    client.connect();

    return () => {
      client.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!connected || loadedRef.current) return;

    (async () => {
      const client = qqRef.current;
      if (!client) return;

      try {
        const info = await client.getLoginInfo();
        if (!info.user_id) return;
        setSelfId(info.user_id);
        setNickname(info.nickname);
        loadedRef.current = true;

        const friends = await client.getFriendList();
        const groups = await client.getGroupList();
        const all = [...friends, ...groups];
        setContacts(all);
        setStatusMsg(`${all.length} contacts loaded`);
      } catch {
        setStatusMsg("Failed to load contacts");
      }
    })();
  }, [connected]);

  // ---- picker computations ----
  const filterText = inputText.trim().toLowerCase();

  const lastMessageByContact = useMemo(() => {
    const latest = new Map<number, ChatMessage>();
    for (const msg of messages) {
      const prev = latest.get(msg.contactId);
      if (!prev || msg.timestamp > prev.timestamp) {
        latest.set(msg.contactId, msg);
      }
    }
    return latest;
  }, [messages]);

  const orderContacts = (list: Contact[]) =>
    [...list].sort((a, b) => {
      const unreadDiff = (unreadCounts[b.id] || 0) - (unreadCounts[a.id] || 0);
      if (unreadDiff !== 0) return unreadDiff;

      const aActive = activeSession?.id === a.id ? 1 : 0;
      const bActive = activeSession?.id === b.id ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;

      return (
        (lastMessageByContact.get(b.id)?.timestamp || 0) -
        (lastMessageByContact.get(a.id)?.timestamp || 0)
      );
    });

  const filteredContacts = useMemo(() => {
    if (!modalMode) return [] as Contact[];
    const f = filterText;
    const matched = !f ? modalBaseList : modalBaseList.filter(
      (c) =>
        c.name.toLowerCase().includes(f) ||
        String(c.id).includes(f)
    );
    return orderContacts(matched);
  }, [
    activeSession?.id,
    filterText,
    lastMessageByContact,
    modalBaseList,
    modalMode,
    unreadCounts,
  ]);

  const maxModalHeight = Math.max(Math.floor((termHeight - 11) / 2), 3);

  // reset highlight & scroll when filter changes
  useEffect(() => {
    if (!modalMode) return;
    setModalHighlight(0);
    setModalScrollOff(0);
  }, [modalMode, filterText]);

  // picker handleSubmit - Enter selects highlighted contact
  function handleSubmit(value: string) {
    if (helpMode) {
      setHelpMode(false);
      setInputText("");
      return;
    }

    if (modalMode) {
      if (filteredContacts.length === 0) {
        setStatusMsg("No matching contacts");
        return;
      }
      const idx = clamp(modalHighlight, 0, filteredContacts.length - 1);
      handleSession(filteredContacts[idx].id);
      closeModal();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      handleCommand(trimmed);
    } else {
      handleSend(trimmed);
    }
  }

  // ---- modal helpers ----
  function openModal(baseList: Contact[], preFill: string) {
    setHelpMode(false);
    setModalBaseList(baseList);
    setModalMode(true);
    setModalHighlight(0);
    setModalScrollOff(0);
    setInputText(preFill);
  }

  function closeModal() {
    setModalMode(false);
    setModalBaseList([]);
    setModalHighlight(0);
    setModalScrollOff(0);
    setInputText("");
  }

  // ---- key bindings ----
  useInput((input, key) => {
    if (key.ctrl && (input === "q" || input === "c")) {
      exit();
      return;
    }

    if (key.escape) {
      if (helpMode) {
        setHelpMode(false);
      } else if (modalMode) {
        closeModal();
      } else {
        setInputText("");
      }
      return;
    }

    if (helpMode) {
      return;
    }

    // ---- picker navigation ----
    if (modalMode) {
      const total = filteredContacts.length;
      if (total === 0) {
        // allow typing but block nav when list is empty
        return;
      }
      if (key.upArrow) {
        setModalHighlight((h) => {
          const next = h > 0 ? h - 1 : total - 1;
          setModalScrollOff((prevScroll) =>
            next < prevScroll ? next : prevScroll
          );
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setModalHighlight((h) => {
          const next = h < total - 1 ? h + 1 : 0;
          setModalScrollOff((prevScroll) =>
            next >= prevScroll + maxModalHeight
              ? next - maxModalHeight + 1
              : prevScroll
          );
          return next;
        });
        return;
      }
      if (key.pageDown) {
        setModalHighlight((h) => {
          const next = clamp(h + maxModalHeight, 0, total - 1);
          setModalScrollOff(() =>
            clamp(
              next - Math.floor(maxModalHeight / 2),
              0,
              Math.max(total - maxModalHeight, 0)
            )
          );
          return next;
        });
        return;
      }
      if (key.pageUp) {
        setModalHighlight((h) => {
          const next = clamp(h - maxModalHeight, 0, total - 1);
          setModalScrollOff(() =>
            clamp(
              next - Math.floor(maxModalHeight / 2),
              0,
              Math.max(total - maxModalHeight, 0)
            )
          );
          return next;
        });
        return;
      }
      return;
    }

    // ---- normal mode keys ----
    if (key.tab) {
      if (contacts.length > 0) {
        const next = (() => {
          const prev = activeSession;
          if (!prev) return contacts[0];
          const idx = contacts.findIndex((c) => c.id === prev.id);
          return contacts[(idx + 1) % contacts.length];
        })();
        handleSession(next.id);
      }
      return;
    }

    if (key.upArrow) {
      if (inputText.startsWith("/session ")) {
        const partial = inputText.slice("/session ".length).toLowerCase();
        const matched = contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(partial) ||
            String(c.id).includes(partial)
        );
        if (matched.length > 0) {
          const idx = matched.findIndex((c) => c.id === activeSession?.id);
          const next = idx < 0 ? 0 : (idx + 1) % matched.length;
          handleSession(matched[next].id);
          setInputText("");
          setStatusMsg(matched[next].name);
        }
        return;
      }
      if (activeSession && contacts.length > 1) {
        const idx = contacts.findIndex((c) => c.id === activeSession.id);
        const prev = idx > 0 ? contacts[idx - 1] : contacts[contacts.length - 1];
        handleSession(prev.id);
        setInputText("");
      }
      return;
    }

    if (key.downArrow) {
      if (inputText.startsWith("/session ")) {
        const partial = inputText.slice("/session ".length).toLowerCase();
        const matched = contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(partial) ||
            String(c.id).includes(partial)
        );
        if (matched.length > 0) {
          const idx = matched.findIndex((c) => c.id === activeSession?.id);
          const prev = idx <= 0 ? matched.length - 1 : idx - 1;
          handleSession(matched[prev].id);
          setInputText("");
          setStatusMsg(matched[prev].name);
        }
        return;
      }
      if (activeSession && contacts.length > 1) {
        const idx = contacts.findIndex((c) => c.id === activeSession.id);
        const next = idx < contacts.length - 1 ? contacts[idx + 1] : contacts[0];
        handleSession(next.id);
        setInputText("");
      }
      return;
    }
  });

  function handleSession(id: number) {
    const contact = contacts.find((c) => c.id === id);
    if (contact) {
      setActiveSession(contact);
      setUnreadCounts((prev) => {
        if (!prev[contact.id]) return prev;
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
      setStatusMsg(`Session: ${contact.name}`);
    }
  }

  // ---- commands ----
  function handleCommand(cmd: string) {
    const parts = cmd.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    switch (command) {
      case "/session":
      case "/s": {
        if (!args) {
          openModal(contacts, "");
          return;
        }
        const q = args.toLowerCase();
        const matched = contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            String(c.id).includes(q)
        );
        if (matched.length === 1) {
          handleSession(matched[0].id);
          setInputText("");
        } else {
          openModal(contacts, args);
        }
        break;
      }
      case "/contacts":
      case "/c": {
        openModal(contacts, args.toLowerCase());
        break;
      }
      case "/groups":
      case "/g": {
        const bases = contacts.filter((c) => c.type === "group");
        openModal(bases, args.toLowerCase());
        break;
      }
      case "/friends":
      case "/f": {
        const bases = contacts.filter((c) => c.type === "friend");
        openModal(bases, args.toLowerCase());
        break;
      }
      case "/reload":
        loadedRef.current = false;
        setInputText("");
        setStatusMsg("Reloading contacts...");
        break;
      case "/help":
      case "/h":
      case "/?":
        setHelpMode(true);
        setInputText("");
        setStatusMsg("Help");
        break;
      case "/quit":
      case "/q":
        exit();
        break;
      default:
        setInputText("");
        setStatusMsg(`Unknown command: ${command}. Try /help`);
        break;
    }
  }

  async function handleSend(text: string) {
    setInputText("");
    if (!activeSession || !qqRef.current) {
      setStatusMsg("No active session. Use /session <name>");
      return;
    }

    const chatType = activeSession.type === "group" ? "group" : "private";

    try {
      await qqRef.current.sendMessage(chatType, activeSession.id, text);
      const sent: ChatMessage = {
        id: Date.now(),
        contactId: activeSession.id,
        chatType,
        senderId: selfId,
        senderName: nickname || "Me",
        content: text,
        timestamp: Date.now(),
        isMine: true,
        group_id: activeSession.type === "group" ? activeSession.id : undefined,
      };
      setMessages((prev) => [...prev, sent]);
    } catch {
      setStatusMsg("Send failed");
    }
  }

  // ---- render helpers ----
  function formatTime(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  function decodeCQValue(value: string) {
    return value
      .replace(/&#91;/g, "[")
      .replace(/&#93;/g, "]")
      .replace(/&amp;/g, "&");
  }

  function compactCQ(raw: string) {
    return raw.replace(/\[CQ:([^,\]]+)((?:,[^\]]*)?)\]/g, (_, type: string, attrs: string) => {
      const data = new Map<string, string>();
      for (const pair of attrs.slice(1).split(",")) {
        const eq = pair.indexOf("=");
        if (eq > 0) {
          data.set(pair.slice(0, eq), decodeCQValue(pair.slice(eq + 1)));
        }
      }

      switch (type) {
        case "image":
          return data.get("summary") || "[image]";
        case "record":
          return "[voice]";
        case "video":
          return "[video]";
        case "reply":
          return "[reply]";
        case "at":
          return `@${data.get("qq") || "user"}`;
        case "face":
          return "[face]";
        case "forward":
          return "[forward]";
        default:
          return `[${type}]`;
      }
    });
  }

  function compactMessage(msg: ChatMessage) {
    if (msg.segments?.length) {
      const parts = msg.segments.map((seg) => {
        switch (seg.type) {
          case "text":
            return seg.data.text || "";
          case "image":
            return seg.data.summary || "[image]";
          case "record":
            return "[voice]";
          case "video":
            return "[video]";
          case "reply":
            return "[reply]";
          case "at":
            return `@${seg.data.qq || "user"}`;
          case "face":
            return "[face]";
          case "forward":
            return "[forward]";
          default:
            return `[${seg.type}]`;
        }
      });
      return parts.join(" ");
    }

    return compactCQ(msg.content);
  }

  function renderContactLine(c: Contact, highlighted: boolean) {
    const marker = highlighted ? "›" : " ";
    const icon = c.type === "group" ? "#" : "@";
    const unread = unreadCounts[c.id] || 0;
    const lastMessage = lastMessageByContact.get(c.id);
    const latest = lastMessage
      ? `${lastMessage.senderId === selfId ? "you" : lastMessage.senderName}: ${compactMessage(lastMessage)}`
      : c.type === "group"
      ? "Group chat"
      : "Friend";
    const nameWidth = Math.max(termWidth - (unread ? 24 : 16), 18);

    return (
      <Box key={c.id} flexDirection="column">
        <Box justifyContent="space-between" height={1} overflow="hidden">
          <Text color={highlighted ? "yellow" : undefined} bold={highlighted} wrap="truncate-end">
            {marker} {icon} {truncateCells(c.name, nameWidth)}
          </Text>
          <Text color={unread > 0 ? "green" : "gray"} bold={unread > 0}>
            {unread > 0 ? `${unread > 99 ? "99+" : unread} new` : String(c.id)}
          </Text>
        </Box>
        <Box paddingLeft={2} height={1} overflow="hidden">
          <Text dimColor wrap="truncate-end">{truncateCells(latest, Math.max(termWidth - 10, 24))}</Text>
        </Box>
      </Box>
    );
  }

  function renderHelpPanel() {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">Command palette</Text>
        <Box marginTop={1} flexDirection="column">
          {HELP_ROWS.map(([keyName, description]) => (
            <Box key={keyName}>
              <Box width={22}>
                <Text color="yellow">{keyName}</Text>
              </Box>
              <Text dimColor>{description}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  function renderEmptyState() {
    if (activeSession) {
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text color="cyan" bold>
            {truncateCells(activeSession.name, Math.max(termWidth - 4, 10))}
          </Text>
          <Text color="gray" dimColor>
            No messages in this local session yet. Type below to send the first one.
          </Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color={connected ? "cyan" : "yellow"} bold>
          {connected ? "Ready" : "Connecting"}
        </Text>
        <Text color="gray" dimColor>
          {connected
            ? "Use /session to pick a chat, /groups for group chats, or /help for commands."
            : "Waiting for OneBot WebSocket. Check ONEBOT_WS_URL if this stays here."}
        </Text>
      </Box>
    );
  }

  function renderMessageRow(msg: ChatMessage, i: number) {
    const isMine = msg.senderId === selfId;
    const time = formatTime(msg.timestamp);
    const sender = isMine ? "you" : msg.senderName || String(msg.senderId);
    const nameWidth = activeSession?.type === "group" ? 14 : 10;
    const contentWidth = Math.max(termWidth - nameWidth - 10, 16);
    const content = compactMessage(msg);

    return (
      <Box key={`${msg.id}-${i}`} flexDirection="row" paddingX={1} height={1} overflow="hidden">
        <Box width={6}>
          <Text dimColor>{time}</Text>
        </Box>
        <Box width={nameWidth + 1}>
          <Text color={isMine ? "green" : "cyan"} bold wrap="truncate-end">
            {truncateCells(sender, nameWidth)}
          </Text>
        </Box>
        <Box width={contentWidth}>
          <Text color={isMine ? "green" : "white"} wrap="truncate-end">
            {truncateCells(content || "(empty)", contentWidth)}
          </Text>
        </Box>
      </Box>
    );
  }

  const divider = termWidth > 60
    ? "─".repeat(termWidth)
    : "────";
  const composerRows = 5;
  const bodyRows = Math.max(termHeight - composerRows - 3, 1);
  const unreadTotal = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  const composerWidth = Math.max(termWidth - 2, 30);
  const composerHint = helpMode
    ? "Esc"
    : modalMode
    ? "↑↓ PgUp PgDn"
    : "/help /session /groups /friends";
  const composerStatus = helpMode
    ? "Help"
    : modalMode
    ? `Enter=open · Esc=close · ${unreadTotal} unread`
    : statusMsg || (connected ? "Ready" : "Connecting");
  const composerStatusWidth = Math.max(
    composerWidth - composerHint.length - 8,
    10
  );

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Header */}
      <Box flexDirection="row" paddingX={1} height={1} overflow="hidden">
        <Text bold color="magenta">
          QQ-CLI
        </Text>
        {connected ? (
          <Text color="green" bold>
            {" ● "}
          </Text>
        ) : (
          <Text color="red" bold>
            {" ● "}
          </Text>
        )}
        {nickname && (
          <Text color="white" wrap="truncate-end">@{truncateCells(nickname, Math.max(termWidth - 20, 8))}</Text>
        )}
        <Text dimColor> · {contacts.length}c</Text>
        {activeSession && (
          <>
            <Text dimColor> ─ </Text>
            <Text color="yellow" bold>
              {truncateCells(activeSession.name, Math.max(termWidth - 28, 8))}
            </Text>
            <Text dimColor>
              {activeSession.type === "group" ? " [group]" : ""}
            </Text>
          </>
        )}
      </Box>

      <Box>
        <Text color="gray" dimColor>{divider}</Text>
      </Box>

      {/* Body */}
      <Box flexDirection="column" height={bodyRows} flexShrink={1} overflow="hidden">
        {helpMode ? (
          renderHelpPanel()
        ) : modalMode ? (
          <Box flexDirection="column" paddingX={1} flexGrow={1}>
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="cyan">Select session</Text>
              <Text dimColor>
                {unreadTotal > 0 ? `${unreadTotal} unread · ` : ""}
                {filteredContacts.length} match{filteredContacts.length !== 1 ? "es" : ""}
              </Text>
            </Box>

            {modalScrollOff > 0 && (
              <Text dimColor>↑ {modalScrollOff} more</Text>
            )}

            {filteredContacts
              .slice(modalScrollOff, modalScrollOff + maxModalHeight)
              .map((c, i) =>
                renderContactLine(c, modalScrollOff + i === modalHighlight)
              )}

            {filteredContacts.length > modalScrollOff + maxModalHeight && (
              <Text dimColor>
                ↓ {filteredContacts.length - modalScrollOff - maxModalHeight} more
              </Text>
            )}

            {filteredContacts.length === 0 && (
              <Text dimColor>No matching contacts.</Text>
            )}
          </Box>
        ) : visibleMsgs.length === 0 ? (
          renderEmptyState()
        ) : (
          visibleMsgs.slice(-bodyRows).map(renderMessageRow)
        )}
      </Box>

      {/* Composer */}
      <Box paddingX={1} paddingBottom={1} height={composerRows} flexShrink={0} overflow="hidden">
        <Box
          flexDirection="column"
          width={composerWidth}
          borderStyle="round"
          borderColor={connected ? "gray" : "yellow"}
          paddingX={1}
        >
          <Box flexDirection="row" height={1} overflow="hidden">
            <Text color="yellow" bold>› </Text>
            <TextInput
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSubmit}
              focus={true}
              placeholder={
                helpMode
                  ? "Esc to close help"
                  : modalMode
                  ? "Filter sessions, then Enter"
                  : activeSession
                  ? `Message ${truncateCells(activeSession.name, Math.max(composerWidth - 14, 8))}`
                  : "Ask /session to choose a chat"
              }
            />
          </Box>
          <Box justifyContent="space-between">
            <Box width={composerStatusWidth}>
              <Text color="gray" dimColor wrap="truncate-end">
                {composerStatus}
              </Text>
            </Box>
            <Text color="gray" dimColor>
              {composerHint}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
