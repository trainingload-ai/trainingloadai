import { join, resolve } from "node:path";

/** Keep release data and the generic Electron development identity apart.
 * Changing userData does not rename the OS credential namespace.
 */
export function desktopLaunchProfile(options: {
  packaged: boolean;
  appData: string;
  userData: string;
  customUserData: string;
}) {
  const userData = options.customUserData
    ? resolve(options.customUserData)
    : options.packaged
      ? options.userData
      : join(options.appData, "Trainingload.ai", "development");
  return {
    userData,
    isolated: !options.packaged || Boolean(options.customUserData),
  };
}
