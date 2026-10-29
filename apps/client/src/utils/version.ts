import packageJson from "../../package.json";

/**
 * Get app version
 */
export const getAppVersion = (): string => {
  // Get version from client package.json
  // Using process.env allows access on both server and client
  return process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version;
};

// Ensure it can also be used in server components
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version;
