import React from "react";
import { Box } from "ink";
import type { ImageReference, ImageSourceResolver } from "../types.js";
import { IMAGE_PREVIEW_WIDTH, ImagePreview } from "./ImagePreview.js";

const IMAGE_GAP = 1;

interface ImageStripProps {
  references: ImageReference[];
  width: number;
  height: number;
  clipped?: boolean;
  resolveSource?: ImageSourceResolver;
}

export function ImageStrip({
  references,
  width,
  height,
  clipped = false,
  resolveSource,
}: ImageStripProps) {
  const availableWidth = Math.max(width, 1);
  const slotWidth = Math.min(IMAGE_PREVIEW_WIDTH, availableWidth);
  const visibleCount = Math.max(
    Math.floor((availableWidth + IMAGE_GAP) / (slotWidth + IMAGE_GAP)),
    1
  );
  const visibleReferences = references.slice(0, visibleCount);

  return (
    <Box
      width={availableWidth}
      height={Math.max(height, 1)}
      overflow="hidden"
    >
      <Box flexDirection="row" columnGap={IMAGE_GAP} flexShrink={0}>
        {visibleReferences.map((reference, index) => (
          <ImagePreview
            key={`${reference.source}-${index}`}
            source={reference.source}
            file={reference.file}
            resolveSource={resolveSource}
            height={height}
            maxWidth={slotWidth}
            forceHalfBlock={clipped}
          />
        ))}
      </Box>
    </Box>
  );
}
