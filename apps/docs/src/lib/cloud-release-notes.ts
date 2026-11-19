import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { remark } from "remark";
import { plainText } from "./release-note-summary";

type NoteBlock = { paragraph: string } | { bullets: string[] };
type CloudRelease = { date: string; language: string; blocks: NoteBlock[] };

export function parseCloudReleaseNotes(markdown: string, locale: string) {
  const preferredLanguages =
    locale === "zh"
      ? ["zh-Hans", "en"]
      : locale === "zh-hant"
        ? ["zh-Hant", "zh-Hans", "en"]
        : [locale, "en"];
  const entries: { date: string; translations: Map<string, NoteBlock[]> }[] =
    [];
  let currentEntry: (typeof entries)[number] | undefined;
  let currentBlocks: NoteBlock[] | undefined;

  for (const node of remark().parse(markdown).children) {
    if (node.type === "heading" && node.depth <= 3) {
      const heading = plainText(node).trim();
      currentBlocks = undefined;
      if (node.depth === 1) currentEntry = undefined;
      if (node.depth === 2) {
        const time = new Date(heading);
        currentEntry = undefined;
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(heading) &&
          !Number.isNaN(time.getTime()) &&
          time.toISOString().startsWith(heading)
        ) {
          currentEntry = { date: heading, translations: new Map() };
          entries.push(currentEntry);
        }
      }
      if (node.depth === 3 && currentEntry) {
        try {
          const [language] = Intl.getCanonicalLocales(heading);
          currentBlocks = [];
          currentEntry.translations.set(language, currentBlocks);
        } catch {
          continue;
        }
      }
    } else if (node.type === "paragraph") {
      const paragraph = plainText(node).trim();
      if (paragraph) currentBlocks?.push({ paragraph });
    } else if (node.type === "list") {
      const bullets = node.children
        .map((item) =>
          item.children
            .filter((child) => child.type === "paragraph")
            .map(plainText)
            .join(" ")
            .trim(),
        )
        .filter(Boolean);
      if (bullets.length) currentBlocks?.push({ bullets });
    }
  }

  return entries
    .flatMap<CloudRelease>(({ date, translations }) => {
      const language = [...preferredLanguages, ...translations.keys()].find(
        (candidate) => translations.get(candidate)?.length,
      );
      const blocks = language && translations.get(language);
      return language && blocks ? [{ date, language, blocks }] : [];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getCloudReleaseNotes(locale: string) {
  const markdown = await readFile(
    join(process.cwd(), "content/releases/cloud.md"),
    "utf8",
  );
  return parseCloudReleaseNotes(markdown, locale);
}
