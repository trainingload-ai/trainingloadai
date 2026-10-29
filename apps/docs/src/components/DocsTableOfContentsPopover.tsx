import { ChevronDown, List } from "lucide-react";
import { PageTOCPopoverItems } from "fumadocs-ui/layouts/docs/page";

export function DocsTableOfContentsPopover({ title }: { title: string }) {
  return (
    <details
      id="nd-tocnav"
      className="group fixed inset-x-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm xl:hidden md:start-[calc(var(--fd-sidebar-width)+var(--fd-layout-offset))]"
      style={{ top: "calc(var(--fd-banner-height) + var(--fd-nav-height))" }}
    >
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2.5 px-4 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-6 [&::-webkit-details-marker]:hidden">
        <List aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="max-h-[50vh] overflow-y-auto border-t border-border px-4 pb-4 md:px-6">
        <PageTOCPopoverItems />
      </div>
    </details>
  );
}
