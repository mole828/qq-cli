import React, { useEffect, useState, useRef, useMemo } from "react";
import { Box, Text, useInput, useStdout, useApp } from "ink";
import TextInput from "ink-text-input";
import type { Contact, ChatMessage } from "./types.js";
import { QQClient } from "./qq-client.js";

const MAX_MESSAGES = 50;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function App() {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const termWidth = stdout?.columns || 80;
  const termHeight = stdout?.rows || 24;

  const qqRef = useRef<QQClient | null>(null);
  const loadedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState(0);
  const [nickname, setNickname] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSession, setActiveSession] = useState<Contact | null>(null);
  const [inputText, setInputText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

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

  const filteredContacts = useMemo(() => {
    if (!modalMode) return [] as Contact[];
    const f = filterText;
    if (!f) return modalBaseList;
    return modalBaseList.filter(
      (c) =>
        c.name.toLowerCase().includes(f) ||
        String(c.id).includes(f)
    );
  }, [modalMode, modalBaseList, filterText]);

  const maxModalHeight = Math.max(termHeight - 7, 6);

  // reset highlight & scroll when filter changes
  useEffect(() => {
    if (!modalMode) return;
    setModalHighlight(0);
    setModalScrollOff(0);
  }, [modalMode, filterText]);

  // picker handleSubmit - Enter selects highlighted contact
  function handleSubmit(value: string) {
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
    if (key.ctrl && input === "q") {
      exit();
      return;
    }

    if (key.escape) {
      if (modalMode) {
        closeModal();
      } else {
        setInputText("");
      }
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
        setActiveSession((prev) => {
          if (!prev) return contacts[0];
          const idx = contacts.findIndex((c) => c.id === prev.id);
          return contacts[(idx + 1) % contacts.length];
        });
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

  function renderContactLine(c: Contact, highlighted: boolean) {
    const marker = highlighted ? "▶" : " ";
    const icon = c.type === "group" ? "👥" : "👤";
    return (
      <Box key={c.id}>
        <Text color={highlighted ? "cyan" : undefined} bold={highlighted}>
          {marker} {icon} {c.name}
        </Text>
        <Text dimColor> ({c.id})</Text>
      </Box>
    );
  }

  const divider = termWidth > 60
    ? "─".repeat(termWidth)
    : "────";

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Header */}
      <Box flexDirection="row" paddingX={1}>
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
          <Text color="white">@{nickname}</Text>
        )}
        <Text dimColor> · {contacts.length}c</Text>
        {activeSession && (
          <>
            <Text dimColor> ─ </Text>
            <Text color="yellow" bold>
              {activeSession.name}
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
      <Box flexDirection="column" flexGrow={1}>
        {modalMode ? (
          /* ---- Picker ---- */
          <Box flexDirection="column" paddingX={1} flexGrow={1}>
            {/* scroll-up indicator */}
            {modalScrollOff > 0 && (
              <Text dimColor>
                ↑ {modalScrollOff} more
              </Text>
            )}

            {/* visible items */}
            {filteredContacts
              .slice(modalScrollOff, modalScrollOff + maxModalHeight)
              .map((c, i) =>
                renderContactLine(
                  c,
                  modalScrollOff + i === modalHighlight
                )
              )}

            {/* scroll-down indicator */}
            {filteredContacts.length > modalScrollOff + maxModalHeight && (
              <Text dimColor>
                ↓ {filteredContacts.length - modalScrollOff - maxModalHeight} more
              </Text>
            )}

            {/* empty state */}
            {filteredContacts.length === 0 && (
              <Text dimColor>No matching contacts.</Text>
            )}
          </Box>
        ) : visibleMsgs.length === 0 ? (
          /* ---- Empty messages ---- */
          <Box paddingX={2} paddingY={1}>
            <Text color="gray" dimColor>
              {connected
                ? "No active session. Type /session <name> to start chatting."
                : "Waiting for connection..."}
            </Text>
          </Box>
        ) : (
          /* ---- Messages ---- */
          visibleMsgs.slice(-Math.max(termHeight - 6, 1)).map((msg, i) => {
            const isMine = msg.senderId === selfId;
            const time = formatTime(msg.timestamp);
            const sender = isMine
              ? "you"
              : msg.senderName || String(msg.senderId);

            return (
              <Box key={`${msg.id}-${i}`} flexDirection="row" paddingX={1}>
                <Text dimColor>{time}</Text>
                <Text dimColor> </Text>
                <Text color={isMine ? "green" : "cyan"} bold>
                  {sender.padEnd(14).slice(0, 14)}
                </Text>
                <Text color={isMine ? "green" : "white"}>
                  {msg.content}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Divider before input */}
      <Box>
        <Text color="gray" dimColor>{divider}</Text>
      </Box>

      {/* Input */}
      <Box flexDirection="row" paddingX={1}>
        <Text color="yellow" bold>› </Text>
        <TextInput
          value={inputText}
          onChange={setInputText}
          onSubmit={handleSubmit}
          focus={true}
          placeholder={
            modalMode
              ? "Type to filter · ↑↓ to navigate · Enter to select · Esc to close"
              : "Type a message..."
          }
        />
      </Box>

      {/* Status bar */}
      <Box flexDirection="row" paddingX={1}>
        <Text color="gray" dimColor>
          {modalMode
            ? `${filteredContacts.length} match${filteredContacts.length !== 1 ? "es" : ""}`
            : statusMsg}
        </Text>
        <Box marginLeft={2}>
          <Text color="gray" dimColor wrap="truncate-end">
            {modalMode
              ? "Esc=close"
              : "/session /contacts /groups /friends /reload /quit"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
