import { copyFile, mkdtemp, readFile, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readClipboardImages } from "clipboard-image";

export interface ImageAttachment {
  id: string;
  path: string;
  mimeType: string;
}

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|heic|bmp|tiff?)$/i;

function normalizePastedPath(value: string) {
  let path = value.trim();
  if (
    (path.startsWith("'") && path.endsWith("'")) ||
    (path.startsWith('"') && path.endsWith('"'))
  ) {
    path = path.slice(1, -1);
  }
  path = path.replace(/\\([ \\])/g, "$1");
  return path.startsWith("file://") ? fileURLToPath(path) : path;
}

export function looksLikePastedImagePath(value: string) {
  const lines = value.trim().split(/\r?\n/).filter(Boolean);
  return lines.length > 0 && lines.every((line) => {
    const path = normalizePastedPath(line);
    return path.startsWith("/") && IMAGE_EXTENSION.test(path);
  });
}

export async function importPastedImagePaths(value: string): Promise<ImageAttachment[]> {
  const sourcePaths = value.trim().split(/\r?\n/).filter(Boolean).map(normalizePastedPath);
  const attachments: ImageAttachment[] = [];

  for (const sourcePath of sourcePaths) {
    const source = await stat(sourcePath);
    if (!source.isFile() || !IMAGE_EXTENSION.test(sourcePath)) {
      throw new Error(`not an image file: ${sourcePath}`);
    }
    const directory = await mkdtemp(join(tmpdir(), "qq-cli-image-"));
    const path = join(directory, basename(sourcePath));
    await copyFile(sourcePath, path);
    attachments.push({
      id: `${Date.now()}-${attachments.length}-${Math.random().toString(16).slice(2)}`,
      path,
      mimeType: `image/${extname(sourcePath).slice(1).toLowerCase()}`,
    });
  }

  return attachments;
}

export async function readClipboardImageAttachments(): Promise<ImageAttachment[]> {
  if (process.platform !== "darwin") {
    throw new Error("clipboard image paste currently requires macOS");
  }

  const paths = await readClipboardImages();
  if (paths.length === 0) throw new Error("no image on clipboard");

  return paths.map((path, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    path,
    mimeType: "image/png",
  }));
}

export async function attachmentToBase64(attachment: ImageAttachment) {
  const image = await readFile(attachment.path);
  return `base64://${image.toString("base64")}`;
}

export async function removeAttachment(attachment: ImageAttachment) {
  await rm(attachment.path, { force: true });
  await rmdir(dirname(attachment.path)).catch(() => {});
}
