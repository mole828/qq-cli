import React, { useEffect, useState, useRef, useMemo } from "react";
import { Box, useInput, useWindowSize, useApp } from "ink";
import type { Contact, ChatMessage, MessageSegment } from "./types.js";
import { QQClient } from "./qq-client.js";
import {
  attachmentToBase64,
  importPastedImagePaths,
  looksLikePastedImagePath,
  readClipboardImageAttachments,
  removeAttachment,
  type ImageAttachment,
} from "./clipboard-image.js";
import { getInitialImageMode, parseImageMode } from "./config.js";
import { Composer } from "./ui/Composer.js";
import { EmptyState } from "./ui/EmptyState.js";
import { HelpPanel } from "./ui/HelpPanel.js";
import { COMPOSER_ROWS, TERMINAL_GUTTER_ROWS } from "./ui/layout.js";
import { SessionPicker } from "./ui/SessionPicker.js";
import {
  getMaxMessageScrollOffset,
  MessageList,
  moveMessageScrollOffset,
} from "./ui/MessageList.js";

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sessionKey(contact: Contact) {
  return `${contact.type}:${contact.id}`;
}

function messageKey(message: ChatMessage) {
  return `${message.chatType}:${message.contactId}:${message.id}`;
}

function belongsToSession(message: ChatMessage, contact: Contact) {
  return (
    message.chatType === (contact.type === "group" ? "group" : "private") &&
    message.contactId === contact.id
  );
}

