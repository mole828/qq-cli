import React, { useCallback, useState } from "react";
import { render, useWindowSize } from "ink";
import {
  InkPictureProvider,
  type TerminalInfo,
} from "ink-picture";
import { App } from "./App.js";
import { getInitialImageMode, parseImageMode, parseMessageGap } from "./config.js";
import { HistoryApp } from "./HistoryApp.js";
import { readChatHistory } from "./history-file.js";

interface TerminalInfoSample {
  info: TerminalInfo;
  columns: number;
  rows: number;
}

function sameTerminalInfo(a: TerminalInfo, b: TerminalInfo) {
  return (Object.keys(a) as Array<keyof TerminalInfo>).every(
    (key) => a[key] === b[key]
  );
}

function ResponsivePictureProvider({ children }: { children: React.ReactNode }) {
  const { columns, rows } = useWindowSize();
  const [sample, setSample] = useState<TerminalInfoSample | null>(null);

  const handleTerminalInfo = useCallback(
    (info: TerminalInfo) => {
      setSample((current) => {
        if (
          current &&
          current.columns === columns &&
          current.rows === rows &&
          sameTerminalInfo(current.info, info)
        ) {
          return current;
        }

        return { info, columns, rows };
      });
    },
    [columns, rows]
  );

  return (
    <InkPictureProvider
      terminalInfo={sample?.info}
      onTerminalInfoDetection={handleTerminalInfo}
    >
      {children}
    </InkPictureProvider>
  );
}

function getOption(name: string) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const historyPath = getOption("--history");
const offsetValue = Number.parseInt(getOption("--offset") || "0", 10);
const initialOffset = Number.isFinite(offsetValue) ? Math.max(offsetValue, 0) : 0;
const imageModeArgument = getOption("--image-mode");
const imageMode = imageModeArgument
  ? parseImageMode(imageModeArgument)
  : getInitialImageMode();
const messageGap = parseMessageGap(
  getOption("--message-gap") ?? process.env.QQ_CLI_MESSAGE_GAP
);
const history = historyPath ? await readChatHistory(historyPath) : null;

render(
  <ResponsivePictureProvider>
    {history ? (
      <HistoryApp
        history={history}
        initialOffset={initialOffset}
        initialImageMode={imageMode}
        messageGap={messageGap}
      />
    ) : (
      <App />
    )}
  </ResponsivePictureProvider>
);
