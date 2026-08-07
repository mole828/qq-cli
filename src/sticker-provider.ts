import type { QQClient } from "./qq-client.js";
import type { StickerItem } from "./types.js";
import {
  getConfiguredCustomFaceCount,
} from "./face-config.js";

export type StickerCapability = "unknown" | "supported" | "unsupported";

const DEFAULT_CUSTOM_FACE_ACTION = "fetch_custom_face";

function configuredCustomFaceAction() {
  const action = process.env.QQ_CLI_CUSTOM_FACE_ACTION?.trim();
  return action || DEFAULT_CUSTOM_FACE_ACTION;
}

export class CustomFaceProvider {
  readonly action = configuredCustomFaceAction();
  readonly count = getConfiguredCustomFaceCount();

  async load(client: QQClient, count = this.count): Promise<StickerItem[] | null> {
    const files = await client.getCustomFaces(count, this.action);
    if (files === null) return null;

    const seen = new Set<string>();
    return files.flatMap((file, index) => {
      if (!file || seen.has(file)) return [];
      seen.add(file);
      return [{
        id: `${this.action}:${index}`,
        file,
        source: "custom" as const,
      }];
    });
  }
}
