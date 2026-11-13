import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";
import { desktopLaunchProfile } from "./launch-profile.js";

test("development cannot inherit a release profile or its data-root preference", () => {
  const appData = resolve("test-app-data");
  const options = {
    appData,
    userData: join(appData, "Electron"),
    customUserData: "",
  };
  const development = desktopLaunchProfile({ ...options, packaged: false });
  const release = desktopLaunchProfile({
    ...options,
    packaged: true,
    userData: join(appData, "Trainingload.ai"),
  });
  assert.equal(
    development.userData,
    join(appData, "Trainingload.ai", "development"),
  );
  assert.equal(development.isolated, true);
  assert.equal(release.userData, join(appData, "Trainingload.ai"));
  assert.equal(release.isolated, false);
  assert.notEqual(development.userData, release.userData);
});

test("an explicit profile keeps its own data in both development and release", () => {
  for (const packaged of [false, true]) {
    const profile = desktopLaunchProfile({
      packaged,
      appData: resolve("app-data"),
      userData: resolve("default"),
      customUserData: "isolated-profile",
    });
    assert.deepEqual(profile, {
      userData: resolve("isolated-profile"),
      isolated: true,
    });
  }
});
