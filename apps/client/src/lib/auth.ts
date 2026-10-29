import { createAuthClient } from "better-auth/react";
import { deploymentAuthClientPlugins } from "@deployment/auth-client-plugins";
import { getAppConfig } from "./config";

const browserRuntime = typeof window !== "undefined";

export const authClient = createAuthClient({
  // Browser authentication follows the same BFF boundary as every other web
  // API request. The server-side fallback is retained for build/SSR contexts.
  baseURL: browserRuntime ? window.location.origin : getAppConfig().apiBaseUrl,
  basePath: browserRuntime ? "/api/proxy/auth" : "/auth",
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
  plugins: deploymentAuthClientPlugins,
  fetchOptions: {
    credentials: "include",
    headers: {
      "X-Registration-Platform": "WEB",
    },
  },
  // fetchOptions: {
  //   credentials: "include",
  // },
});
