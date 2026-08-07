import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React, { useEffect, useSyncExternalStore } from "react";
import { Box, Text } from "ink";
import Image, { useTerminalInfo } from "ink-picture";
import { Jimp } from "jimp";
import { logger } from "../logger.js";
import type { ImageSourceResolver } from "../types.js";

interface ImagePreviewProps {
  source: string;
  height?: number;
  maxWidth?: number;
  clipped?: boolean;
  forceHalfBlock?: boolean;
  file?: string;
  resolveSource?: ImageSourceResolver;
}

export const IMAGE_PREVIEW_WIDTH = 28;
export const IMAGE_PREVIEW_HEIGHT = 10;
const IMAGE_REQUEST_TIMEOUT_MS = 15_000;
const IMAGE_RETRY_DELAY_MS = 30_000;
const MAX_IMAGE_CACHE_SIZE = 32;

interface ImageDimensions {
  width: number;
  height: number;
}

interface PreparedImage {
  dimensions: ImageDimensions;
  renderSource: string;
}

const imageMetadataCache = new Map<string, Promise<PreparedImage | null>>();
const preparedImageCache = new Map<string, PreparedImage | null>();
const imageFailureTime = new Map<string, number>();
const activeImageSources = new Map<string, number>();
const pinnedImageSources = new Map<string, number>();
const pendingImageSources = new Set<string>();
const metadataListeners = new Set<() => void>();
let metadataVersion = 0;
let imageTempDirPromise: Promise<string> | null = null;

function getImageTempDir() {
  if (!imageTempDirPromise) {
    imageTempDirPromise = mkdtemp(join(tmpdir(), "qq-cli-images-"));
    void imageTempDirPromise.then((directory) => {
      const cleanup = () => rmSync(directory, { recursive: true, force: true });
      process.once("exit", cleanup);
    });
  }
  return imageTempDirPromise;
}

function evictImageCache() {
  if (imageMetadataCache.size <= MAX_IMAGE_CACHE_SIZE) return;

  for (const candidate of imageMetadataCache.keys()) {
    if (pendingImageSources.has(candidate)) continue;
    if ((activeImageSources.get(candidate) ?? 0) > 0) continue;
    if ((pinnedImageSources.get(candidate) ?? 0) > 0) continue;

    imageMetadataCache.delete(candidate);
    preparedImageCache.delete(candidate);
    imageFailureTime.delete(candidate);
    if (imageMetadataCache.size <= MAX_IMAGE_CACHE_SIZE) return;
  }
}

function retainImageSource(source: string) {
  activeImageSources.set(source, (activeImageSources.get(source) ?? 0) + 1);
  return () => {
    const count = activeImageSources.get(source) ?? 0;
    if (count <= 1) activeImageSources.delete(source);
    else activeImageSources.set(source, count - 1);
    evictImageCache();
  };
}

function retainPinnedImageSource(source: string) {
  pinnedImageSources.set(source, (pinnedImageSources.get(source) ?? 0) + 1);
  return () => {
    const count = pinnedImageSources.get(source) ?? 0;
    if (count <= 1) pinnedImageSources.delete(source);
    else pinnedImageSources.set(source, count - 1);
    evictImageCache();
  };
}

export function usePinnedImageSources(sources: readonly string[]) {
  useEffect(() => {
    const uniqueSources = new Set(sources);
    const release = [...uniqueSources].map(retainPinnedImageSource);
    return () => {
      for (const releaseSource of release) releaseSource();
    };
  }, [sources]);
}

