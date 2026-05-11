import { sourcesQueries, collectionJobsQueries } from '../db/queries.js';
import { collector } from '../services/collector.js';
import { localIntegrationsService } from './localIntegrations.js';

export type ManualCollectionSummary = {
  totalSources: number;
  succeeded: number;
  failed: number;
};

export type ManualCollectionStartResult = {
  started: boolean;
  alreadyRunning: boolean;
};

export class CronManager {
  private isCollecting = false;
  private lastRunAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;
  private static readonly rsshubHealthRestartError = 'RSSHub local service did not become healthy after restart';
  private readonly minRefreshIntervalMs = 5 * 60 * 1000;
  private readonly maxConcurrentCollections = 4;

  start(): void {
    console.log('[Cron] Automatic collection disabled; collections now run on explicit user refresh');
  }

  stop(): void {
    console.log('[Cron] Manual collection manager stopped');
  }

  getStatus(): {
    enabled: boolean;
    isCollecting: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  } {
    return {
      enabled: false,
      isCollecting: this.isCollecting,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  clearRecoveredIntegrationError(): void {
    if (this.lastError === CronManager.rsshubHealthRestartError) {
      this.lastError = null;
    }
  }

  async startManualCollection(force = true): Promise<ManualCollectionStartResult> {
    if (this.isCollecting) {
      return {
        started: false,
        alreadyRunning: true,
      };
    }

    void this.runManualCollection(force).catch((error) => {
      console.error('[Cron] Background collection run crashed:', error);
    });

    return {
      started: true,
      alreadyRunning: false,
    };
  }

  async runManualCollection(force = true): Promise<ManualCollectionSummary> {
    if (this.isCollecting) {
      throw new Error('A collection run is already in progress');
    }

    this.isCollecting = true;
    this.lastRunAt = new Date().toISOString();

    try {
      await localIntegrationsService.ensureRsshubRunning();
      this.clearRecoveredIntegrationError();

      const sources = await sourcesQueries.getDueForFetch();
      const dueSources = sources.filter((source) => force || this.isSourceDue(source.last_fetched_at, source.fetch_interval_min));
      let succeeded = 0;
      let failed = 0;

      // 为每个待采集源创建 job 记录
      const jobMap = new Map<number, number>();
      for (const source of dueSources) {
        try {
          const job = await collectionJobsQueries.create({
            source_id: source.id,
            status: 'pending',
            scheduled_at: new Date().toISOString(),
          });
          jobMap.set(source.id, job.id);
        } catch (err) {
          console.warn(`[Cron] Failed to create job for source ${source.id}:`, err);
        }
      }

      const workerCount = Math.max(1, Math.min(this.maxConcurrentCollections, dueSources.length));
      let nextIndex = 0;

      const runNext = async (): Promise<void> => {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= dueSources.length) {
          return;
        }

        const source = dueSources[currentIndex];
        const jobId = jobMap.get(source.id);

        // 标记 job 为 running
        if (jobId) {
          try {
            await collectionJobsQueries.start(jobId);
          } catch (err) {
            console.warn(`[Cron] Failed to start job ${jobId}:`, err);
          }
        }

        try {
          const result = await collector.collectSource(source.id, { force });
          if (result.success) {
            succeeded += 1;
            if (jobId) {
              await collectionJobsQueries.succeed(jobId, result.itemCount);
            }
          } else {
            failed += 1;
            if (jobId) {
              const errorMsg = result.error ?? 'Collection failed without error message';
              const nextRetry = this.calculateNextRetry(1);
              await collectionJobsQueries.fail(jobId, errorMsg, nextRetry);
            }
          }
        } catch (error) {
          failed += 1;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[Cron] Failed to collect source ${source.id}:`, errorMsg);
          if (jobId) {
            const nextRetry = this.calculateNextRetry(1);
            await collectionJobsQueries.fail(jobId, errorMsg, nextRetry);
          }
        }

        await runNext();
      };

      await Promise.all(Array.from({ length: workerCount }, () => runNext()));

      this.lastError = failed > 0 ? `${failed} sources failed during the last refresh` : null;
      this.lastSuccessAt = new Date().toISOString();

      return {
        totalSources: dueSources.length,
        succeeded,
        failed,
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * 重试失败的采集任务（指数退避）
   */
  async retryFailedJobs(): Promise<{ retried: number; succeeded: number; failed: number }> {
    const pendingJobs = await collectionJobsQueries.getFailedPending(50);
    let retried = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      retried++;
      try {
        await collectionJobsQueries.start(job.id);
        const result = await collector.collectSource(job.source_id, { force: true });
        if (result.success) {
          await collectionJobsQueries.succeed(job.id, result.itemCount);
          succeeded++;
        } else {
          const nextRetry = this.calculateNextRetry(job.attempts + 1);
          await collectionJobsQueries.fail(job.id, result.error ?? 'Retry failed', nextRetry);
          failed++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const nextRetry = this.calculateNextRetry(job.attempts + 1);
        await collectionJobsQueries.fail(job.id, errorMsg, nextRetry);
        failed++;
      }
    }

    return { retried, succeeded, failed };
  }

  private calculateNextRetry(attempts: number): string {
    // 指数退避: 1min, 2min, 4min, 8min... 上限 1小时
    const delayMs = Math.min(60000 * Math.pow(2, attempts - 1), 3600000);
    return new Date(Date.now() + delayMs).toISOString();
  }

  private isSourceDue(lastFetchedAt: string | null, fetchIntervalMinutes: number): boolean {
    if (!lastFetchedAt) {
      return true;
    }

    const lastFetched = new Date(lastFetchedAt);
    if (Number.isNaN(lastFetched.getTime())) {
      return true;
    }

    const intervalMs = Math.max(fetchIntervalMinutes, 5) * 60 * 1000;
    const ageMs = Date.now() - lastFetched.getTime();
    return ageMs >= Math.max(intervalMs, this.minRefreshIntervalMs);
  }
}

export const cronManager = new CronManager();
