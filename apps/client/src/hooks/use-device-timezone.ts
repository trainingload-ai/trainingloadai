"use client";

import { useEffect, useState } from "react";

export function detectDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "";
  } catch {
    return "";
  }
}

/** 挂载后读取浏览器 IANA 时区；null 表示尚未完成客户端检测。 */
export function useDeviceTimezone(): string | null {
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    setTimezone(detectDeviceTimezone());
  }, []);

  return timezone;
}
