module.exports = {
  electronDist: process.env.TRAININGLOAD_DESKTOP_ELECTRON_DIST,
  appId: "ai.trainingload.personal",
  productName: "Trainingload.ai",
  directories: {
    app: "build/app",
    output: "build/release",
    buildResources: "assets",
  },
  // Keep the native/WASM runtime and fork entrypoints as real files. ASAR is
  // an archive, not compression; the installer/ZIP still compresses this tree.
  asar: false,
  npmRebuild: true,
  beforeBuild: async ({ platform, arch }) => {
    // Native dependencies and generated Prisma engines were prepared for the
    // host. A cross-target build must prepare its own runtime first.
    if (platform.nodeName !== process.platform || arch !== process.arch) {
      throw new Error(
        "Prepare the desktop runtime on the target platform/architecture",
      );
    }
    // Public hook: dependencies are handled externally. This also prevents
    // the builder from scanning the parent workspace and undoing pruning.
    return false;
  },
  nodeGypRebuild: false,
  files: ["dist/**/*", "assets/**/*", "package.json", "runtime-size.json"],
  // Copy the already-verified production graph verbatim, without the builder's
  // dependency collector expanding it back into the full development tree.
  extraResources: [
    { from: "build/app/node_modules", to: "app/node_modules" },
    { from: "build/app/runtime", to: "app/runtime" },
  ],
  artifactName: "Trainingload.ai-${version}-${os}-${arch}.${ext}",
  mac: {
    identity: null,
    category: "public.app-category.healthcare-fitness",
    icon: "assets/icon.icns",
    target: ["dmg", "zip"],
  },
  win: { target: ["nsis"] },
  linux: { target: ["AppImage"], category: "Sports" },
};
