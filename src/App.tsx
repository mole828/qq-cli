import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { Box, useInput, useWindowSize, useApp } from "ink";
import { useTerminalInfo } from "ink-picture";
import {
  composerImages,
  composerLength,
  composerText,
  emptyComposerParts,
  getComposerInlineTrigger,
  insertComposerPart,
  replaceComposerPart,
  type ComposerPart,
} from "./composer-draft.js";
import type {
  Contact,
  ChatMessage,
  GroupMember,
  InlineInsertItem,
  MessageSegment,
  ForwardNode,
  ReplyTarget,
  StickerItem,
} from "./types.js";
import { QQClient } from "./qq-client.js";
import {
  attachmentToBase64,
  importPastedImagePaths,
  looksLikePastedImagePath,
  readClipboardImageAttachments,
  removeAttachment,
} from "./clipboard-image.js";
import {
  getInitialImageMode,
  getInitialMessageGap,
  parseImageMode,
} from "./config.js";
import { compactMessage } from "./message-format.js";
import {
  cloneEchoContent,
  ECHO_RECENT_MESSAGE_LIMIT,
  findEchoCandidate,
} from "./echo.js";
import { Composer } from "./ui/Composer.js";
import { ChatPage } from "./ui/ChatPage.js";
import { EmptyState } from "./ui/EmptyState.js";
import { HelpPanel } from "./ui/HelpPanel.js";
import { ForwardPanel, getForwardPanelMaxOffset } from "./ui/ForwardPanel.js";
import { COMPOSER_ROWS, getComposerRows, TERMINAL_GUTTER_ROWS } from "./ui/layout.js";
import { SessionPicker } from "./ui/SessionPicker.js";
import { FacePanel, getFacePanelLayout } from "./ui/FacePanel.js";
import {
  CustomFaceProvider,
  type StickerCapability,
} from "./sticker-provider.js";
import {
  getMaxMessageScrollOffset,
  getMessageScrollRows,
  MessageList,
  moveMessageScrollOffset,
} from "./ui/MessageList.js";
import { useImageMetadataVersion } from "./ui/ImagePreview.js";
import { buildInlineMentionItems } from "./inline-insert.js";

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sessionKey(contact: Contact) {
  return `${contact.type}:${contact.id}`;
}

