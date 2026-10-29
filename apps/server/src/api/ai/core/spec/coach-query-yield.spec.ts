import { describe, expect, it } from '@jest/globals';
import { mapOpenAIChunkToCoachYields } from '../coach-query-yield';

describe('mapOpenAIChunkToCoachYields', () => {
  it('maps visible content but never maps provider reasoning into a client event', () => {
    expect(
      mapOpenAIChunkToCoachYields({
        choices: [
          {
            delta: {
              reasoning_content: 'private chain of thought',
              content: '用户可见结论',
            },
          },
        ],
      }),
    ).toEqual([
      {
        type: 'stream_event',
        event: { type: 'text_delta', text: '用户可见结论' },
      },
    ]);
  });

  it('emits nothing for a reasoning-only provider chunk', () => {
    expect(
      mapOpenAIChunkToCoachYields({
        choices: [{ delta: { reasoning_content: 'private chain of thought' } }],
      }),
    ).toEqual([]);
  });
});
