import React from "react";
import { Box, Text } from "ink";

export const HELP_ROWS = [
  ["/session <name|id>", "Open the session picker or jump to one match"],
  ["/contacts [query]", "Search all indexed sessions"],
  ["/groups [query]", "Search channel sessions"],
  ["/friends [query]", "Search direct sessions"],
  ["/images [on|off]", "Toggle expanded image references"],
  ["/reload", "Reload account info and session index"],
  ["/help", "Show this command panel"],
  ["Tab", "Cycle sessions"],
  ["Esc", "Close panel or clear input"],
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
