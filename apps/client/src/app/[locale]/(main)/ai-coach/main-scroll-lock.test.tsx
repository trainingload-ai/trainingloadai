import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiCoachMainScrollLock } from "./main-scroll-lock";

describe("AiCoachMainScrollLock", () => {
  it("locks the main scroll area without adding bottom padding to its parent", () => {
    const mainColumn = document.createElement("div");
    const main = document.createElement("main");
    mainColumn.style.paddingBottom = "4px";
    main.style.overflow = "auto";
    main.style.height = "50px";
    mainColumn.append(main);
    document.body.append(mainColumn);

    const { unmount } = render(
      <AiCoachMainScrollLock>
        <span>Coach</span>
      </AiCoachMainScrollLock>,
    );

    expect(main.style.overflow).toBe("hidden");
    expect(main.style.height).toBe("100%");
    expect(mainColumn.style.paddingBottom).toBe("4px");

    unmount();

    expect(main.style.overflow).toBe("auto");
    expect(main.style.height).toBe("50px");
    expect(mainColumn.style.paddingBottom).toBe("4px");
    mainColumn.remove();
  });
});
