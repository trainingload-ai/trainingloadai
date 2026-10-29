import { useCallback, useRef, useState } from "react";

export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        setSize((prev) => {
          const nextWidth = Math.max(0, Math.floor(width));
          const nextHeight = Math.max(0, Math.floor(height));
          if (nextWidth <= 0 || nextHeight <= 0) return prev;
          if (prev.width === nextWidth && prev.height === nextHeight)
            return prev;
          return { width: nextWidth, height: nextHeight };
        });
      });
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

  return { ref, size };
}
