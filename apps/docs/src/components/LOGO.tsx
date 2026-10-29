"use client";

import Image from "next/image";

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
