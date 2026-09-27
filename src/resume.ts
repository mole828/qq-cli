export const RESUME_CHECK_INTERVAL_MS = 1_000;
export const RESUME_GAP_MS = 15_000;

// Wall time includes system sleep even on platforms whose monotonic clock pauses.
export function watchForResume(onResume: (gapMs: number) => void) {
  let lastCheck = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const gap = now - lastCheck;
    lastCheck = now;
    if (gap >= RESUME_GAP_MS) onResume(gap);
  }, RESUME_CHECK_INTERVAL_MS);
  return () => clearInterval(timer);
}
