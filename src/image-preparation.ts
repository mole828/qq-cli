import { Jimp } from "jimp";

// Match the detail retained by GIF previews, including high-DPI terminal cells.
export const MAX_PREVIEW_PIXEL_WIDTH = 560;
export const MAX_PREVIEW_PIXEL_HEIGHT = 400;

export async function prepareImageThumbnail(source: string | Buffer) {
  const image = await Jimp.read(source);
  const mime = image.mime;
  const dimensions = { width: image.bitmap.width, height: image.bitmap.height };
  if (dimensions.width > MAX_PREVIEW_PIXEL_WIDTH || dimensions.height > MAX_PREVIEW_PIXEL_HEIGHT) {
    image.scaleToFit({ w: MAX_PREVIEW_PIXEL_WIDTH, h: MAX_PREVIEW_PIXEL_HEIGHT });
  }
  return { mime, dimensions, bytes: await image.getBuffer("image/png") };
}

// Share a queue across previews so a sticker page cannot decode all of its
// full-resolution originals at once. Failed tasks also release their slot.
export function createImagePreparationQueue(concurrency = 2) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Image preparation concurrency must be a positive integer");
  }
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => { active++; resolve(); };
      if (active < concurrency) start();
      else waiting.push(start);
    });
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
