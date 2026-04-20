import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDueForFetch: vi.fn(),
  collectSource: vi.fn(),
  ensureRsshubRunning: vi.fn(),
}));

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    getDueForFetch: mocks.getDueForFetch,
  },
}));

vi.mock('../src/services/collector.js', () => ({
  collector: {
    collectSource: mocks.collectSource,
  },
}));

vi.mock('../src/services/localIntegrations.js', () => ({
  localIntegrationsService: {
    ensureRsshubRunning: mocks.ensureRsshubRunning,
  },
}));

describe('cron manager manual collection', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());
    mocks.ensureRsshubRunning.mockResolvedValue(undefined);
  });

  it('collects sources with bounded concurrency and counts success:false as failures', async () => {
    const dueSources = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      last_fetched_at: null,
      fetch_interval_min: 60,
    }));
    mocks.getDueForFetch.mockResolvedValue(dueSources);

    let inFlight = 0;
    let maxInFlight = 0;
    mocks.collectSource.mockImplementation(async (sourceId: number) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;

      return {
        sourceId,
        success: sourceId % 3 !== 0,
        itemCount: sourceId % 3 !== 0 ? 1 : 0,
      };
    });

    const { CronManager } = await import('../src/services/cron.js');
    const manager = new CronManager();
    const result = await manager.runManualCollection(true);

    expect(mocks.ensureRsshubRunning).toHaveBeenCalledTimes(1);
    expect(mocks.collectSource).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(result).toEqual({
      totalSources: 6,
      succeeded: 4,
      failed: 2,
    });
    expect(manager.getStatus().lastError).toBe('2 sources failed during the last refresh');
  });
});
