import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nModule, I18nService } from 'nestjs-i18n';
import { join } from 'path';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { fitnessConfirmationQuestion } from '@/api/ai/fitness-assessment-confirmation';
import { parseAskUserQuestionData } from '@shared/ai-coach-schema';

describe('fitness notification message catalogs', () => {
  let module: TestingModule;
  let i18n: I18nService;
  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'en',
          loaderOptions: {
            path: join(__dirname, '../../../../../packages/messages/server'),
            watch: false,
          },
        }),
      ],
    }).compile();
    await module.init();
    i18n = module.get(I18nService);
  });
  afterAll(async () => {
    await module?.close();
  });
  it.each([
    ['zh-CN', '体能评估有新进展', '记录的数据质量、有效覆盖或拟合检查未通过。'],
    ['zh-TW', '體能評估有新進展', '記錄的數據質量、有效覆蓋或擬合檢查未通過。'],
    [
      'en',
      'Fitness assessment update',
      'Data quality, coverage or fit checks did not pass.',
    ],
    [
      'de',
      'Fitness assessment update',
      'Data quality, coverage or fit checks did not pass.',
    ],
  ])(
    'resolves stored locale %s through the normal catalog and fallback chain',
    (raw, title, reason) => {
      const lang = resolveSupportedLocale(raw);
      expect(i18n.t('fitnessAssessment.notification.title', { lang })).toBe(
        title,
      );
      expect(
        i18n.t('fitnessAssessment.reasons.QUALITY_REJECTED', { lang }),
      ).toBe(reason);
    },
  );
  it.each([
    ['zh-CN', '跑步', '确认采用'],
    ['zh-TW', '跑步', '確認採用'],
    ['en', 'running', 'Confirm adoption'],
    ['de', 'running', 'Confirm adoption'],
  ])('renders the exact confirmation proposal in %s', (lang, sport, label) => {
    const question = fitnessConfirmationQuestion({
      calculationId: 'calculation',
      lang,
      i18n,
      option: {
        id: 'target',
        sport: 'RUN',
        effectiveDate: '2026-09-27',
        changes: [
          {
            metric: 'LTHR',
            value: 165,
            unit: 'bpm',
            currentValue: null,
            delta: null,
          },
        ],
        proposalDigest: 'digest',
        expiresAt: '2026-09-28T00:00:00.000Z',
      },
    });
    expect(parseAskUserQuestionData(question).ok).toBe(true);
    expect(question.questions[0].question).toContain(sport);
    expect(question.questions[0].question).toContain('LTHR: 165 bpm');
    expect(question.questions[0].question).toContain('2026-09-27');
    expect(question.questions[0].options[0].label).toBe(label);
    expect(JSON.stringify(question)).not.toContain(
      'fitnessAssessment.confirmation.',
    );
  });
});