function contactSearchRank(contact: Contact, query: string) {
  const name = contact.name.toLowerCase();
  const id = String(contact.id);
  if (id === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (id.includes(query)) return 3;
  return null;
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

const COMPLETABLE_COMMANDS = [
  "/session",
  "/contacts",
  "/groups",
  "/friends",
  "/images",
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

const RECENT_CONTACT_LIMIT = 100;

export function App() {
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();
  const terminalInfo = useTerminalInfo();
  useImageMetadataVersion();
  const termWidth = columns || 80;
  const termHeight = rows || 24;
  // Ink clears the terminal when an interactive frame reaches the full viewport
  // height. Keep one row unused so picker/session transitions preserve scrollback.
  const baseBodyRows = Math.max(
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
  const composerPartsRef = useRef<ComposerPart[]>(emptyComposerParts());
  const composerCursorRef = useRef(0);
  const completionRef = useRef<{ prefix: string; index: number } | null>(null);
  const faceRequestRef = useRef(0);
  const customFaceProviderRef = useRef(new CustomFaceProvider());
  const groupMemberRequestRef = useRef(0);
  const groupMembersCacheRef = useRef(new Map<number, GroupMember[]>());

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState(0);
  const [nickname, setNickname] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recentActivityAt, setRecentActivityAt] = useState<
    Record<string, number>
  >({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);
  const [activeSession, setActiveSession] = useState<Contact | null>(null);
  const [composerParts, setComposerParts] = useState<ComposerPart[]>(() => emptyComposerParts());
  const [composerCursor, setComposerCursor] = useState(0);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [helpMode, setHelpMode] = useState(false);
  const [forwardView, setForwardView] = useState<{
    id: string;
    nodes: ForwardNode[] | null;
    loading: boolean;
  } | null>(null);
  const [forwardScrollOffset, setForwardScrollOffset] = useState(0);
  const [imageMode, setImageMode] = useState(() => getInitialImageMode());
  const [messageGap] = useState(() => getInitialMessageGap());
  const messageViewportRef = useRef({
    bodyRows: baseBodyRows,
    imageMode,
    messageGap,
    selfId,
    termWidth,
    cellWidth: terminalInfo.cellWidth,
    cellHeight: terminalInfo.cellHeight,
  });

  // ---- scrollable picker modal ----
  const [modalMode, setModalMode] = useState(false);
  const [modalBaseList, setModalBaseList] = useState<Contact[]>([]);
  const [modalHighlightKey, setModalHighlightKey] = useState<string | null>(null);
  const [modalScrollOff, setModalScrollOff] = useState(0);

  // ---- adaptive custom-face panel ----
  const [facesMode, setFacesMode] = useState(false);
  const [customFaces, setCustomFaces] = useState<StickerItem[]>([]);
  const [faceCapability, setFaceCapability] = useState<StickerCapability>("unknown");
  const [facesLoading, setFacesLoading] = useState(false);
  const [faceHighlight, setFaceHighlight] = useState(0);
  const [faceScrollOffset, setFaceScrollOffset] = useState(0);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [inlinePickerHighlight, setInlinePickerHighlight] = useState(0);
  const [inlinePickerDismissed, setInlinePickerDismissed] = useState<string | null>(null);

  const inputText = composerText(composerParts);
  const hasComposerMedia = composerParts.some((part) => part.type !== "text");
  const inlineTrigger = getComposerInlineTrigger(composerParts, composerCursor);
  const inlineTriggerSignature = inlineTrigger
    ? `${inlineTrigger.start}:${inlineTrigger.end}:${inlineTrigger.query}`
    : null;
  const inlinePickerOpen = Boolean(
    activeSession?.type === "group" &&
      inlineTrigger &&
      inlinePickerDismissed !== inlineTriggerSignature &&
      !helpMode &&
      !modalMode &&
      !facesMode &&
      !forwardView
  );
  const inlinePickerItems = useMemo<InlineInsertItem[]>(
    () => buildInlineMentionItems(groupMembers, inlineTrigger?.query || ""),
    [groupMembers, inlineTrigger?.query]
  );
  const inlinePickerLoading = groupMembersLoading;
  const activeGroupId = activeSession?.type === "group" ? activeSession.id : null;
  const bodyRows = Math.max(
    termHeight - getComposerRows(inlinePickerOpen) - TERMINAL_GUTTER_ROWS,
    1
  );

  function updateComposerDraft(nextParts: ComposerPart[], nextCursor: number) {
    const previousImages = composerImages(composerPartsRef.current);
    const nextImageIds = new Set(composerImages(nextParts).map((attachment) => attachment.id));
    for (const attachment of previousImages) {
      if (!nextImageIds.has(attachment.id)) void removeAttachment(attachment);
    }

    const cursor = Math.min(Math.max(nextCursor, 0), composerLength(nextParts));
    composerPartsRef.current = nextParts;
    composerCursorRef.current = cursor;
    setComposerParts(nextParts);
    setComposerCursor(cursor);
  }

  function setInputText(value: string) {
    setInlinePickerDismissed(null);
    updateComposerDraft(
      value ? [{ type: "text", text: value }] : emptyComposerParts(),
      Array.from(value).length
    );
  }

  function handleComposerChange(nextParts: ComposerPart[], nextCursor: number) {
    updateComposerDraft(nextParts, nextCursor);
  }

  function handleComposerCursorChange(nextCursor: number) {
    const cursor = Math.min(Math.max(nextCursor, 0), composerLength(composerPartsRef.current));
    composerCursorRef.current = cursor;
    setComposerCursor(cursor);
  }

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    messageScrollOffsetRef.current = messageScrollOffset;
  }, [messageScrollOffset]);

  useEffect(() => {
    messageViewportRef.current = {
      bodyRows,
      imageMode,
      messageGap,
      selfId,
      termWidth,
      cellWidth: terminalInfo.cellWidth,
      cellHeight: terminalInfo.cellHeight,
    };
  }, [
    bodyRows,
    imageMode,
    messageGap,
    selfId,
    termWidth,
    terminalInfo.cellWidth,
    terminalInfo.cellHeight,
  ]);

  useEffect(() => {
    if (connected) return;
    faceRequestRef.current += 1;
    groupMemberRequestRef.current += 1;
    groupMembersCacheRef.current.clear();
    setFaceCapability("unknown");
    setCustomFaces([]);
    setFacesLoading(false);
    setFaceHighlight(0);
    setFaceScrollOffset(0);
    setGroupMembers([]);
    setGroupMembersLoading(false);
  }, [connected]);

  useEffect(() => {
    setInlinePickerHighlight(0);
  }, [inlinePickerOpen, inlineTriggerSignature, inlinePickerItems.length]);

  useEffect(() => {
    groupMemberRequestRef.current += 1;
    if (!connected || activeGroupId === null) {
      setGroupMembers([]);
      setGroupMembersLoading(false);
      return;
    }

    const cached = groupMembersCacheRef.current.get(activeGroupId);
    setGroupMembers(cached || []);

    if (!inlinePickerOpen) {
      setGroupMembersLoading(false);
      return;
    }

    if (cached) {
      setGroupMembersLoading(false);
      return;
    }

    const client = qqRef.current;
    if (!client) return;

    const requestId = groupMemberRequestRef.current;
    setGroupMembersLoading(true);
    void client.getGroupMemberList(activeGroupId).then((members) => {
      if (requestId !== groupMemberRequestRef.current) return;
      groupMembersCacheRef.current.set(activeGroupId, members);
      setGroupMembers(members);
      setGroupMembersLoading(false);
    });
  }, [activeGroupId, connected, inlinePickerOpen]);

  useEffect(() => () => {
    for (const attachment of composerImages(composerPartsRef.current)) {
      void removeAttachment(attachment);
    }
  }, []);

  const resolveImageSource = useCallback((file: string) => {
    return qqRef.current?.getImageUrl(file) ?? Promise.resolve(null);
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
          const viewport = messageViewportRef.current;
          setMessageScrollOffset(
            (offset) =>
              offset +
              getMessageScrollRows(
                msg,
                viewport.bodyRows,
                viewport.selfId,
                viewport.termWidth,
                viewport.cellWidth,
                viewport.cellHeight,
                viewport.imageMode,
                viewport.messageGap,
                messagesRef.current
              )
          );
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

      void client
        .getRecentContactActivity(RECENT_CONTACT_LIMIT)
        .then((recentActivity) => {
          setRecentActivityAt(
            Object.fromEntries(
              recentActivity.map(({ contact, timestamp }) => [
                sessionKey(contact),
                timestamp,
              ])
            )
          );
        })
        .catch(() => {
          // Recent activity is an optional NapCat extension. The session index
          // remains usable with its stable source order when it is unavailable.
        });

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
    const latest = new Map<string, ChatMessage>();
    for (const msg of messages) {
      const key = `${msg.chatType === "group" ? "group" : "friend"}:${msg.contactId}`;
      const prev = latest.get(key);
      if (!prev || msg.timestamp > prev.timestamp) {
        latest.set(key, msg);
      }
    }
    return latest;
  }, [messages]);

  const snapshotContacts = (list: Contact[]) =>
    [...list].sort((a, b) => {
      const aKey = sessionKey(a);
      const bKey = sessionKey(b);
      return (
        Math.max(
          recentActivityAt[bKey] || 0,
          lastMessageByContact.get(bKey)?.timestamp || 0
        ) -
        Math.max(
          recentActivityAt[aKey] || 0,
          lastMessageByContact.get(aKey)?.timestamp || 0
        )
      );
    });

  const filteredContacts = useMemo(() => {
    if (!modalMode) return [] as Contact[];
    const f = filterText;
    if (!f) return modalBaseList;
    return modalBaseList
      .map((contact) => ({
        contact,
        rank: contactSearchRank(contact, f),
      }))
      .filter(
        (item): item is { contact: Contact; rank: number } =>
          item.rank !== null
      )
      .sort((a, b) => a.rank - b.rank)
      .map((item) => item.contact);
  }, [
    filterText,
    modalBaseList,
    modalMode,
  ]);

  const modalHighlight = Math.max(
    filteredContacts.findIndex(
      (contact) => sessionKey(contact) === modalHighlightKey
    ),
    0
  );

  const maxModalHeight = Math.max(
    bodyRows - 5,
    3
  );

  // reset highlight & scroll when filter changes
  useEffect(() => {
    if (!modalMode) return;
    setModalHighlightKey(
      filteredContacts[0] ? sessionKey(filteredContacts[0]) : null
    );
    setModalScrollOff(0);
  }, [filteredContacts, modalMode]);

  // picker handleSubmit - Enter selects highlighted contact
  function handleSubmit() {
    if (forwardView) return;
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
      handleSession(filteredContacts[idx]);
      closeModal();
      return;
    }

    const trimmed = inputText.trim();
    const hasPendingReply = Boolean(
      activeSession && replyTarget?.sessionKey === sessionKey(activeSession)
    );
    if (
      !trimmed &&
      !hasComposerMedia &&
      !hasPendingReply
    ) return;
    if (trimmed.startsWith("/") && !hasComposerMedia) {
      handleCommand(trimmed);
    } else {
      handleSend();
    }
  }

  // ---- modal helpers ----
  function openModal(baseList: Contact[], preFill: string) {
    const snapshot = snapshotContacts(baseList);
    setHelpMode(false);
    setForwardView(null);
    setModalBaseList(snapshot);
    setModalMode(true);
    setModalHighlightKey(snapshot[0] ? sessionKey(snapshot[0]) : null);
    setModalScrollOff(0);
    setInputText(preFill);
  }

  function closeModal() {
    setModalMode(false);
    setModalBaseList([]);
    setModalHighlightKey(null);
    setModalScrollOff(0);
    setInputText("");
  }

  async function loadCustomFaces(force = false) {
    if (facesLoading) return;
    if (!force && faceCapability !== "unknown") return;

    const client = qqRef.current;
    if (!client || !connected) {
      setFacesLoading(false);
      setStatusMsg("Waiting for OneBot connection");
      return;
    }

    const requestId = ++faceRequestRef.current;
    setFacesLoading(true);
    setFaceCapability("unknown");
    setStatusMsg("Detecting custom-face capability...");

    try {
      const items = await customFaceProviderRef.current.load(client);
      if (requestId !== faceRequestRef.current) return;

      setFacesLoading(false);
      if (items === null) {
        setCustomFaces([]);
        setFaceCapability("unsupported");
        setFaceHighlight(0);
        setFaceScrollOffset(0);
        setStatusMsg("Custom faces unavailable · adapter extension missing");
        return;
      }

      setCustomFaces(items);
      setFaceCapability("supported");
      setFaceHighlight(0);
      setFaceScrollOffset(0);
      setStatusMsg(
        items.length > 0
          ? `${items.length} custom faces loaded`
          : "Custom face extension available · no faces returned"
      );
    } catch (error) {
      if (requestId !== faceRequestRef.current) return;
      setFacesLoading(false);
      setFaceCapability("unsupported");
      setCustomFaces([]);
      const detail = error instanceof Error ? error.message : String(error);
      setStatusMsg(`Custom faces unavailable · ${detail}`);
    }
  }

  function openFaces(force = false, clearDraft = false) {
    setHelpMode(false);
    setForwardView(null);
    setModalMode(false);
    setFacesMode(true);
    if (clearDraft) setInputText("");
    if (force) {
      setFaceCapability("unknown");
      setCustomFaces([]);
      setFaceHighlight(0);
      setFaceScrollOffset(0);
    }
    void loadCustomFaces(force);
  }

  function closeFaces() {
    faceRequestRef.current += 1;
    setFacesMode(false);
    setFacesLoading(false);
  }

  function setFaceSelection(index: number) {
    const total = customFaces.length;
    if (total === 0) return;
    const next = clamp(index, 0, total - 1);
    const layout = getFacePanelLayout(bodyRows, termWidth);
    const pageStart = Math.floor(next / layout.visibleCount) * layout.visibleCount;
    setFaceHighlight(next);
    setFaceScrollOffset(pageStart);
  }

  function moveFaceSelection(delta: number) {
    setFaceSelection(faceHighlight + delta);
  }

  function queueSticker(sticker: StickerItem) {
    if (!activeSession) {
      setStatusMsg("No active session. Use /session <name>");
      return;
    }

    const next = insertComposerPart(
      composerPartsRef.current,
      composerCursorRef.current,
      { type: "face", sticker }
    );
    updateComposerDraft(next.parts, next.cursor);
    setStatusMsg(`Face #${faceHighlight + 1} added to composer`);
  }

  function attachPastedImagePaths(value: string) {
    setStatusMsg("Importing pasted image...");
    void importPastedImagePaths(value)
      .then((nextAttachments) => {
        let nextParts = composerPartsRef.current;
        let nextCursor = composerCursorRef.current;
        for (const attachment of nextAttachments) {
          const inserted = insertComposerPart(
            nextParts,
            nextCursor,
            { type: "image", attachment }
          );
          nextParts = inserted.parts;
          nextCursor = inserted.cursor;
        }
        updateComposerDraft(nextParts, nextCursor);
        setStatusMsg(
          `${nextAttachments.length} image${nextAttachments.length === 1 ? "" : "s"} attached`
        );
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        setStatusMsg(`Paste failed · ${detail}`);
      });
  }

  function handleInputChange(nextParts: ComposerPart[], nextCursor: number) {
    completionRef.current = null;
    setInlinePickerDismissed(null);
    handleComposerChange(nextParts, nextCursor);
  }

  function handlePaste(value: string, _cursorOffset: number) {
    if (modalMode || !looksLikePastedImagePath(value)) return false;
    attachPastedImagePaths(value);
    return true;
  }

  function moveInlineSelection(delta: number) {
    const total = inlinePickerItems.length;
    if (total === 0) return;
    setInlinePickerHighlight((current) => (current + delta + total) % total);
  }

  function selectInlineItem() {
    const trigger = getComposerInlineTrigger(
      composerPartsRef.current,
      composerCursorRef.current
    );
    const item = inlinePickerItems[inlinePickerHighlight];
    if (!trigger || !item) {
      if (!inlinePickerLoading) setStatusMsg("No matching inline insert");
      return;
    }

    const part: ComposerPart = {
      type: "at",
      qq: item.qq,
      label: item.label,
    };
    const next = replaceComposerPart(
      composerPartsRef.current,
      trigger.start,
      trigger.end,
      part
    );
    updateComposerDraft(next.parts, next.cursor);
    setInlinePickerDismissed(null);
    setStatusMsg(`Mentioned @${item.label}`);
  }

  // ---- key bindings ----
  useInput((input, key) => {
    if (key.ctrl && (input === "q" || input === "c")) {
      exit();
      return;
    }

    if (key.escape) {
      if (forwardView) {
        setForwardView(null);
        setForwardScrollOffset(0);
      } else if (helpMode) {
        setHelpMode(false);
      } else if (facesMode) {
        closeFaces();
      } else if (modalMode) {
        closeModal();
      } else if (inlinePickerOpen && inlineTriggerSignature) {
        setInlinePickerDismissed(inlineTriggerSignature);
      } else {
        setInputText("");
        setReplyTarget(null);
      }
      return;
    }

    if (inlinePickerOpen) {
      if (key.return || (key.tab && !key.shift)) {
        selectInlineItem();
        return;
      }
      if (key.upArrow) {
        moveInlineSelection(-1);
        return;
      }
      if (key.downArrow) {
        moveInlineSelection(1);
        return;
      }
      if (key.pageUp) {
        moveInlineSelection(-3);
        return;
      }
      if (key.pageDown) {
        moveInlineSelection(3);
        return;
      }
    }

    if (helpMode) {
      return;
    }

    if (forwardView) {
      if (key.tab && key.shift) {
        setImageMode((current) => current === "off" ? "inline" : "off");
        setForwardScrollOffset(0);
        return;
      }
      const maxOffset = getForwardPanelMaxOffset(
        forwardView.id,
        forwardView.nodes,
        bodyRows,
        termWidth,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        imageMode
      );
      if (key.upArrow) {
        setForwardScrollOffset((offset) => Math.min(offset + 1, maxOffset));
      } else if (key.downArrow) {
        setForwardScrollOffset((offset) => Math.max(offset - 1, 0));
      } else if (key.pageUp) {
        setForwardScrollOffset((offset) =>
          Math.min(offset + Math.max(Math.floor(bodyRows / 2), 1), maxOffset)
        );
      } else if (key.pageDown) {
        setForwardScrollOffset((offset) =>
          Math.max(offset - Math.max(Math.floor(bodyRows / 2), 1), 0)
        );
      } else if (key.end) {
        setForwardScrollOffset(0);
      }
      return;
    }

    if (facesMode) {
      const total = customFaces.length;
      const layout = getFacePanelLayout(bodyRows, termWidth);

      if (key.return) {
        const selected = customFaces[faceHighlight];
        if (selected) queueSticker(selected);
        else if (!facesLoading) setStatusMsg("No custom face selected");
        return;
      }
      if (!facesLoading && input.toLowerCase() === "r") {
        openFaces(true);
        return;
      }
      if (total === 0) return;
      if (key.upArrow) {
        moveFaceSelection(-layout.columns);
      } else if (key.downArrow) {
        moveFaceSelection(layout.columns);
      } else if (key.leftArrow) {
        moveFaceSelection(-1);
      } else if (key.rightArrow) {
        moveFaceSelection(1);
      } else if (key.pageUp) {
        moveFaceSelection(-layout.visibleCount);
      } else if (key.pageDown) {
        moveFaceSelection(layout.visibleCount);
      } else if (key.home) {
        setFaceSelection(0);
      } else if (key.end) {
        setFaceSelection(total - 1);
      }
      return;
    }

    if (!modalMode && key.ctrl && input.toLowerCase() === "f") {
      openFaces();
      return;
    }

    if (!modalMode && (key.ctrl || key.meta || key.super) && input.toLowerCase() === "v") {
      setStatusMsg("Reading clipboard image...");
      void readClipboardImageAttachments()
        .then((nextAttachments) => {
          let nextParts = composerPartsRef.current;
          let nextCursor = composerCursorRef.current;
          for (const attachment of nextAttachments) {
            const inserted = insertComposerPart(
              nextParts,
              nextCursor,
              { type: "image", attachment }
            );
            nextParts = inserted.parts;
            nextCursor = inserted.cursor;
          }
          updateComposerDraft(nextParts, nextCursor);
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

    // ---- picker navigation ----
    if (modalMode) {
      const total = filteredContacts.length;
      if (total === 0) {
        // allow typing but block nav when list is empty
        return;
      }
      if (key.upArrow) {
        const next = modalHighlight > 0 ? modalHighlight - 1 : total - 1;
        setModalHighlightKey(sessionKey(filteredContacts[next]));
        setModalScrollOff((prevScroll) =>
          next < prevScroll ? next : prevScroll
        );
        return;
      }
      if (key.downArrow) {
        const next = modalHighlight < total - 1 ? modalHighlight + 1 : 0;
        setModalHighlightKey(sessionKey(filteredContacts[next]));
        setModalScrollOff((prevScroll) =>
          next >= prevScroll + maxModalHeight
            ? next - maxModalHeight + 1
            : prevScroll
        );
        return;
      }
      if (key.pageDown) {
        const next = clamp(
          modalHighlight + maxModalHeight,
          0,
          total - 1
        );
        setModalHighlightKey(sessionKey(filteredContacts[next]));
        setModalScrollOff(
          clamp(
            next - Math.floor(maxModalHeight / 2),
            0,
            Math.max(total - maxModalHeight, 0)
          )
        );
        return;
      }
      if (key.pageUp) {
        const next = clamp(
          modalHighlight - maxModalHeight,
          0,
          total - 1
        );
        setModalHighlightKey(sessionKey(filteredContacts[next]));
        setModalScrollOff(
          clamp(
            next - Math.floor(maxModalHeight / 2),
            0,
            Math.max(total - maxModalHeight, 0)
          )
        );
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
        selfId,
        termWidth,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        imageMode,
        messageGap
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
          selfId,
          termWidth,
          terminalInfo.cellWidth,
          terminalInfo.cellHeight,
          imageMode,
          messageGap,
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
          selfId,
          termWidth,
          terminalInfo.cellWidth,
          terminalInfo.cellHeight,
          imageMode,
          messageGap,
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

    if (key.tab && key.shift) {
      setImageMode((current) => current === "off" ? "inline" : "off");
      return;
    }

    if (key.tab) {
      const activeCompletion = completionRef.current;
      const messageCommandMatch = !hasComposerMedia
        ? inputText.match(/^\/(forward|reply)\s+(\S*)$/i)
        : null;
      const prefix = activeCompletion?.prefix ?? (
        messageCommandMatch
          ? `/${messageCommandMatch[1].toLowerCase()} ${messageCommandMatch[2]}`
          : inputText.toLowerCase()
      );
      const messageCommand = prefix.match(/^\/(forward|reply)\s/i)?.[1].toLowerCase();
      const messageIdPrefix = messageCommand
        ? prefix.slice(messageCommand.length + 2)
        : "";
      const matches = messageCommand && activeSession
        ? [...new Set(
            messagesRef.current
              .filter((message) => {
                if (!belongsToSession(message, activeSession)) return false;
                if (messageCommand === "forward") {
                  return message.segments?.some((segment) => segment.type === "forward") ?? false;
                }
                return !message.isMine;
              })
              .filter((message) => String(message.id).startsWith(messageIdPrefix))
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((message) => `/${messageCommand} ${message.id}`)
          )]
        : !hasComposerMedia && !inputText.includes(" ") && inputText.startsWith("/")
        ? COMPLETABLE_COMMANDS.filter((command) => command.startsWith(prefix))
        : [];
      if (matches.length === 0) return;

      const index = activeCompletion
        ? (activeCompletion.index + 1) % matches.length
        : 0;
      completionRef.current = { prefix, index };
      setInputText(matches[index]);
      return;
    }

  });

  function handleSession(contact: Contact) {
    if (contacts.some((item) => sessionKey(item) === sessionKey(contact))) {
      const generation = sessionGenerationRef.current + 1;
      sessionGenerationRef.current = generation;
      messageScrollOffsetRef.current = 0;
      setReplyTarget(null);
      setInputText("");
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

  function rememberSentMessage(
    contact: Contact,
    messageId: number | string,
    content: string,
    segments?: MessageSegment[]
  ) {
    const chatType = contact.type === "group" ? "group" : "private";
    const sent: ChatMessage = {
      id: messageId,
      contactId: contact.id,
      chatType,
      senderId: selfId,
      senderName: nickname || "Me",
      content,
      timestamp: Date.now(),
      isMine: true,
      group_id: contact.type === "group" ? contact.id : undefined,
      segments,
    };
    const key = messageKey(sent);
    if (!messagesRef.current.some((item) => messageKey(item) === key)) {
      messagesRef.current = [...messagesRef.current, sent];
      setMessages(messagesRef.current);
    }
    if (activeSessionRef.current && sessionKey(activeSessionRef.current) === sessionKey(contact)) {
      setMessageScrollOffset(0);
    }
  }

  async function handleEcho() {
    const session = activeSession;
    setInputText("");
    if (!session || session.type !== "group") {
      setStatusMsg("/echo only works in a group session");
      return;
    }

    const candidate = findEchoCandidate(
      messagesRef.current,
      session.id,
      ECHO_RECENT_MESSAGE_LIMIT
    );
    if (!candidate) {
      setStatusMsg(`No repeated message in the last ${ECHO_RECENT_MESSAGE_LIMIT} group messages`);
      return;
    }

    const content = cloneEchoContent(candidate.message);
    const client = qqRef.current;
    if (!content || !client) {
      setStatusMsg("Repeated message cannot be echoed");
      return;
    }

    setStatusMsg(`Echoing #${candidate.message.id}...`);
    try {
      const messageId = await client.sendMessage("group", session.id, content);
      if (messageId === null) throw new Error("OneBot rejected the message");
      rememberSentMessage(
        session,
        messageId,
        candidate.message.content,
        Array.isArray(content) ? content : undefined
      );
      setStatusMsg(`Echoed #${candidate.message.id} · ${candidate.count} matches`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatusMsg(`Echo failed · ${detail}`);
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
          handleSession(matched[0]);
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
          setStatusMsg("Usage: /images off|inline");
        }
        setInputText("");
        break;
      }
      case "/faces":
      case "/stickers": {
        const normalized = args.trim().toLowerCase();
        if (normalized && normalized !== "refresh" && normalized !== "reload") {
          setStatusMsg("Usage: /faces [refresh]");
          setInputText("");
          break;
        }
        openFaces(normalized === "refresh" || normalized === "reload", true);
        break;
      }
      case "/echo": {
        if (args.trim()) {
          setInputText("");
          setStatusMsg("Usage: /echo");
          break;
        }
        void handleEcho();
        break;
      }
      case "/reply": {
        const messageId = args.trim().replace(/^#/, "");
        if (!messageId) {
          setStatusMsg("Usage: /reply <message-id>");
          setInputText("");
          break;
        }
        if (!activeSession) {
          setStatusMsg("No active session. Use /session <name>");
          setInputText("");
          break;
        }

        const target = messagesRef.current.find(
          (message) =>
            belongsToSession(message, activeSession) &&
            String(message.id) === messageId
        );
        if (!target) {
          setStatusMsg(`Reply target not found · #${messageId}`);
          setInputText("");
          break;
        }

        const preview = compactMessage(target, { imageMode })
          .replace(/\s+/g, " ")
          .trim() || "(empty)";
        setReplyTarget({
          sessionKey: sessionKey(activeSession),
          messageId,
          senderName: target.senderName || String(target.senderId),
          preview,
        });
        setInputText("");
        setStatusMsg(`Reply ready · #${messageId}`);
        break;
      }
      case "/forward": {
        const messageId = args.trim();
        if (!messageId) {
          setStatusMsg("Usage: /forward <message-id>");
          setInputText("");
          break;
        }
        const source = messagesRef.current.find(
          (message) =>
            String(message.id) === messageId &&
            message.segments?.some((segment) => segment.type === "forward")
        );
        const segment = source?.segments?.find((item) => item.type === "forward");
        const forwardId = segment?.data.id;
        if (typeof forwardId !== "string" && typeof forwardId !== "number") {
          setStatusMsg(`Forward not found · ${messageId}`);
          setInputText("");
          break;
        }
        const id = String(forwardId);
        setInputText("");
        setForwardScrollOffset(0);
        setForwardView({ id, nodes: null, loading: true });
        void qqRef.current?.getForwardMessage(id).then((nodes) => {
          setForwardView((current) =>
            current?.id === id ? { id, nodes, loading: false } : current
          );
        });
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
      case "/exit":
        exit();
        break;
      default:
        setInputText("");
        setStatusMsg(`Unknown command: ${command}. Try /help`);
        break;
    }
  }

  async function handleSend() {
    if (!activeSession || !qqRef.current) {
      setStatusMsg("No active session. Use /session <name>");
      return;
    }

    const chatType = activeSession.type === "group" ? "group" : "private";
    const pendingParts = composerPartsRef.current;
    const text = composerText(pendingParts);
    const pendingReply =
      replyTarget?.sessionKey === sessionKey(activeSession) ? replyTarget : null;

    try {
      const segments: MessageSegment[] = [];
      if (pendingReply) {
        segments.push({
          type: "reply",
          data: { id: pendingReply.messageId },
        });
      }
      for (const part of pendingParts) {
        if (part.type === "text") {
          if (part.text) segments.push({ type: "text", data: { text: part.text } });
        } else if (part.type === "face") {
          segments.push({
            type: "image",
            data: { file: part.sticker.file },
          });
        } else if (part.type === "at") {
          segments.push({
            type: "at",
            data: { qq: part.qq },
          });
        } else {
          segments.push({
            type: "image",
            data: { file: await attachmentToBase64(part.attachment) },
          });
        }
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
      setReplyTarget(null);
      rememberSentMessage(activeSession, messageId, text, segments);
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
    selfId,
    termWidth,
    terminalInfo.cellWidth,
    terminalInfo.cellHeight,
    imageMode,
    messageGap
  );
  const effectiveMessageScrollOffset = Math.min(
    messageScrollOffset,
    maxMessageScrollOffset
  );

  if (!forwardView && !helpMode && !modalMode && !facesMode && activeSession) {
    return (
      <ChatPage
        state={{
          session: activeSession,
          messages: activeMessages,
          selfId,
          scrollOffset: messageScrollOffset,
          imageMode,
          messageGap,
          connected,
          statusMsg,
          composerParts,
          composerCursor,
          replyTarget,
          unreadTotal,
          inlinePickerOpen,
          inlinePickerQuery: inlineTrigger?.query || "",
          inlinePickerItems,
          inlinePickerHighlight,
          inlinePickerLoading,
        }}
        onInputChange={handleInputChange}
        onCursorChange={handleComposerCursorChange}
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        resolveImageSource={resolveImageSource}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        height={bodyRows}
        flexShrink={1}
        overflow="hidden"
      >
        {forwardView ? (
          <ForwardPanel
            forwardId={forwardView.id}
            nodes={forwardView.nodes}
            loading={forwardView.loading}
            scrollOffset={forwardScrollOffset}
            bodyRows={bodyRows}
            termWidth={termWidth}
            cellWidth={terminalInfo.cellWidth}
            cellHeight={terminalInfo.cellHeight}
            imageMode={imageMode}
            resolveImageSource={resolveImageSource}
          />
        ) : helpMode ? (
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
        ) : facesMode ? (
          <FacePanel
            items={customFaces}
            capability={faceCapability}
            loading={facesLoading}
            highlightIndex={faceHighlight}
            scrollOffset={faceScrollOffset}
            bodyRows={bodyRows}
            termWidth={termWidth}
            statusMsg={statusMsg}
            resolveImageSource={resolveImageSource}
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
            cellWidth={terminalInfo.cellWidth}
            cellHeight={terminalInfo.cellHeight}
            bodyRows={bodyRows}
            imageMode={imageMode}
            scrollOffset={effectiveMessageScrollOffset}
            messageGap={messageGap}
            resolveImageSource={resolveImageSource}
          />
        ) : null}
      </Box>

      <Composer
        parts={composerParts}
        cursorOffset={composerCursor}
        onChange={handleInputChange}
        onCursorChange={handleComposerCursorChange}
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        helpMode={helpMode}
        modalMode={modalMode}
        facesMode={facesMode}
        forwardMode={Boolean(forwardView)}
        activeSession={activeSession}
        statusMsg={statusMsg}
        replyTarget={replyTarget}
        connected={connected}
        unreadTotal={unreadTotal}
        termWidth={termWidth}
        imageMode={imageMode}
        inlinePickerOpen={inlinePickerOpen}
        inlinePickerQuery={inlineTrigger?.query || ""}
        inlinePickerItems={inlinePickerItems}
        inlinePickerHighlight={inlinePickerHighlight}
        inlinePickerLoading={inlinePickerLoading}
      />
    </Box>
  );
}
