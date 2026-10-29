import { useRuntimeCapabilities } from "@/api/runtime-capabilities";
import { useSelfHostAiConfiguration } from "@/api/self-host-ai-configuration";
import { ApiFetchError } from "@/lib/api";

export function useSelfHostAiAccess() {
  const capabilities = useRuntimeCapabilities();
  const isSelfHost =
    capabilities.data?.deployment === "self-host" ||
    Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE);
  const configuration = useSelfHostAiConfiguration(isSelfHost);
  const accessDenied =
    configuration.error instanceof ApiFetchError &&
    [403, 404].includes(configuration.error.status);
  const configuredProvider = configuration.data?.provider;
  const isEnabled = Boolean(
    isSelfHost &&
    capabilities.data?.capabilities.ai.state === "enabled" &&
    configuredProvider &&
    configuredProvider !== "none" &&
    configuration.data?.apiKeyConfigured,
  );

  return {
    configuration,
    isEnabled,
    isSelfHost,
    isOwner: isSelfHost && !accessDenied,
    isResolving:
      capabilities.isLoading || (isSelfHost && configuration.isLoading),
  };
}