export function App() {
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();
  const termWidth = columns || 80;
  const termHeight = rows || 24;
  // Ink clears the terminal when an interactive frame reaches the full viewport
  // height. Keep one row unused so picker/session transitions preserve scrollback.
  const bodyRows = Math.max(
    termHeight - COMPOSER_ROWS - TERMINAL_GUTTER_ROWS,
    1
  );

  const qqRef = useRef<QQClient | null>(null);
  const loadedRef = useRef(false);
  const activeSessionRef = useRef<Contact | null>(null);
  const historyRequestedRef = useRef(new Set<string>());
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionGenerationRef = useRef(0);
  const messageScrollOffsetRef = useRef(0);
  const attachmentsRef = useRef<ImageAttachment[]>([]);

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState(0);
  const [nickname, setNickname] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);
  const [activeSession, setActiveSession] = useState<Contact | null>(null);
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [helpMode, setHelpMode] = useState(false);
  const [imageMode, setImageMode] = useState(() => getInitialImageMode());

  // ---- scrollable picker modal ----
  const [modalMode, setModalMode] = useState(false);
  const [modalBaseList, setModalBaseList] = useState<Contact[]>([]);
  const [modalHighlight, setModalHighlight] = useState(0);
  const [modalScrollOff, setModalScrollOff] = useState(0);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    messageScrollOffsetRef.current = messageScrollOffset;
  }, [messageScrollOffset]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    for (const attachment of attachmentsRef.current) {
      void removeAttachment(attachment);
    }
  }, []);

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
      const key = messageKey(msg);
      if (messagesRef.current.some((item) => messageKey(item) === key)) return;
      messagesRef.current = [...messagesRef.current, msg];
      setMessages(messagesRef.current);
      const current = activeSessionRef.current;
      if (current && belongsToSession(msg, current)) {
        if (messageScrollOffsetRef.current > 0) {
          setMessageScrollOffset((offset) => offset + 1);
        }
        return;
      }
      if (msg.isMine) return;
      setUnreadCounts((prev) => ({
        ...prev,
        [msg.contactId]: (prev[msg.contactId] || 0) + 1,
      }));
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
        setStatusMsg(`${all.length} sessions indexed`);
      } catch {
        setStatusMsg("Failed to load session index");
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

  const maxModalHeight = Math.max(
    bodyRows - 5,
    3
  );

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
        setStatusMsg("No matching sessions");
        return;
      }
      const idx = clamp(modalHighlight, 0, filteredContacts.length - 1);
      handleSession(filteredContacts[idx].id);
      closeModal();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
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
        const discarded = attachments;
        setAttachments([]);
        for (const attachment of discarded) void removeAttachment(attachment);
      }
      return;
    }

    if (helpMode) {
      return;
    }

    if (!modalMode && input.length > 1 && looksLikePastedImagePath(input)) {
      // macOS terminals commonly turn Cmd+V on an image into a temporary path.
      // Keep that path out of the text input and promote it to an attachment.
      setInputText(inputText);
      setStatusMsg("Importing pasted image...");
      void importPastedImagePaths(input)
        .then((nextAttachments) => {
          setAttachments((current) => [...current, ...nextAttachments]);
          setStatusMsg(
            `${nextAttachments.length} image${nextAttachments.length === 1 ? "" : "s"} attached`
          );
        })
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          setStatusMsg(`Paste failed · ${detail}`);
        });
      return;
    }

    if (!modalMode && (key.ctrl || key.super) && input.toLowerCase() === "v") {
      // ink-text-input also receives the key event; restore the controlled value
      // so the shortcut does not insert a literal "v" into the composer.
      setInputText(inputText);
      setStatusMsg("Reading clipboard image...");
      void readClipboardImageAttachments()
        .then((nextAttachments) => {
          setAttachments((current) => [...current, ...nextAttachments]);
          setStatusMsg(
            `${nextAttachments.length} image${nextAttachments.length === 1 ? "" : "s"} attached`
          );
        })
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          setStatusMsg(`Paste failed · ${detail}`);
        });
      return;
    }

    if (
      !modalMode &&
      key.backspace &&
      inputText.length === 0 &&
      attachments.length > 0
    ) {
      const attachment = attachments[attachments.length - 1];
      setAttachments((current) => current.slice(0, -1));
      void removeAttachment(attachment);
      setStatusMsg("Attachment removed");
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
    const sessionMessages = activeSession
      ? messages.filter((message) => belongsToSession(message, activeSession))
      : [];
    if (key.upArrow && activeSession) {
      const maxOffset = getMaxMessageScrollOffset(
        sessionMessages,
        bodyRows,
        imageMode
      );
      setMessageScrollOffset((offset) => Math.min(offset + 1, maxOffset));
      return;
    }
    if (key.downArrow && activeSession) {
      setMessageScrollOffset((offset) => Math.max(offset - 1, 0));
      return;
    }
    if (key.pageUp && activeSession) {
      setMessageScrollOffset((offset) =>
        moveMessageScrollOffset(
          sessionMessages,
          bodyRows,
          imageMode,
          offset,
          "older"
        )
      );
      return;
    }
    if (key.pageDown && activeSession) {
      setMessageScrollOffset((offset) =>
        moveMessageScrollOffset(
          sessionMessages,
          bodyRows,
          imageMode,
          offset,
          "newer"
        )
      );
      return;
    }
    if (key.end && activeSession) {
      setMessageScrollOffset(0);
      return;
    }

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

  });

  function handleSession(id: number) {
    const contact = contacts.find((c) => c.id === id);
    if (contact) {
      const generation = sessionGenerationRef.current + 1;
      sessionGenerationRef.current = generation;
      messageScrollOffsetRef.current = 0;
      setMessageScrollOffset(0);
      activeSessionRef.current = contact;
      setActiveSession(contact);
      setUnreadCounts((prev) => {
        if (!prev[contact.id]) return prev;
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
      void loadHistory(contact, generation);
    }
  }

  async function loadHistory(contact: Contact, generation: number) {
    const key = sessionKey(contact);
    const shouldRequestHistory = !historyRequestedRef.current.has(key);
    if (shouldRequestHistory) historyRequestedRef.current.add(key);
    setStatusMsg(`Loading history · ${contact.name}`);

    const client = qqRef.current;
    const history = shouldRequestHistory && client
      ? await client.getChatHistory(contact, 20)
      : [];
    if (history) {
      const merged = new Map<string, ChatMessage>();
      for (const message of [...history, ...messagesRef.current]) {
        merged.set(messageKey(message), message);
      }
      messagesRef.current = [...merged.values()].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      setMessages(messagesRef.current);
    }

    const active = activeSessionRef.current;
    if (
      generation !== sessionGenerationRef.current ||
      active?.id !== contact.id ||
      active.type !== contact.type
    ) return;

    const sessionMessages = messagesRef.current
      .filter((message) => belongsToSession(message, contact))
      .sort((a, b) => a.timestamp - b.timestamp);
    const loadedCount = shouldRequestHistory
      ? history?.length || 0
      : sessionMessages.length;
    setStatusMsg(
      history === null
        ? `History unavailable · ${contact.name}`
        : `${loadedCount} history entries · ${contact.name}`
    );
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
      case "/images": {
        const normalized = args.trim().toLowerCase();
        const nextMode = parseImageMode(normalized);
        if (normalized && nextMode === normalized) {
          setImageMode(nextMode);
          setStatusMsg(`Images ${nextMode}`);
        } else {
          setStatusMsg("Usage: /images off|link|inline");
        }
        setInputText("");
        break;
      }
      case "/reload":
        loadedRef.current = false;
        setInputText("");
        setStatusMsg("Reloading session index...");
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
    if (!activeSession || !qqRef.current) {
      setStatusMsg("No active session. Use /session <name>");
      return;
    }

    const chatType = activeSession.type === "group" ? "group" : "private";
    const pendingAttachments = attachments;

    try {
      const segments: MessageSegment[] = [];
      if (text) segments.push({ type: "text", data: { text } });
      for (const attachment of pendingAttachments) {
        segments.push({
          type: "image",
          data: { file: await attachmentToBase64(attachment) },
        });
      }
      const message = segments.length === 1 && segments[0].type === "text"
        ? text
        : segments;
      const messageId = await qqRef.current.sendMessage(
        chatType,
        activeSession.id,
        message
      );
      if (messageId === null) throw new Error("OneBot rejected the message");
      setInputText("");
      setAttachments([]);
      const sent: ChatMessage = {
        id: messageId,
        contactId: activeSession.id,
        chatType,
        senderId: selfId,
        senderName: nickname || "Me",
        content: text,
        timestamp: Date.now(),
        isMine: true,
        group_id: activeSession.type === "group" ? activeSession.id : undefined,
        segments,
      };
      const key = messageKey(sent);
      if (!messagesRef.current.some((item) => messageKey(item) === key)) {
        messagesRef.current = [...messagesRef.current, sent];
        setMessages(messagesRef.current);
      }
      setMessageScrollOffset(0);
      await Promise.all(pendingAttachments.map(removeAttachment));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatusMsg(`Send failed · ${detail}`);
    }
  }

  const unreadTotal = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  const activeMessages = activeSession
    ? messages.filter((message) => belongsToSession(message, activeSession))
    : [];
  const maxMessageScrollOffset = getMaxMessageScrollOffset(
    activeMessages,
    bodyRows,
    imageMode
  );
  const effectiveMessageScrollOffset = Math.min(
    messageScrollOffset,
    maxMessageScrollOffset
  );

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        height={bodyRows}
        flexShrink={1}
        overflow="hidden"
      >
        {helpMode ? (
          <HelpPanel />
        ) : modalMode ? (
          <SessionPicker
            contacts={filteredContacts}
            highlightIndex={modalHighlight}
            scrollOffset={modalScrollOff}
            maxHeight={maxModalHeight}
            unreadCounts={unreadCounts}
            lastMessageByContact={lastMessageByContact}
            selfId={selfId}
            termWidth={termWidth}
            unreadTotal={unreadTotal}
          />
        ) : !activeSession ? (
          <EmptyState
            activeSession={activeSession}
            connected={connected}
            termWidth={termWidth}
          />
        ) : activeMessages.length > 0 ? (
          <MessageList
            messages={activeMessages}
            selfId={selfId}
            activeSession={activeSession}
            termWidth={termWidth}
            bodyRows={bodyRows}
            imageMode={imageMode}
            scrollOffset={effectiveMessageScrollOffset}
          />
        ) : null}
      </Box>

      <Composer
        inputText={inputText}
        onChange={setInputText}
        onSubmit={handleSubmit}
        helpMode={helpMode}
        modalMode={modalMode}
        activeSession={activeSession}
        statusMsg={statusMsg}
        connected={connected}
        unreadTotal={unreadTotal}
        termWidth={termWidth}
        attachments={attachments}
        imageMode={imageMode}
      />
    </Box>
  );
}
