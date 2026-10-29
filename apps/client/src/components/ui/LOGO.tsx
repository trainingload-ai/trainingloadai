"use client";

// import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";

interface LOGOProps {
  width?: number;
  height?: number;
  alt?: string;
}

export default function LOGO({
  width = 10,
  height,
  alt = "Trainingload.ai",
}: LOGOProps) {
  // const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Show default logo during SSR
    return <Image src="/LOGO.png" alt={alt} width={width} height={height} />;
  }

  // Determine actual theme used
  // const currentTheme = theme === "system" ? systemTheme : theme;

  return (
    <Image
      src={"/LOGO.png"}
      alt={alt}
      width={width}
      height={height}
      className="transition-opacity duration-200"
    />
  );
}
