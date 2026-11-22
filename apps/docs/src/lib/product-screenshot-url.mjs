export const PRODUCT_SCREENSHOT_SEARCH = "?v=20261123";

/** @param {string} path */
export function productScreenshotUrl(path) {
  return `${path}${PRODUCT_SCREENSHOT_SEARCH}`;
}
