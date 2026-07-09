import React from "react";
import { Box } from "ink";
import Image from "ink-picture";

interface ImagePreviewProps {
  source: string;
  height?: number;
  clipped?: boolean;
}

export const IMAGE_PREVIEW_WIDTH = 28;
export const IMAGE_PREVIEW_HEIGHT = 10;

export function ImagePreview({
  source,
  height = IMAGE_PREVIEW_HEIGHT,
  clipped = false,
}: ImagePreviewProps) {
  return (
    <Box
      width={IMAGE_PREVIEW_WIDTH}
      height={height}
      overflow="hidden"
    >
      <Image
        src={source}
        protocol={clipped ? "halfBlock" : undefined}
        width={IMAGE_PREVIEW_WIDTH}
        height={height}
        alt="[image]"
      />
    </Box>
  );
}
