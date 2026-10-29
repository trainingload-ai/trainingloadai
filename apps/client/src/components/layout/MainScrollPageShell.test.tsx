import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MainScrollPageShell } from "./MainScrollPageShell";

describe("MainScrollPageShell", () => {
  it("keeps long page content in the parent scroll layout flow", () => {
    const { container } = render(
      <MainScrollPageShell>
        <div>content</div>
      </MainScrollPageShell>,
    );

    expect(container.firstElementChild).toHaveClass("shrink-0");
  });
});
