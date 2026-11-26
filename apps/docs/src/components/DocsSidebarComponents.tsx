"use client";

import type * as PageTree from "fumadocs-core/page-tree";
import {
  LanguageToggle,
  LanguageToggleText,
} from "fumadocs-ui/components/layout/language-toggle";
import {
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem,
  type SidebarComponents,
} from "fumadocs-ui/components/layout/sidebar";
import { ChevronDown, ChevronRight, ExternalLink, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const inactiveItemClass = [
  "relative flex min-h-9 flex-row items-center gap-2 rounded-control px-3 py-2",
  "ps-(--sidebar-item-offset) text-start text-muted-foreground",
  "[overflow-wrap:anywhere] [&_svg]:size-4 [&_svg]:shrink-0",
  "text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
].join(" ");

function useMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function isCurrentPath(url: string, pathname: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

function folderContainsPath(folder: PageTree.Folder, pathname: string): boolean {
  if (folder.index && isCurrentPath(folder.index.url, pathname)) return true;

  return folder.children.some((child) => {
    if (child.type === "page") return isCurrentPath(child.url, pathname);
    if (child.type === "folder") return folderContainsPath(child, pathname);
    return false;
  });
}

function StaticSidebarLink({
  href,
  icon,
  external,
  children,
  folder,
}: {
  href: string;
  icon?: ReactNode;
  external?: boolean;
  children: ReactNode;
  folder?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${inactiveItemClass} ${folder ? "w-full" : ""}`}
    >
      {icon ?? (external ? <ExternalLink aria-hidden="true" /> : null)}
      {children}
      {folder ? (
        <ChevronRight aria-hidden="true" className="ml-auto" />
      ) : null}
    </Link>
  );
}

function DocsSidebarItem({ item }: { item: PageTree.Item }) {
  const mounted = useMounted();

  if (!mounted) {
    return (
      <StaticSidebarLink
        href={item.url}
        icon={item.icon}
        external={item.external}
      >
        {item.name}
      </StaticSidebarLink>
    );
  }

  return (
    <SidebarItem
      href={item.url}
      external={item.external}
      icon={item.icon}
      className="min-h-9 rounded-control px-3 py-2 text-sm font-medium data-[active=true]:bg-brand data-[active=true]:text-brand-foreground"
    >
      {item.name}
    </SidebarItem>
  );
}

function DocsSidebarFolder({
  item,
  children,
}: {
  item: PageTree.Folder;
  level: number;
  children: ReactNode;
}) {
  const mounted = useMounted();
  const pathname = usePathname();
  const open = Boolean(item.defaultOpen) || (mounted && folderContainsPath(item, pathname));

  return (
    <SidebarFolder defaultOpen={open}>
      {item.index ? (
        mounted ? (
          <SidebarFolderLink
            href={item.index.url}
            external={item.index.external}
          >
            {item.icon}
            {item.name}
          </SidebarFolderLink>
        ) : (
          <StaticSidebarLink
            href={item.index.url}
            icon={item.icon}
            external={item.index.external}
            folder
          >
            {item.name}
          </StaticSidebarLink>
        )
      ) : (
        <SidebarFolderTrigger>
          {item.icon}
          {item.name}
        </SidebarFolderTrigger>
      )}
      <SidebarFolderContent>{children}</SidebarFolderContent>
    </SidebarFolder>
  );
}

export const docsSidebarComponents: Partial<SidebarComponents> = {
  Item: DocsSidebarItem,
  Folder: DocsSidebarFolder,
};

export function DocsSidebarFooter() {
  const t = useTranslations("header");

  return (
    <div data-docs-sidebar-footer className="flex items-center gap-1.5">
      <LanguageToggle className="h-9 min-w-0 gap-2 rounded-control! px-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary data-[state=open]:text-foreground">
        <Languages aria-hidden="true" className="size-4 shrink-0" />
        <LanguageToggleText className="truncate text-xs font-medium" />
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
      </LanguageToggle>
      <ThemeSwitcher groupLabel={t("theme")} />
    </div>
  );
}
