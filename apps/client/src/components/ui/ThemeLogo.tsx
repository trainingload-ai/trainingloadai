"use client";

import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";

interface ThemeLogoProps {
  width?: number;
  height?: number;
  alt?: string;
}

export default function ThemeLogo({
  width = 150,
  height,
  alt = "Trainingload.ai",
}: ThemeLogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const resolvedHeight = height ?? Math.max(1, Math.round(width * 0.183));

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Show default logo during SSR
    return (
      <Image
        src="/LOGO_DARK.svg"
        alt={alt}
        width={width}
        height={resolvedHeight}
        style={{ width, height: resolvedHeight }}
      />
    );
  }

  // Determine actual theme used
  const currentTheme = theme === "system" ? systemTheme : theme;

  // Select logo based on theme
  const logoSrc =
    currentTheme === "dark" ? "/LOGO_LIGHT.svg" : "/LOGO_DARK.svg";

  return (
    <Image
      src={logoSrc}
      alt={alt}
      width={width}
      height={resolvedHeight}
      style={{ width, height: resolvedHeight }}
      className="transition-opacity duration-200"
    />
  );
}
