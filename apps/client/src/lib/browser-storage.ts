export function getBrowserLocalStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("localStorage is only available in the browser");
  }

  const storage = window.localStorage;
  if (
    typeof storage?.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    throw new Error("localStorage is not available in this runtime");
  }

  return storage;
}
