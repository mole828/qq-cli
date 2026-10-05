import React, { useEffect, useRef, useState } from "react";
import type { Contact } from "./types.js";
import { watchForResume } from "./resume.js";
import { logger } from "./logger.js";

export interface ResumeSession {
  selfId: number;
  type: Contact["type"];
  id: number;
}

interface RestartOnResumeProps {
  children: (
    session: ResumeSession | null,
    onSessionChange: (session: ResumeSession) => void
  ) => React.ReactNode;
}

export function RestartOnResume({ children }: RestartOnResumeProps) {
  const sessionRef = useRef<ResumeSession | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => watchForResume((gapMs) => {
    logger.info("Restarting application after suspension", { gapMs });
    setGeneration((current) => current + 1);
  }), []);
  return (
    <React.Fragment key={generation}>
      {children(sessionRef.current, (session) => { sessionRef.current = session; })}
    </React.Fragment>
  );
}
