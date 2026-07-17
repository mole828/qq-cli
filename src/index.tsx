import React, { useCallback, useState } from "react";
import { render, useWindowSize } from "ink";
import {
  InkPictureProvider,
  type TerminalInfo,
} from "ink-picture";
import { App } from "./App.js";

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

render(
  <ResponsivePictureProvider>
    <App />
  </ResponsivePictureProvider>
);
