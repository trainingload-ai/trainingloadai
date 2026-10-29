import { useEffect } from "react";

export const useSetPageTitle = (title: string) => {
  useEffect(() => {
    const appName = "Trainingload.ai";
    const pageTitle = title.trim();

    if (!pageTitle) {
      document.title = appName;
      return;
    }

    if (/^Trainingload(?:\.ai)?\b/i.test(pageTitle)) {
      document.title = pageTitle;
      return;
    }

    document.title = `${appName} | ${pageTitle}`;
  }, [title]);
};
