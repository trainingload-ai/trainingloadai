"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FRAME_INTERVAL_MS = 24;

type RenderedText = {
  id: string;
  text: string;
};

type SmoothStreamingText = {
  isRendering: boolean;
  text: string;
};

function getStepSize(backlog: number): number {
  if (backlog > 480) return 36;
  if (backlog > 240) return 24;
  if (backlog > 120) return 12;
  if (backlog > 60) return 6;
  if (backlog > 24) return 3;
  return backlog > 8 ? 2 : 1;
}

function getSafeSliceEnd(text: string, start: number, step: number): number {
  let end = Math.min(text.length, start + step);
  if (end <= start || end >= text.length) return end;

  const previous = text.charCodeAt(end - 1);
  const next = text.charCodeAt(end);
  const splitsSurrogatePair =
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff;
  if (splitsSurrogatePair) end += 1;

  return end;
}

/**
 * Decouples visible assistant text from uneven network chunks.
 * The RAF loop is stable; incoming text only updates refs and never recreates it.
 */
export function useSmoothStreamingText(
  text: string,
  isStreaming: boolean,
  messageId: string,
): SmoothStreamingText {
  const [rendered, setRendered] = useState<RenderedText>(() => ({
    id: messageId,
    text: isStreaming ? "" : text,
  }));
  const renderedRef = useRef(rendered);
  const targetTextRef = useRef(text);
  const messageIdRef = useRef(messageId);
  const shouldAnimateRef = useRef(isStreaming);
  const frameRef = useRef(0);
  const lastFrameAtRef = useRef(Number.NEGATIVE_INFINITY);

  const renderFrame = useCallback((now: number) => {
    frameRef.current = 0;

    if (!shouldAnimateRef.current) return;

    const current = renderedRef.current;
    const target = targetTextRef.current;
    if (current.id !== messageIdRef.current) return;

    if (!target.startsWith(current.text)) {
      const next = { id: current.id, text: target };
      renderedRef.current = next;
      setRendered(next);
      return;
    }

    const backlog = target.length - current.text.length;
    if (backlog <= 0) return;

    const elapsed = now - lastFrameAtRef.current;
    if (elapsed < FRAME_INTERVAL_MS) {
      frameRef.current = window.requestAnimationFrame(renderFrame);
      return;
    }

    lastFrameAtRef.current = now;
    const end = getSafeSliceEnd(
      target,
      current.text.length,
      getStepSize(backlog),
    );
    const next = { id: current.id, text: target.slice(0, end) };
    renderedRef.current = next;
    setRendered(next);

    if (end < target.length) {
      frameRef.current = window.requestAnimationFrame(renderFrame);
    }
  }, []);

  const ensureFrame = useCallback(() => {
    if (frameRef.current !== 0) return;
    frameRef.current = window.requestAnimationFrame(renderFrame);
  }, [renderFrame]);

  useEffect(() => {
    targetTextRef.current = text;

    if (messageIdRef.current !== messageId) {
      messageIdRef.current = messageId;
      lastFrameAtRef.current = Number.NEGATIVE_INFINITY;
      const next = { id: messageId, text: isStreaming ? "" : text };
      renderedRef.current = next;
      setRendered(next);
    }

    const current = renderedRef.current;
    const canAnimateFromCurrent =
      current.id === messageId && text.startsWith(current.text);
    const shouldAnimate =
      isStreaming || (canAnimateFromCurrent && current.text !== text);
    shouldAnimateRef.current = shouldAnimate;

    if (!shouldAnimate) {
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      const next = { id: messageId, text };
      renderedRef.current = next;
      setRendered((current) =>
        current.id === next.id && current.text === next.text ? current : next,
      );
      return;
    }

    if (text !== renderedRef.current.text) {
      ensureFrame();
    }
  }, [ensureFrame, isStreaming, messageId, text]);

  useEffect(
    () => () => {
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        // StrictMode replays mount effects using the same refs. A cancelled
        // frame is no longer scheduled; leave the next setup free to restart.
        frameRef.current = 0;
      }
    },
    [],
  );

  if (rendered.id !== messageId) {
    return { isRendering: isStreaming, text: isStreaming ? "" : text };
  }

  const canRenderBufferedText = text.startsWith(rendered.text);
  const isCatchingUp =
    canRenderBufferedText && rendered.text.length < text.length;
  return {
    isRendering: isStreaming || isCatchingUp,
    text:
      canRenderBufferedText && (isStreaming || isCatchingUp)
        ? rendered.text
        : text,
  };
}
