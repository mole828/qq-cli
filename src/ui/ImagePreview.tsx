import { fileURLToPath } from "node:url";
import React, { useEffect, useSyncExternalStore } from "react";
import { Box, Text } from "ink";
import Image, { useTerminalInfo } from "ink-picture";
import { Jimp } from "jimp";
import { logger } from "../logger.js";

interface ImagePreviewProps {
  source: string;
  height?: number;
  clipped?: boolean;
}

export const IMAGE_PREVIEW_WIDTH = 28;
export const IMAGE_PREVIEW_HEIGHT = 10;
const IMAGE_REQUEST_TIMEOUT_MS = 15_000;

interface ImageDimensions {
  width: number;
  height: number;
}

interface PreparedImage {
  dimensions: ImageDimensions;
  renderSource: string | Buffer;
}

const imageMetadataCache = new Map<string, Promise<PreparedImage | null>>();
const preparedImageCache = new Map<string, PreparedImage | null>();
const metadataListeners = new Set<() => void>();
let metadataVersion = 0;

function publishPreparedImage(source: string, image: PreparedImage | null) {
  preparedImageCache.set(source, image);
  metadataVersion += 1;
  for (const listener of metadataListeners) listener();
}

function subscribeToImageMetadata(listener: () => void) {
  metadataListeners.add(listener);
  return () => metadataListeners.delete(listener);
}

export function useImageMetadataVersion() {
  return useSyncExternalStore(
    subscribeToImageMetadata,
    () => metadataVersion,
    () => metadataVersion
  );
}

function prepareImage(source: string) {
  let pending = imageMetadataCache.get(source);
  if (!pending) {
    pending = loadImageSource(source)
      .then(async (renderSource) => ({
        image: await Jimp.read(renderSource),
        renderSource,
      }))
      .then(({ image, renderSource }) => ({
        dimensions: {
          width: image.bitmap.width,
          height: image.bitmap.height,
        },
        renderSource,
      }))
      .catch((error: unknown) => {
        let host = "local";
        try {
          if (/^https?:\/\//i.test(source)) host = new URL(source).host;
        } catch {
          host = "invalid-url";
        }
        logger.warn("Image preview failed", {
          host,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
      .then((image) => {
        publishPreparedImage(source, image);
        return image;
      });
    imageMetadataCache.set(source, pending);

    if (imageMetadataCache.size > 32) {
      const oldestSource = imageMetadataCache.keys().next().value!;
      imageMetadataCache.delete(oldestSource);
      preparedImageCache.delete(oldestSource);
    }
  }

  return pending;
}

async function loadImageSource(source: string): Promise<string | Buffer> {
  if (source.startsWith("base64://")) {
    return normalizeImageBytes(
      Buffer.from(source.slice("base64://".length), "base64")
    );
  }
  if (source.startsWith("file://")) return fileURLToPath(source);
  if (!/^https?:\/\//i.test(source)) return source;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Image request failed with HTTP ${response.status}`);
    }
    // Keep the downloaded bytes as the render source. This avoids ink-picture
    // issuing a second network request after Jimp has inspected the image.
    return normalizeImageBytes(Buffer.from(await response.arrayBuffer()));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeImageBytes(bytes: Buffer) {
  // pngjs rejects otherwise valid PNGs when a CDN appends bytes after IEND.
  // Browsers generally tolerate this, so trim only the well-defined trailing
  // payload while preserving the complete PNG stream and its IEND CRC.
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < pngSignature.length || !bytes.subarray(0, 8).equals(pngSignature)) {
    return bytes;
  }

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.length) return bytes;
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IEND") {
      return chunkEnd < bytes.length ? bytes.subarray(0, chunkEnd) : bytes;
    }
    offset = chunkEnd;
  }

  return bytes;
}

function usePreparedImage(source: string) {
  const version = useImageMetadataVersion();

  useEffect(() => {
    if (!preparedImageCache.has(source)) void prepareImage(source);
  }, [source, version]);

  return preparedImageCache.get(source) ?? null;
}

export function getCachedImageDimensions(source: string) {
  return preparedImageCache.get(source)?.dimensions ?? null;
}

export function getImagePreviewHeight(
  source: string,
  cellWidth: number,
  cellHeight: number,
  maxHeight = IMAGE_PREVIEW_HEIGHT
) {
  const dimensions = getCachedImageDimensions(source);
  if (!dimensions && preparedImageCache.has(source)) return 1;
  return dimensions
    ? containImageInCells(
        dimensions,
        cellWidth,
        cellHeight,
        IMAGE_PREVIEW_WIDTH,
        maxHeight
      ).height
    : maxHeight;
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
  const failed = preparedImageCache.has(source) && preparedImage === null;
  const terminalInfo = useTerminalInfo();
  const maxHeight = Math.max(Math.min(height, IMAGE_PREVIEW_HEIGHT), 1);
  const naturalSize = preparedImage
    ? containImageInCells(
        preparedImage.dimensions,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight
      )
    : null;
  const previewSize = preparedImage && naturalSize && naturalSize.height > maxHeight
    ? containImageInCells(
        preparedImage.dimensions,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        IMAGE_PREVIEW_WIDTH,
        maxHeight
      )
    : naturalSize;

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
        <Text color="gray">{failed ? "[image unavailable]" : "[image loading]"}</Text>
      )}
    </Box>
  );
}
