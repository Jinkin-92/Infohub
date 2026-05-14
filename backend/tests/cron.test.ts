import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDueForFetch: vi.fn(),
  getAll: vi.fn(),
  collectSource: vi.fn(),
  ensureRsshubRunning: vi.fn(),
  jobCreate: vi.fn(),
  jobStart: vi.fn(),
  jobSucceed: vi.fn(),
  jobFail: vi.fn(),
}));

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    getDueForFetch: mocks.getDueForFetch,
    getAll: mocks.getAll,
  },
  collectionJobsQueries: {
    create: mocks.jobCreate,
    start: mocks.jobStart,
    succeed: mocks.jobSucceed,
    fail: mocks.jobFail,
    getFailedPending: vi.fn(),
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
    mocks.jobCreate.mockImplementation(async (input: { source_id: number }) => ({
      id: input.source_id * 1000,
    }));
    mocks.jobStart.mockResolvedValue(undefined);
    mocks.jobSucceed.mockResolvedValue(undefined);
    mocks.jobFail.mockResolvedValue(undefined);
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

  it('clearStaleLastError clears generic failure message when no sources are in error state', async () => {
    const { CronManager } = await import('../src/services/cron.js');
    const manager = new CronManager();

    // Simulate a failed run
    mocks.getDueForFetch.mockResolvedValue([{ id: 1, last_fetched_at: null, fetch_interval_min: 60 }]);
    mocks.collectSource.mockResolvedValue({ sourceId: 1, success: false, itemCount: 0 });
    await manager.runManualCollection(true);
    expect(manager.getStatus().lastError).toBe('1 sources failed during the last refresh');

    // All sources recovered
    mocks.getAll.mockResolvedValue([{ status: 'active' }]);
    await manager.clearStaleLastError();

    expect(manager.getStatus().lastError).toBeNull();
  });

  it('clearStaleLastError keeps lastError when sources are still in error state', async () => {
    const { CronManager } = await import('../src/services/cron.js');
    const manager = new CronManager();

    mocks.getDueForFetch.mockResolvedValue([{ id: 1, last_fetched_at: null, fetch_interval_min: 60 }]);
    mocks.collectSource.mockResolvedValue({ sourceId: 1, success: false, itemCount: 0 });
    await manager.runManualCollection(true);

    mocks.getAll.mockResolvedValue([{ status: 'error' }]);
    await manager.clearStaleLastError();

    expect(manager.getStatus().lastError).toBe('1 sources failed during the last refresh');
  });

  it('clearLastError unconditionally clears the lastError', async () => {
    const { CronManager } = await import('../src/services/cron.js');
    const manager = new CronManager();

    mocks.getDueForFetch.mockResolvedValue([{ id: 1, last_fetched_at: null, fetch_interval_min: 60 }]);
    mocks.collectSource.mockResolvedValue({ sourceId: 1, success: false, itemCount: 0 });
    await manager.runManualCollection(true);
    expect(manager.getStatus().lastError).not.toBeNull();

    manager.clearLastError();
    expect(manager.getStatus().lastError).toBeNull();
  });
});
