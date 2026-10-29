"use client";

// Adapted from AI Elements Reasoning, Apache-2.0. See NOTICE.
// Manual disclosure choices win over automatic streaming transitions. Duration
// is supplied by the producer; mounting historical content must not invent it.
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { BrainIcon, ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const ReasoningContext = createContext<{
  isStreaming: boolean;
  isOpen: boolean;
  duration?: number;
} | null>(null);

export function useReasoning() {
  const context = useContext(ReasoningContext);
  if (!context) throw new Error("Reasoning children require Reasoning");
  return context;
}

export function Reasoning({
  isStreaming = false,
  open,
  defaultOpen,
  onOpenChange,
  duration,
  className,
  children,
  ...props
}: ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  duration?: number;
}) {
  const [userOpen, setUserOpen] = useState<boolean>();
  const isOpen = open ?? userOpen ?? defaultOpen ?? isStreaming;
  const value = useMemo(
    () => ({ isOpen, isStreaming, duration }),
    [isOpen, isStreaming, duration],
  );
  return (
    <ReasoningContext.Provider value={value}>
      <Collapsible
        className={cn("not-prose min-w-0", className)}
        open={isOpen}
        onOpenChange={(next) => {
          setUserOpen(next);
          onOpenChange?.(next);
        }}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

export function ReasoningTrigger({
  className,
  children,
  getThinkingMessage,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
}) {
  const { isStreaming, isOpen, duration } = useReasoning();
  return (
    <CollapsibleTrigger
      className={cn(
        "flex max-w-full items-center gap-2 rounded-sm text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <BrainIcon aria-hidden className="size-4 shrink-0" />
          {getThinkingMessage?.(isStreaming, duration) ?? "Reasoning"}
        </>
      )}
      <ChevronRightIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0 transition-transform motion-reduce:transition-none",
          isOpen && "rotate-90",
        )}
      />
    </CollapsibleTrigger>
  );
}

export function ReasoningContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof CollapsibleContent>, "children"> & {
  children: string;
}) {
  // Public summaries are plain text by contract. Escape markup rather than
  // enabling HTML, external images/links or code rendering for this channel.
  return (
    <CollapsibleContent
      className={cn(
        "mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}
