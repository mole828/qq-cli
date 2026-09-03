import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage, Contact } from "../types.js";
import { compactMessage } from "../message-format.js";
import { truncateCells } from "../terminal-text.js";

interface SessionPickerProps {
  contacts: Contact[];
  highlightIndex: number;
  scrollOffset: number;
  maxHeight: number;
  unreadCounts: Record<number, number>;
  mentionCounts: Record<string, number>;
  lastMessageByContact: Map<string, ChatMessage>;
  selfId: number;
  termWidth: number;
  unreadTotal: number;
  mentionTotal: number;
}

function ContactLine({
  contact,
  highlighted,
  unreadCounts,
  mentionCounts,
  lastMessageByContact,
  selfId,
  termWidth,
}: {
  contact: Contact;
  highlighted: boolean;
  unreadCounts: Record<number, number>;
  mentionCounts: Record<string, number>;
  lastMessageByContact: Map<string, ChatMessage>;
  selfId: number;
  termWidth: number;
}) {
  const marker = highlighted ? "›" : " ";
  const icon = contact.type === "group" ? "#" : "@";
  const unread = unreadCounts[contact.id] || 0;
  const mentions = mentionCounts[`${contact.type}:${contact.id}`] || 0;
  const lastMessage = lastMessageByContact.get(
    `${contact.type}:${contact.id}`
  );
  const latest = lastMessage
    ? `${lastMessage.senderId === selfId ? "you" : lastMessage.senderName}: ${compactMessage(lastMessage)}`
    : contact.type === "group"
    ? "Channel session"
    : "Direct session";
  const metaParts = [
    unread > 0 ? `${unread > 99 ? "99+" : unread} unread` : "",
    mentions > 0
      ? `${mentions > 99 ? "99+" : mentions} mention${mentions === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean);
  const meta = metaParts.length > 0
    ? metaParts.join(" · ")
    : `${contact.type}:${contact.id}`;
  const metaWidth = metaParts.length > 0
    ? Math.max(meta.length, 10)
    : contact.type === "group" ? 18 : 20;
  const nameWidth = Math.min(Math.max(Math.floor(termWidth * 0.28), 18), 36);
  const previewWidth = Math.max(termWidth - nameWidth - metaWidth - 8, 8);

  return (
    <Box key={contact.id} flexDirection="row" height={1} overflow="hidden">
      <Box width={nameWidth + 4}>
        <Text
          color={highlighted ? "yellow" : undefined}
          bold={highlighted}
          wrap="truncate-end"
        >
          {marker} {icon} {truncateCells(contact.name, nameWidth)}
        </Text>
      </Box>
      <Box width={previewWidth}>
        <Text dimColor wrap="truncate-end">
          {truncateCells(latest, previewWidth)}
        </Text>
      </Box>
      <Text
        color={mentions > 0 ? "magenta" : unread > 0 ? "green" : "gray"}
        bold={unread > 0 || mentions > 0}
        dimColor={unread === 0 && mentions === 0}
        wrap="truncate-end"
      >
        {truncateCells(meta, metaWidth)}
      </Text>
    </Box>
  );
}

export function SessionPicker({
  contacts,
  highlightIndex,
  scrollOffset,
  maxHeight,
  unreadCounts,
  mentionCounts,
  lastMessageByContact,
  selfId,
  termWidth,
  unreadTotal,
  mentionTotal,
}: SessionPickerProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} flexGrow={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>• Select session</Text>
        <Text dimColor>
          {unreadTotal > 0 ? `${unreadTotal} unread · ` : ""}
          {mentionTotal > 0
            ? `${mentionTotal} mention${mentionTotal === 1 ? "" : "s"} · `
            : ""}
          {contacts.length} match{contacts.length !== 1 ? "es" : ""}
        </Text>
      </Box>

      {scrollOffset > 0 && <Text dimColor>↑ {scrollOffset} more</Text>}

      {contacts.slice(scrollOffset, scrollOffset + maxHeight).map((contact, i) => (
        <ContactLine
          key={contact.id}
          contact={contact}
          highlighted={scrollOffset + i === highlightIndex}
          unreadCounts={unreadCounts}
          mentionCounts={mentionCounts}
          lastMessageByContact={lastMessageByContact}
          selfId={selfId}
          termWidth={termWidth}
        />
      ))}

      {contacts.length > scrollOffset + maxHeight && (
        <Text dimColor>↓ {contacts.length - scrollOffset - maxHeight} more</Text>
      )}

      {contacts.length === 0 && <Text dimColor>No matching sessions.</Text>}
    </Box>
  );
}
