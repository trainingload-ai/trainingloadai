const base = require("./electron-builder.config.cjs");
const identity = process.env.TRAININGLOAD_MAC_SIGNING_IDENTITY;
if (!/^[A-Fa-f0-9]{40}$/.test(identity || ""))
  throw new Error(
    "Use dist:mac:signed with a validated Developer ID Application identity",
  );

module.exports = {
  ...base,
  forceCodeSigning: true,
  directories: { ...base.directories, output: "build/release-signed" },
  mac: {
    ...base.mac,
    identity,
    type: "distribution",
    hardenedRuntime: true,
    entitlements: "assets/entitlements.mac.plist",
    entitlementsInherit: "assets/entitlements.mac.plist",
    // release-macos.mjs submits, staples and verifies both app and DMG before
    // exposing final artifacts. Missing credentials are a preflight failure.
    notarize: false,
  },
};
