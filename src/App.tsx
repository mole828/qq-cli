import React, { useEffect, useState, useRef, useMemo } from "react";
import { Box, Static, useInput, useStdout, useApp } from "ink";
import type { Contact, ChatMessage } from "./types.js";
import { QQClient } from "./qq-client.js";
import { getInitialImageMode, parseImageMode } from "./config.js";
import { getFirstImageSource } from "./message-format.js";
import { Composer } from "./ui/Composer.js";
import { EmptyState } from "./ui/EmptyState.js";
import { HelpPanel } from "./ui/HelpPanel.js";
import { COMPOSER_ROWS, TERMINAL_GUTTER_ROWS } from "./ui/layout.js";
import { SessionPicker } from "./ui/SessionPicker.js";
import {
  TranscriptEntryView,
  type TranscriptEntry,
} from "./ui/TranscriptEntry.js";

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

const LIVE_TAIL_SIZE = 3;

export function App() {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const termWidth = stdout?.columns || 80;
  const termHeight = stdout?.rows || 24;
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
  const transcriptReadyRef = useRef<string | null>(null);
  const transcriptKeysRef = useRef(new Set<string>());
  const liveEntriesRef = useRef<TranscriptEntry[]>([]);

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState(0);
  const [nickname, setNickname] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [liveEntries, setLiveEntries] = useState<TranscriptEntry[]>([]);
  const [activeSession, setActiveSession] = useState<Contact | null>(null);
  const [inputText, setInputText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [helpMode, setHelpMode] = useState(false);
  const [imageMode, setImageMode] = useState(() => getInitialImageMode());

  // ---- scrollable picker modal ----
  const [modalMode, setModalMode] = useState(false);
  const [modalBaseList, setModalBaseList] = useState<Contact[]>([]);
  const [modalHighlight, setModalHighlight] = useState(0);
  const [modalScrollOff, setModalScrollOff] = useState(0);

  function appendMessagesToTranscript(items: ChatMessage[]) {
    const next: TranscriptEntry[] = [];
    for (const message of items) {
      const key = messageKey(message);
      if (transcriptKeysRef.current.has(key)) continue;
      transcriptKeysRef.current.add(key);
      next.push({
        key,
        type: "message",
        message,
      });
    }
    if (next.length === 0) return;

    const combined = [...liveEntriesRef.current, ...next];
    const splitAt = Math.max(combined.length - LIVE_TAIL_SIZE, 0);
    const entriesToArchive = combined.slice(0, splitAt);
    const nextLiveEntries = combined.slice(splitAt);
    liveEntriesRef.current = nextLiveEntries;
    setLiveEntries(nextLiveEntries);
    if (entriesToArchive.length > 0) {
      setTranscript((current) => [...current, ...entriesToArchive]);
    }
  }

  function archiveOldestLiveEntry() {
    const [entry, ...remaining] = liveEntriesRef.current;
    if (!entry) return;
    liveEntriesRef.current = remaining;
    setLiveEntries(remaining);
    setTranscript((current) => [...current, entry]);
  }

  function archiveAllLiveEntries() {
    const entries = liveEntriesRef.current;
    if (entries.length === 0) return;
    liveEntriesRef.current = [];
    setLiveEntries([]);
    setTranscript((current) => [...current, ...entries]);
  }

  useEffect(() => {
    const oldest = liveEntries[0];
    if (!oldest) return;
    const timer = setTimeout(() => {
      if (liveEntriesRef.current[0]?.key !== oldest.key) return;
      archiveOldestLiveEntry();
    }, 8000);
    return () => clearTimeout(timer);
  }, [liveEntries[0]?.key]);

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
      messagesRef.current = [...messagesRef.current, msg];
      setMessages(messagesRef.current);
      const current = activeSessionRef.current;
      if (current && belongsToSession(msg, current)) {
        if (transcriptReadyRef.current === sessionKey(current)) {
          appendMessagesToTranscript([msg]);
        }
        return;
      }
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

  });

  function handleSession(id: number) {
    const contact = contacts.find((c) => c.id === id);
    if (contact) {
      archiveAllLiveEntries();
      const generation = sessionGenerationRef.current + 1;
      sessionGenerationRef.current = generation;
      transcriptReadyRef.current = null;
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
    appendMessagesToTranscript(sessionMessages);
    transcriptReadyRef.current = key;
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
      messagesRef.current = [...messagesRef.current, sent];
      setMessages(messagesRef.current);
      appendMessagesToTranscript([sent]);
    } catch {
      setStatusMsg("Send failed");
    }
  }

  const unreadTotal = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  const liveImageSources = liveEntries.map((entry) =>
    imageMode === "inline" ? getFirstImageSource(entry.message) : null
  );
  const liveImageCount = liveImageSources.filter(Boolean).length;
  const liveTextRows = liveEntries.reduce(
    (rows, entry) => rows + (entry.message.isMine || entry.message.senderId === selfId ? 2 : 3),
    0
  );
  const livePreviewHeight = liveImageCount > 0
    ? Math.min(
        10,
        Math.max(Math.floor((bodyRows - liveTextRows) / liveImageCount), 2)
      )
    : 0;
  const liveRows = Math.min(
    bodyRows,
    liveTextRows + liveImageCount * livePreviewHeight
  );
  const normalBodyRows = activeSession
    ? liveEntries.length > 0
      ? Math.max(liveRows, 1)
      : 1
    : bodyRows;

  return (
    <Box flexDirection="column">
      <Static items={transcript}>
        {(entry) => (
          <TranscriptEntryView
            key={entry.key}
            entry={entry}
            selfId={selfId}
            termWidth={termWidth}
            imageMode={imageMode}
          />
        )}
      </Static>

      <Box
        flexDirection="column"
        height={helpMode || modalMode ? bodyRows : normalBodyRows}
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
        ) : liveEntries.length > 0 ? (
          <>
            {liveEntries.map((entry, index) => (
              <TranscriptEntryView
                key={entry.key}
                entry={entry}
                selfId={selfId}
                termWidth={termWidth}
                imageMode={imageMode}
                renderInlineImage={Boolean(liveImageSources[index])}
                imagePreviewHeight={livePreviewHeight}
              />
            ))}
          </>
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
      />
    </Box>
  );
}