function publishPreparedImage(source: string, image: PreparedImage | null) {
  preparedImageCache.set(source, image);
  if (image) imageFailureTime.delete(source);
  else imageFailureTime.set(source, Date.now());
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

function prepareImage(
  source: string,
  file?: string,
  resolveSource?: ImageSourceResolver
) {
  let pending = imageMetadataCache.get(source);
  if (!pending) {
    pendingImageSources.add(source);
    pending = loadImageWithFallback(source, file, resolveSource)
      .then(async (loadedSource) => ({
        image: await Jimp.read(loadedSource),
        renderSource: await cacheRenderSource(source, loadedSource),
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
        // An evicted or superseded request must not overwrite a newer result.
        if (imageMetadataCache.get(source) === pending) {
          publishPreparedImage(source, image);
        }
        return image;
      });
    imageMetadataCache.set(source, pending);
    void pending.then(
      () => {
        if (imageMetadataCache.get(source) === pending) {
          pendingImageSources.delete(source);
        }
        evictImageCache();
      },
      () => {
        if (imageMetadataCache.get(source) === pending) {
          pendingImageSources.delete(source);
        }
        evictImageCache();
      }
    );
  }

  return pending;
}

async function loadImageWithFallback(
  source: string,
  file?: string,
  resolveSource?: ImageSourceResolver
) {
  try {
    return await loadImageSource(source);
  } catch (initialError) {
    if (!file || !resolveSource) throw initialError;

    const refreshedSource = await resolveSource(file);
    if (!refreshedSource || refreshedSource === source) throw initialError;
    logger.info("Retrying image preview with refreshed URL", { file });
    return loadImageSource(refreshedSource);
  }
}

async function cacheRenderSource(source: string, loadedSource: string | Buffer) {
  if (typeof loadedSource === "string") return loadedSource;
  const directory = await getImageTempDir();
  const fileName = createHash("sha256").update(source).digest("hex");
  const path = join(directory, fileName);
  await writeFile(path, loadedSource);
  return path;
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

function usePreparedImage(
  source: string,
  file?: string,
  resolveSource?: ImageSourceResolver
) {
  // The store subscription rerenders this component when metadata arrives.
  // Loading must stay independent of that version, otherwise every completed
  // preview can restart another request while the cache is being populated.
  useImageMetadataVersion();

  useEffect(() => retainImageSource(source), [source]);

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRetry() {
      if (disposed || retryTimer || imageFailureTime.get(source) === undefined) {
        return;
      }

      const failedAt = imageFailureTime.get(source)!;
      const retryIn = Math.max(
        IMAGE_RETRY_DELAY_MS - (Date.now() - failedAt),
        0
      );
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (disposed || imageFailureTime.get(source) === undefined) return;

        imageMetadataCache.delete(source);
        preparedImageCache.delete(source);
        imageFailureTime.delete(source);
        void prepareImage(source, file, resolveSource).then((image) => {
          if (image === null) scheduleRetry();
        });
      }, retryIn);
    }

    if (!preparedImageCache.has(source)) {
      void prepareImage(source, file, resolveSource).then((image) => {
        if (image === null) scheduleRetry();
      });
    } else {
      scheduleRetry();
    }

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [source, file, resolveSource]);

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
  maxWidth = IMAGE_PREVIEW_WIDTH,
  clipped = false,
  forceHalfBlock = false,
  file,
  resolveSource,
}: ImagePreviewProps) {
  const preparedImage = usePreparedImage(source, file, resolveSource);
  const failed = preparedImageCache.has(source) && preparedImage === null;
  const terminalInfo = useTerminalInfo();
  const maxHeight = Math.max(Math.min(height, IMAGE_PREVIEW_HEIGHT), 1);
  const previewMaxWidth = Math.max(Math.min(maxWidth, IMAGE_PREVIEW_WIDTH), 1);
  const naturalSize = preparedImage
    ? containImageInCells(
        preparedImage.dimensions,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        previewMaxWidth,
        maxHeight
      )
    : null;
  const previewSize = preparedImage && naturalSize && naturalSize.height > maxHeight
    ? containImageInCells(
        preparedImage.dimensions,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        previewMaxWidth,
        maxHeight
      )
    : naturalSize;

  return (
    <Box
      width={previewMaxWidth}
      height={maxHeight}
      overflow="hidden"
    >
      {preparedImage && previewSize ? (
        <Image
          key={`${terminalInfo.cellWidth}x${terminalInfo.cellHeight}`}
          src={preparedImage.renderSource}
          protocol={clipped || forceHalfBlock ? "halfBlock" : undefined}
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
