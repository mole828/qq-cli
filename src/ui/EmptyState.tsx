import React from "react";
import { Box, Text } from "ink";
import type { Contact } from "../types.js";
import { truncateCells } from "../terminal-text.js";

interface EmptyStateProps {
  activeSession: Contact | null;
  connected: boolean;
  termWidth: number;
}

export function EmptyState({
  activeSession,
  connected,
  termWidth,
}: EmptyStateProps) {
  if (activeSession) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>
          • {truncateCells(activeSession.name, Math.max(termWidth - 6, 10))}
        </Text>
        <Text color="gray" dimColor>
          └ local session is empty. Type below to append a message.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={connected ? "green" : "yellow"} bold>
        • {connected ? "Ready" : "Connecting"}
      </Text>
      <Text color="gray" dimColor>
        └{" "}
        {connected
          ? "Use /session to select a session, /contacts to search, or /help."
          : "Waiting for OneBot WebSocket. Check ONEBOT_WS_URL if this stays here."}
      </Text>
    </Box>
  );
}
