"use client";

import { useSetPageTitle } from "@/hooks/useSetPageTitle";

/** RSC 页面传入已解析的 title 字符串，仅在客户端同步 document.title */
export function AccountPageTitle({ title }: { title: string }) {
  useSetPageTitle(title);
  return null;
}
