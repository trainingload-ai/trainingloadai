"use client";

import { useEffect, useState } from "react";

/** One polite announcement, delayed to let the next field finish speaking. */
export function FieldErrorAnnouncement({ message }: { message: string }) {
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(message), 500);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {message === announcement ? announcement : ""}
    </span>
  );
}
