import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

export function inlineLocaleCopyLocations(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const localeExpression = /\b(?:[a-z]*locale|[a-z]*language|lang|zh|isZh|isChinese)\b/i;
  const locations = [];
  function literals(expression) {
    const values = [];
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) {
        const value = node.text.trim();
        if (!/^(\/|https?:|[A-Z_]+$)/.test(value)) values.push(value);
      }
      ts.forEachChild(node, visit);
    }
    visit(expression);
    return values;
  }
  function compare(node) {
    if (ts.isConditionalExpression(node) && localeExpression.test(node.condition.getText(source))) {
      const left = literals(node.whenTrue);
      const right = literals(node.whenFalse);
      const userCopy = (values) => values.some((value) =>
        /\p{Script=Han}{2,}/u.test(value) ||
        (/[a-z]{4}/i.test(value) && !/^(?:[a-z]{2,3}(?:-[a-z0-9]+)*|yyyy|dddd|short|long)$/i.test(value)),
      );
      if (userCopy(left) && userCopy(right)) {
        locations.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
    }
    ts.forEachChild(node, compare);
  }
  compare(source);
  return locations;
}

const fixture = [
  "locale === 'zh' ? '同步课表' : 'Sync workout';",
  "isZh ? { title: '训练历史' } : { title: 'Training history' };",
  "lang === 'zh' ? Intl.DateTimeFormat('zh-CN') : Intl.DateTimeFormat('en-US');",
  "locale === 'zh' ? dayjs.locale('zh-cn') : dayjs.locale('en');",
  "locale === 'zh' ? '/zh/docs' : '/docs';",
  "locale === 'zh' ? 'zh-hant' : 'en';",
  "locale === 'fr' ? 'Synchroniser' : 'Sync workout';",
  "isZh ? <span>训练历史</span> : <span>Training history</span>;",
].join('\n');
assert.deepEqual(inlineLocaleCopyLocations(fixture, 'locale-examples.tsx'), [1, 2, 7, 8]);

export async function checkLocalizedCopy(root, paths) {
  for (const file of paths) {
    const source = await readFile(resolve(root, file), 'utf8');
    const lines = inlineLocaleCopyLocations(source, file);
    if (lines.length) throw new Error(`Inline locale-dependent copy in ${file}:${lines.join(',')}`);
  }
}
