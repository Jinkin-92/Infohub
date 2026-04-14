import { sourcesQueries } from '../db/queries.js';
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
  private readonly minRefreshIntervalMs = 5 * 60 * 1000;

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

      const sources = await sourcesQueries.getDueForFetch();
      const dueSources = sources.filter((source) => force || this.isSourceDue(source.last_fetched_at, source.fetch_interval_min));
      let succeeded = 0;
      let failed = 0;

      for (const source of dueSources) {
        try {
          await collector.collectSource(source.id, { force });
          succeeded += 1;
        } catch (error) {
          failed += 1;
          console.error(`[Cron] Failed to collect source ${source.id}:`, error);
        }
      }

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
