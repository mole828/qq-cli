import React, { useState } from "react";
import { createRequire } from "node:module";
import { Box, Text, render, useApp, useInput } from "ink";
import { InkPictureProvider } from "ink-picture";
import { ImagePreview } from "./ui/ImagePreview.js";

// A local animation makes the preview reproducible without QQ or network access.
const { GifWriter } = createRequire(import.meta.url)("omggif");
const bytes = Buffer.alloc(64 * 1024);
const writer = new GifWriter(bytes, 56, 40, {
  palette: [0x15191f, 0x77ccaa, 0x35404c, 0xe5e9ef], loop: 0,
});
for (let frame = 0; frame < 24; frame++) {
  const pixels = new Uint8Array(56 * 40);
  const left = 3 + Math.round((1 - Math.cos(frame / 24 * Math.PI * 2)) * 20);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 56; x++) {
      if (y === 30) pixels[y * 56 + x] = 2;
      if (x >= left && x < left + 10 && y >= 14 && y < 24) pixels[y * 56 + x] = 1;
    }
  }
  writer.addFrame(0, 0, 56, 40, pixels, { delay: 10 });
}
const source = process.argv[2] ?? `base64://${bytes.subarray(0, writer.end()).toString("base64")}`;
function Demo() {
  const { exit } = useApp();
  const [halfBlock, setHalfBlock] = useState(false);
  useInput((input, key) => { if (input === "q" || key.escape) exit(); if (input === "h") setHalfBlock(value => !value); });
  return <Box flexDirection="column">
    <Text color="gray">GIF preview · h toggle quality · q / Esc exit</Text>
    <Text color="gray">{halfBlock ? "halfBlock" : "auto / native image protocol"}</Text>
    <ImagePreview animate source={source} forceHalfBlock={halfBlock} />
    <Text color="gray">qq-cli › animation stays above this line</Text>
  </Box>;
}
render(<InkPictureProvider><Demo /></InkPictureProvider>);
