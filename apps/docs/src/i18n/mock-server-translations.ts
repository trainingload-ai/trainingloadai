import { createTranslator } from "next-intl";
import { vi } from "vitest";

vi.mock("next-intl/server", () => {
  const configs = new Map<
    string,
    ReturnType<typeof import("./request")["default"]>
  >();

  return {
    getRequestConfig: (
      configure: Parameters<typeof import("next-intl/server")["getRequestConfig"]>[0],
    ) => configure,
    async getTranslations({
      locale,
      namespace,
    }: {
      locale: string;
      namespace: string;
    }) {
      let config = configs.get(locale);
      if (!config) {
        const { default: request } = await import("./request");
        config = request({ locale, requestLocale: Promise.resolve(locale) });
        configs.set(locale, config);
      }
      const { messages, locale: resolvedLocale } = await config;
      return createTranslator({
        locale: resolvedLocale,
        messages: messages ?? undefined,
        namespace,
      });
    },
  };
});
