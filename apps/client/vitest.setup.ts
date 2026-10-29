import "@testing-library/jest-dom/vitest";

// Node.js 25 exposes an incomplete global localStorage unless the process is
// started with --localstorage-file. Vitest runs in jsdom and expects the Web
// Storage contract, so keep tests independent from that Node runtime detail.
const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(String(key));
    },
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
  };
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage(),
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const maxWidth = /max-width:\s*(\d+)px/.exec(query)?.[1];
      const minWidth = /min-width:\s*(\d+)px/.exec(query)?.[1];
      const matchesMax = maxWidth
        ? window.innerWidth <= Number(maxWidth)
        : true;
      const matchesMin = minWidth
        ? window.innerWidth >= Number(minWidth)
        : true;
      return {
        matches: matchesMax && matchesMin,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      };
    },
  });
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => undefined;
}
