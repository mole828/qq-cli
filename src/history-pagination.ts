import type { ChatMessage } from "./types.js";

export const HISTORY_PAGE_SIZE = 20;

export function shouldAdvanceHistoryViewport(
  requestScrollVersion: number,
  currentScrollVersion: number
) {
  return requestScrollVersion === currentScrollVersion;
}

export type HistoryRequestKind = "initial" | "older";

export interface HistoryPageRequest {
  sessionKey: string;
  requestId: number;
  kind: HistoryRequestKind;
  beforeMessageId?: number | string;
}

export interface HistoryPaginationSnapshot {
  initialLoaded: boolean;
  hasMore: boolean;
  loading: boolean;
}

interface SessionState extends HistoryPaginationSnapshot {
  pendingRequestId: number | null;
}

export interface HistoryPageCompletion {
  kind: HistoryRequestKind;
  failed: boolean;
  hasMore: boolean;
}

/** Coordinates one in-flight history request per session and makes failures retryable. */
export class HistoryPagination {
  private readonly sessions = new Map<string, SessionState>();
  private nextRequestId = 0;

  private stateFor(sessionKey: string) {
    let state = this.sessions.get(sessionKey);
    if (!state) {
      state = {
        initialLoaded: false,
        hasMore: false,
        loading: false,
        pendingRequestId: null,
      };
      this.sessions.set(sessionKey, state);
    }
    return state;
  }

  snapshot(sessionKey: string): HistoryPaginationSnapshot {
    const { initialLoaded, hasMore, loading } = this.stateFor(sessionKey);
    return { initialLoaded, hasMore, loading };
  }

  beginInitial(sessionKey: string): HistoryPageRequest | null {
    const state = this.stateFor(sessionKey);
    if (state.initialLoaded || state.loading) return null;
    return this.begin(sessionKey, state, "initial");
  }

  beginOlder(
    sessionKey: string,
    beforeMessageId: number | string | undefined
  ): HistoryPageRequest | null {
    const state = this.stateFor(sessionKey);
    if (
      !state.initialLoaded ||
      !state.hasMore ||
      state.loading ||
      beforeMessageId === undefined
    ) {
      return null;
    }
    return this.begin(sessionKey, state, "older", beforeMessageId);
  }

  private begin(
    sessionKey: string,
    state: SessionState,
    kind: HistoryRequestKind,
    beforeMessageId?: number | string
  ): HistoryPageRequest {
    const requestId = ++this.nextRequestId;
    state.loading = true;
    state.pendingRequestId = requestId;
    return { sessionKey, requestId, kind, beforeMessageId };
  }

  isCurrent(request: HistoryPageRequest) {
    return this.sessions.get(request.sessionKey)?.pendingRequestId === request.requestId;
  }

  complete(
    request: HistoryPageRequest,
    pageLength: number | null,
    addedMessageCount = 0
  ): HistoryPageCompletion | null {
    const state = this.sessions.get(request.sessionKey);
    if (!state || state.pendingRequestId !== request.requestId) return null;

    state.loading = false;
    state.pendingRequestId = null;
    if (pageLength === null) {
      return { kind: request.kind, failed: true, hasMore: state.hasMore };
    }

    if (request.kind === "initial") {
      state.initialLoaded = true;
      // Fetch one more page when the first request returned anything. A short
      // final page is cheap to probe; an empty page marks the end exactly.
      state.hasMore = pageLength > 0;
    } else {
      // Some adapters repeat the cursor entry. Only newly merged IDs count as
      // progress, so a repeated page cannot trigger an endless fetch loop.
      state.hasMore = pageLength > 0 && addedMessageCount > 0;
    }

    return { kind: request.kind, failed: false, hasMore: state.hasMore };
  }

  reset(sessionKey: string) {
    this.sessions.delete(sessionKey);
  }
}

export function historyMessageKey(message: ChatMessage) {
  return `${message.chatType}:${message.contactId}:${message.id}`;
}

/** Merge API history before existing messages so same-second older IDs retain API order. */
export function mergeHistoryMessages(
  existing: ChatMessage[],
  page: ChatMessage[]
): { messages: ChatMessage[]; added: ChatMessage[] } {
  const existingKeys = new Set(existing.map(historyMessageKey));
  const merged = new Map<string, ChatMessage>();
  for (const message of [...page, ...existing]) {
    merged.set(historyMessageKey(message), message);
  }
  const addedKeys = new Set<string>();
  const added: ChatMessage[] = [];
  for (const message of page) {
    const key = historyMessageKey(message);
    if (existingKeys.has(key) || addedKeys.has(key)) continue;
    addedKeys.add(key);
    added.push(message);
  }

  return {
    messages: [...merged.values()].sort((a, b) => a.timestamp - b.timestamp),
    added,
  };
}

export function earliestHistoryMessage(messages: ChatMessage[]) {
  let earliest: ChatMessage | null = null;
  for (const message of messages) {
    if (!earliest || message.timestamp < earliest.timestamp) earliest = message;
  }
  return earliest;
}
