// Run independently of stylesheets and hydration to select one critical image.
(() => {
  const script = document.currentScript;
  let theme;
  try {
    theme = localStorage.getItem("theme");
  } catch {
    // Storage can be unavailable in restricted browsing contexts.
  }
  const dark =
    theme === "dark" ||
    (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const mobile = matchMedia("(max-width: 639px)").matches;
  const source =
    script.dataset[
      `${mobile ? "mobile" : "desktop"}${dark ? "Dark" : "Light"}`
    ];
  if (!source) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.fetchPriority = "high";
  link.imageSrcset = source;
  link.href = source.split(", ")[0].split(" ")[0];
  document.head.append(link);
})();
