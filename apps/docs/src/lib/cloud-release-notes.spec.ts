import { describe, expect, it } from "vitest";
import {
  getCloudReleaseNotes,
  parseCloudReleaseNotes,
} from "./cloud-release-notes";

const markdown = `
# Cloud release notes

## 2026-11-18

### Update details

- Not a translation.

### zh-Hans

- 显示新的训练记录。

## 2026-11-19

### en

The latest changes are live.

- Show the **training plan**.

  Find it in the calendar.

- Improve tomorrow’s recommendations.

### zh-Hans

- 显示训练计划。

## 2026-11-19

### en

- Improve filtering.

## 2026-11-31

### en

- Invalid date.
`;

describe("cloud release notes", () => {
  it("shows the newest valid dates first and preserves same-day release order", () => {
    const releases = parseCloudReleaseNotes(markdown, "en");
    expect(releases.map(({ date }) => date)).toEqual([
      "2026-11-19",
      "2026-11-19",
      "2026-11-18",
    ]);
    expect(releases[0]?.blocks).toEqual([
      { paragraph: "The latest changes are live." },
      {
        bullets: [
          "Show the training plan. Find it in the calendar.",
          "Improve tomorrow’s recommendations.",
        ],
      },
    ]);
    expect(releases[1]?.blocks).toEqual([{ bullets: ["Improve filtering."] }]);
  });

  it("selects the closest available translation for each release", () => {
    expect(
      parseCloudReleaseNotes(markdown, "zh-hant").map(
        ({ language }) => language,
      ),
    ).toEqual(["zh-Hans", "en", "zh-Hans"]);
    expect(
      parseCloudReleaseNotes(markdown, "ja").map(({ language }) => language),
    ).toEqual(["en", "en", "zh-Hans"]);
  });

  it("loads notes from the maintained Markdown file", async () => {
    const notes = await getCloudReleaseNotes("zh");
    expect(
      notes.some(
        ({ language, blocks }) => language === "zh-Hans" && blocks.length > 0,
      ),
    ).toBe(true);
  });
});
