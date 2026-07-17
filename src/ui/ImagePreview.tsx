import { fileURLToPath } from "node:url";
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Image, { useTerminalInfo } from "ink-picture";
import { Jimp } from "jimp";

interface ImagePreviewProps {
  source: string;
  height?: number;
  clipped?: boolean;
}

export const IMAGE_PREVIEW_WIDTH = 28;
export const IMAGE_PREVIEW_HEIGHT = 10;

interface ImageDimensions {
  width: number;
  height: number;
}

interface PreparedImage {
  dimensions: ImageDimensions;
  renderSource: string | Buffer;
}

const imageMetadataCache = new Map<string, Promise<PreparedImage | null>>();

function prepareImage(source: string) {
  let pending = imageMetadataCache.get(source);
  if (!pending) {
    const renderSource = source.startsWith("base64://")
      ? Buffer.from(source.slice("base64://".length), "base64")
      : source;
    const readSource = typeof renderSource === "string" && renderSource.startsWith("file://")
      ? fileURLToPath(renderSource)
      : renderSource;

    pending = Jimp.read(readSource)
      .then((image) => ({
        dimensions: {
          width: image.bitmap.width,
          height: image.bitmap.height,
        },
        renderSource,
      }))
      .catch(() => null);
    imageMetadataCache.set(source, pending);

    if (imageMetadataCache.size > 32) {
      imageMetadataCache.delete(imageMetadataCache.keys().next().value!);
    }
  }

  return pending;
}

function usePreparedImage(source: string) {
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreparedImage(null);
    prepareImage(source).then((next) => {
      if (!cancelled) setPreparedImage(next);
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return preparedImage;
}

export function containImageInCells(
  dimensions: ImageDimensions,
  cellWidth: number,
  cellHeight: number,
  maxWidth = IMAGE_PREVIEW_WIDTH,
  maxHeight = IMAGE_PREVIEW_HEIGHT
) {
  const imageAspect = dimensions.width / dimensions.height;
  const boxAspect = (maxWidth * cellWidth) / (maxHeight * cellHeight);

  if (imageAspect >= boxAspect) {
    return {
      width: maxWidth,
      height: Math.max(
        1,
        Math.min(
          maxHeight,
          Math.round((maxWidth * cellWidth) / imageAspect / cellHeight)
        )
      ),
    };
  }

  return {
    width: Math.max(
      1,
      Math.min(
        maxWidth,
        Math.round((maxHeight * cellHeight * imageAspect) / cellWidth)
      )
    ),
    height: maxHeight,
  };
}

export function ImagePreview({
  source,
  height = IMAGE_PREVIEW_HEIGHT,
  clipped = false,
}: ImagePreviewProps) {
  const preparedImage = usePreparedImage(source);
  const terminalInfo = useTerminalInfo();
  const maxHeight = Math.max(Math.min(height, IMAGE_PREVIEW_HEIGHT), 1);
  const previewSize = preparedImage
    ? containImageInCells(
        preparedImage.dimensions,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        IMAGE_PREVIEW_WIDTH,
        maxHeight
      )
    : null;

  return (
    <Box
      width={IMAGE_PREVIEW_WIDTH}
      height={maxHeight}
      overflow="hidden"
    >
      {preparedImage && previewSize ? (
        <Image
          key={`${terminalInfo.cellWidth}x${terminalInfo.cellHeight}`}
          src={preparedImage.renderSource}
          protocol={clipped ? "halfBlock" : undefined}
          width={previewSize.width}
          height={previewSize.height}
          alt="[image]"
        />
      ) : (
        <Text color="gray">[image]</Text>
      )}
    </Box>
  );
}
