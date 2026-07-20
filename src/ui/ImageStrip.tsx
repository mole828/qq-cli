import React from "react";
import { Box } from "ink";
import { IMAGE_PREVIEW_WIDTH, ImagePreview } from "./ImagePreview.js";

const IMAGE_GAP = 1;

interface ImageStripProps {
  sources: string[];
  width: number;
  height: number;
  clipped?: boolean;
}

export function ImageStrip({
  sources,
  width,
  height,
  clipped = false,
}: ImageStripProps) {
  const availableWidth = Math.max(width, 1);
  const slotWidth = Math.min(IMAGE_PREVIEW_WIDTH, availableWidth);
  const visibleCount = Math.max(
    Math.floor((availableWidth + IMAGE_GAP) / (slotWidth + IMAGE_GAP)),
    1
  );
  const visibleSources = sources.slice(0, visibleCount);

  return (
    <Box
      width={availableWidth}
      height={Math.max(height, 1)}
      overflow="hidden"
    >
      <Box flexDirection="row" columnGap={IMAGE_GAP} flexShrink={0}>
        {visibleSources.map((source, index) => (
          <ImagePreview
            key={`${source}-${index}`}
            source={source}
            height={height}
            maxWidth={slotWidth}
            forceHalfBlock={clipped}
          />
        ))}
      </Box>
    </Box>
  );
}
