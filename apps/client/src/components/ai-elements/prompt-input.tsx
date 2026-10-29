"use client";

// Text-only adaptation of Vercel AI Elements PromptInput. See NOTICE / LICENSE.
import { useRef, type ComponentProps, type FormEvent } from "react";
import { cn } from "@/lib/utils";

export function PromptInput({
  onSubmit,
  ...props
}: Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (
    message: { text: string },
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
}) {
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        const text = String(
          new FormData(event.currentTarget).get("message") ?? "",
        );
        void onSubmit({ text }, event);
      }}
    />
  );
}

export function PromptInputTextarea({
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  className,
  ...props
}: ComponentProps<"textarea">) {
  const composing = useRef(false);
  return (
    <textarea
      name="message"
      className={cn("field-sizing-content max-h-48 min-h-6", className)}
      {...props}
      onCompositionStart={(event) => {
        composing.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        onCompositionEnd?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.shiftKey ||
          composing.current ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229
        )
          return;
        event.preventDefault();
        const button =
          event.currentTarget.form?.querySelector<HTMLButtonElement>(
            'button[type="submit"]',
          );
        if (button && !button.disabled)
          event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
