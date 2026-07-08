import React from "react";
import { Box, Text } from "ink";

export const HELP_ROWS = [
  ["/session <name|id>", "Open the session picker or jump to one match"],
  ["/contacts [query]", "Search all indexed sessions"],
  ["/groups [query]", "Search channel sessions"],
  ["/friends [query]", "Search direct sessions"],
  ["/images off|link|inline", "Set image display mode"],
  ["/reload", "Reload account info and session index"],
  ["/help", "Show this command panel"],
  ["Tab", "Cycle sessions"],
  ["↑ / ↓", "Scroll through message history"],
  ["Esc", "Close panel or clear input"],
  ["Cmd+V / Ctrl+V", "Attach image from the macOS clipboard"],
  ["Backspace", "Remove the last attachment when input is empty"],
  ["Ctrl+Q / Ctrl+C", "Quit"],
] as const;

export function HelpPanel() {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>• Command palette</Text>
      <Box marginTop={1} flexDirection="column">
        {HELP_ROWS.map(([keyName, description]) => (
          <Box key={keyName}>
            <Box width={24}>
              <Text color="cyan">  {keyName}</Text>
            </Box>
            <Text dimColor>{description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
