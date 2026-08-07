import { rm, writeFile, rename, mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StickerItem } from "./types.js";

interface FaceCacheManifest {
  version: 1;
  action: string;
  requestedCount: number;
  loadedAt: string;
  items: StickerItem[];
}

export class CustomFaceCache {
  private directory: string | null = null;
  private cleanupRegistered = false;

  private async ensureDirectory() {
    if (!this.directory) {
      this.directory = await mkdtemp(join(tmpdir(), "qq-cli-faces-"));
    }

    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true;
      process.once("exit", () => {
        if (this.directory) {
          rmSync(this.directory, { recursive: true, force: true });
        }
      });
    }

    return this.directory;
  }

  async save(
    items: StickerItem[],
    action: string,
    requestedCount: number
  ): Promise<string> {
    const directory = await this.ensureDirectory();
    const target = join(directory, "faces.json");
    const temporary = join(directory, "faces.json.tmp");
    const manifest: FaceCacheManifest = {
      version: 1,
      action,
      requestedCount,
      loadedAt: new Date().toISOString(),
      items,
    };

    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporary, target);
    return target;
  }

  async clear() {
    const directory = this.directory;
    this.directory = null;
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
