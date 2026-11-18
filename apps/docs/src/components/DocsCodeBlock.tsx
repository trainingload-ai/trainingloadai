"use client";

import { useRef, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import {
  scrollRegionByKeyboard,
  useScrollability,
} from "@/lib/use-scrollability";

/** Preserve Fumadocs highlighting and copying while making its viewport operable. */
export function DocsCodeBlock({
  children,
  ...props
}: ComponentProps<typeof CodeBlock>) {
  const t = useTranslations("accessibility");
  const ref = useRef<HTMLElement>(null);
  const scrollable = useScrollability(ref, "[data-docs-code-viewport]");
  return (
    <CodeBlock
      {...props}
      ref={ref}
      viewportProps={
        {
          "data-docs-code-viewport": "",
          role: scrollable ? "group" : undefined,
          "aria-label": scrollable
            ? typeof props.title === "string"
              ? props.title
              : t("codeBlock")
            : undefined,
          tabIndex: scrollable ? 0 : undefined,
          onKeyDown: scrollRegionByKeyboard,
          className:
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        } as ComponentProps<typeof CodeBlock>["viewportProps"]
      }
    >
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}
