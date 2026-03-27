import cron from 'node-cron';
import { sourcesQueries } from '../db/queries.js';
import { collector } from '../services/collector.js';

/**
 * 定时任务管理器
 */
export class CronManager {
  private tasks: cron.ScheduledTask[] = [];
  private isRunning: boolean = false;

  /**
   * 启动定时任务
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Cron] 定时任务已在运行');
      return;
    }

    console.log('[Cron] 启动定时任务...');

    // 每30分钟检查一次需要采集的源
    const collectionTask = cron.schedule('*/30 * * * *', async () => {
      await this.runCollectionJob();
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai'
    });

    this.tasks.push(collectionTask);
    this.isRunning = true;

    console.log('[Cron] 定时任务已启动');
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    console.log('[Cron] 停止定时任务...');

    for (const task of this.tasks) {
      task.stop();
    }

    this.tasks = [];
    this.isRunning = false;

    console.log('[Cron] 定时任务已停止');
  }

  /**
   * 运行采集任务
   */
  private async runCollectionJob(): Promise<void> {
    try {
      console.log('[Cron] 开始采集任务...');

      // 获取需要采集的源
      const sources = await sourcesQueries.getDueForFetch();
      console.log(`[Cron] 本轮待采集: ${sources.length} 个源`);

      if (sources.length === 0) {
        return;
      }

      // 顺序采集（避免并发过多请求）
      for (const source of sources) {
        try {
          console.log(`[Cron] 采集源: ${source.name} (${source.id})`);
          await collector.collectSource(source.id);

          // 采集间隔，避免请求过快
          await this.sleep(1000);
        } catch (error) {
          console.error(`[Cron] 采集源 ${source.id} 失败:`, error);
        }
      }

      console.log('[Cron] 采集任务完成');
    } catch (error) {
      console.error('[Cron] 采集任务异常:', error);
    }
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 默认实例
export const cronManager = new CronManager();
