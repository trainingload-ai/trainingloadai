import { useCallback, useRef, useState, useEffect, useMemo } from "react";

export type CssVarResolver = (value: string) => string;

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

export function createCssVarResolver(): CssVarResolver {
  if (typeof window === "undefined") return (value) => value;
  if (typeof document === "undefined") return (value) => value;
  const styles = window.getComputedStyle?.(document.documentElement);
  if (!styles) return (value) => value;
  return (value: string) => {
    const match = value.match(/^var\((--[^)]+)\)$/);
    if (!match) return value;
    const cssVarName = match[1];
    const resolved = styles.getPropertyValue(cssVarName).trim();
    return resolved || value;
  };
}

export function useCssVarResolver() {
  const [themeToken, setThemeToken] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeToken((v) => v + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  const cssVar = useMemo(() => {
    void themeToken;
    return createCssVarResolver();
  }, [themeToken]);

  return cssVar;
}

export function useThemeColor() {
  const cssVar = useCssVarResolver();

  const resolveColor = useCallback(
    (colorOrVar: string, alpha?: number) => {
      // If it's a CSS variable name (starts with --), resolve it
      if (colorOrVar.startsWith("--")) {
        const resolved = cssVar(`var(${colorOrVar})`);
        // Tailwind CSS variables are usually space-separated numbers (hsl channels)
        // If it looks like a color function or hex, return as is
        if (
          resolved.startsWith("#") ||
          resolved.startsWith("rgb") ||
          resolved.startsWith("hsl") ||
          resolved.startsWith("oklch") ||
          resolved === "transparent" ||
          resolved === "currentColor"
        ) {
          // If alpha is provided and it's a hex, we can't easily add alpha without parsing
          // For now, assume if it's resolved to a color string, we return it as is
          // Ideally we should parse it, but for this project variables are mostly HSL channels
          return resolved;
        }
        // Otherwise assume it's HSL channels and wrap it
        return alpha !== undefined
          ? `hsl(${resolved} / ${alpha})`
          : `hsl(${resolved})`;
      }

      // If it's already a color value, return as is
      return colorOrVar;
    },
    [cssVar],
  );

  return resolveColor;
}
