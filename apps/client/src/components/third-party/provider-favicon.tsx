import Image from "next/image";
import { cn } from "@/lib/utils";
import { THIRD_PARTY_PROVIDER_BRANDS } from "@deployment/provider-presentation";

export { THIRD_PARTY_PROVIDER_BRANDS };

export type ThirdPartyProviderBrand = keyof typeof THIRD_PARTY_PROVIDER_BRANDS;

export function isThirdPartyProviderBrand(
  provider: string,
): provider is ThirdPartyProviderBrand {
  return provider in THIRD_PARTY_PROVIDER_BRANDS;
}

export function thirdPartyProviderName(provider: ThirdPartyProviderBrand) {
  return THIRD_PARTY_PROVIDER_BRANDS[provider].name;
}

export function ProviderFavicon({
  provider,
  className,
}: {
  provider: ThirdPartyProviderBrand;
  className?: string;
}) {
  const brand = THIRD_PARTY_PROVIDER_BRANDS[provider];

  return (
    <Image
      src={brand.favicon}
      alt=""
      width={16}
      height={16}
      unoptimized
      aria-hidden
      className={cn("block shrink-0 object-contain", className)}
    />
  );
}
