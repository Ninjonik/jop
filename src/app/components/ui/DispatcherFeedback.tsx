'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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

/** Action feedback uses the existing status bar without taking workspace space. */
export function ActionFeedback({
  message,
  error = false,
}: {
  message: string | null | undefined;
  error?: boolean;
}) {
  const setFeedback = useDispatcherFeedback()?.setFeedback;
  useEffect(() => {
    if (message && setFeedback) setFeedback({ message, error });
  }, [message, error, setFeedback]);
  if (setFeedback || !message) return null;
  return createPortal(
    <div
      className="runtime-feedback"
      role={error ? 'alert' : 'status'}
      aria-atomic="true"
      data-error={error || undefined}
    >
      {message}
    </div>,
    document.body,
  );
}
