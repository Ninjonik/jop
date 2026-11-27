'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export type DispatcherFeedback = { message: string; error: boolean };
const FeedbackContext = createContext<{
  feedback: DispatcherFeedback | null;
  setFeedback: (feedback: DispatcherFeedback | null) => void;
} | null>(null);

export function DispatcherFeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<DispatcherFeedback | null>(null);
  return (
    <FeedbackContext.Provider value={{ feedback, setFeedback }}>
      {children}
    </FeedbackContext.Provider>
  );
}

export function useDispatcherFeedback() {
  return useContext(FeedbackContext);
}

export function DispatcherFeedbackStatus() {
  const context = useDispatcherFeedback();
  return (
    <span
      className="dispatcher-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-error={context?.feedback?.error || undefined}
      title={context?.feedback?.message}
    >
      {context?.feedback?.message}
    </span>
  );
}
