import { createRequire } from "node:module";
import { Jimp } from "jimp";

interface FrameInfo {
  x: number; y: number; width: number; height: number;
  delay: number; disposal: number;
}
const { GifReader } = createRequire(import.meta.url)("omggif") as {
  GifReader: new (bytes: Buffer) => {
    width: number; height: number;
    numFrames(): number;
    loopCount(): number | null;
    frameInfo(index: number): FrameInfo;
    decodeAndBlitFrameRGBA(index: number, target: Buffer): void;
  };
};

export interface GifAnimation {
  frames: { source: Buffer; delay: number }[];
  // null means play once; zero means repeat forever.
  loops: number | null;
}

export async function prepareGif(bytes: Buffer): Promise<GifAnimation | undefined> {
  if (!/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return;
  const reader = new GifReader(bytes);
  const count = reader.numFrames();
  const pixels = reader.width * reader.height;
  // Bound both working memory and total decoding work. Fall back to a still.
  if (count < 2 || count > 300 || pixels > 4_000_000 || pixels * count > 40_000_000) return;
  let canvas = Buffer.alloc(pixels * 4);
  const frames: GifAnimation["frames"] = [];
  let encodedBytes = 0;
  for (let index = 0; index < count; index++) {
    const info = reader.frameInfo(index);
    const previous = info.disposal === 3 ? Buffer.from(canvas) : undefined;
    reader.decodeAndBlitFrameRGBA(index, canvas);
    const image = new Jimp({ data: Buffer.from(canvas), width: reader.width, height: reader.height });
    // Preserve enough detail for pixel protocols, including high-DPI cells.
    if (reader.width > 560 || reader.height > 400) image.scaleToFit({ w: 560, h: 400 });
    const source = await image.getBuffer("image/png");
    encodedBytes += source.length;
    if (encodedBytes > 16 * 1024 * 1024) return;
    frames.push({ source, delay: Math.max(100, info.delay * 10) });
    if (previous) canvas = previous;
    else if (info.disposal === 2) {
      // Clear the disposed rectangle so transparent overlays do not leave trails.
      for (let y = info.y; y < info.y + info.height; y++) {
        canvas.fill(0, (y * reader.width + info.x) * 4, (y * reader.width + info.x + info.width) * 4);
      }
    }
  }
  return { frames, loops: reader.loopCount() };
}
