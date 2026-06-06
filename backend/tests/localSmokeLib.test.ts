import { describe, expect, it } from 'vitest';
import { parseArgs, selectTargetSource } from '../../scripts/local-smoke-lib.mjs';

describe('local smoke helpers', () => {
  it('parses deep mode and source id arguments', () => {
    expect(parseArgs(['--deep', '--source-id', '35'])).toEqual({
      deep: true,
      sourceId: 35,
    });
  });

  it('falls back to the first enabled source when the requested source is missing', () => {
    const result = selectTargetSource(
      [
        { id: 10, enabled: false },
        { id: 20, enabled: 1 },
      ],
      35
    );

    expect(result.explicitSource).toBeUndefined();
    expect(result.fallbackUsed).toBe(true);
    expect(result.targetSource).toEqual({ id: 20, enabled: 1 });
  });
});
