import { ProviderWebEvidenceAdapter } from './provider-web-evidence.adapter';
import type { DeepSeekWebEvidenceAdapter } from './deepseek-web-evidence.adapter';

describe('ProviderWebEvidenceAdapter capabilities', () => {
  const original = process.env;
  const deepseek = {} as DeepSeekWebEvidenceAdapter;

  afterEach(() => {
    process.env = original;
  });

  function adapter(env: NodeJS.ProcessEnv) {
    process.env = { ...original, ...env };
    return new ProviderWebEvidenceAdapter(deepseek);
  }

  it('keeps self-host web access disabled until the owner enables it', () => {
    const gateway = adapter({
      SELF_HOST_MODE: 'core-local',
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'secret',
      AI_WEB_SEARCH_ENABLED: 'false',
    });

    expect(gateway.capabilities()).toEqual({ search: false, fetch: false });
  });

  it.each(['openai', 'openrouter', 'dashscope', 'gemini', 'xai'])(
    'exposes native search without arbitrary page fetch for %s',
    (provider) => {
      const prefix =
        provider === 'dashscope' ? 'DASHSCOPE' : provider.toUpperCase();
      const gateway = adapter({
        SELF_HOST_MODE: 'core-local',
        AI_PROVIDER: provider,
        [`${prefix}_API_KEY`]: 'secret',
        AI_WEB_SEARCH_ENABLED: 'true',
      });

      expect(gateway.capabilities()).toEqual({ search: true, fetch: false });
    },
  );

  it('keeps DeepSeek search and fetch together', () => {
    const gateway = adapter({
      SELF_HOST_MODE: 'core-local',
      AI_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'secret',
      AI_WEB_SEARCH_ENABLED: 'true',
    });

    expect(gateway.capabilities()).toEqual({ search: true, fetch: true });
  });

  it.each(['ollama', 'custom-openai-compatible'])(
    'does not claim controlled web search for %s',
    (provider) => {
      const gateway = adapter({
        SELF_HOST_MODE: 'core-local',
        AI_PROVIDER: provider,
        AI_API_KEY: 'secret',
        AI_WEB_SEARCH_ENABLED: 'true',
      });

      expect(gateway.capabilities()).toEqual({ search: false, fetch: false });
    },
  );
});
