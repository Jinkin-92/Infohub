/**
 * Webhook 内容分发服务
 * Phase 4: 采集完成后向外部订阅者推送内容
 */

import { createHmac, randomBytes } from 'node:crypto';
import { sql } from '../db/client.js';

export interface WebhookSubscriber {
  id: number;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: unknown;
}

export interface WebhookDeliveryResult {
  subscriberId: number;
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * 生成随机 HMAC secret
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 计算 HMAC-SHA256 签名
 */
function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class WebhookService {
  /**
   * 通知所有匹配的活跃 webhook 订阅者
   */
  async notify(event: string, data: unknown): Promise<WebhookDeliveryResult[]> {
    const subscribers = await this.getActiveSubscribers(event);
    if (subscribers.length === 0) {
      return [];
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const payloadJson = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscribers.map((sub) => this.deliver(sub, payloadJson))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        subscriberId: subscribers[index].id,
        success: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
  }

  private async getActiveSubscribers(event: string): Promise<WebhookSubscriber[]> {
    const rows = await sql.query<{
      id: number;
      name: string;
      url: string;
      events: string;
      secret: string | null;
      active: number;
    }>(
      'SELECT id, name, url, events, secret, active FROM webhooks WHERE active = 1'
    );

    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        events: JSON.parse(r.events) as string[],
        secret: r.secret ?? undefined,
        active: Boolean(r.active),
      }))
      .filter((sub) => sub.events.includes(event) || sub.events.includes('*'));
  }

  private async deliver(
    subscriber: WebhookSubscriber,
    payloadJson: string
  ): Promise<WebhookDeliveryResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'InfoHub-Webhook/1.0',
      };

      if (subscriber.secret) {
        const signature = signPayload(payloadJson, subscriber.secret);
        headers['X-InfoHub-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(subscriber.url, {
        method: 'POST',
        headers,
        body: payloadJson,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const success = response.ok;

      await sql.execute(
        `UPDATE webhooks SET last_sent_at = datetime('now'), last_error = ? WHERE id = ?`,
        [success ? null : `HTTP ${response.status}`, subscriber.id]
      );

      return {
        subscriberId: subscriber.id,
        success,
        statusCode: response.status,
      };
    } catch (error) {
      clearTimeout(timeout);
      const errorMsg = error instanceof Error ? error.message : String(error);

      await sql.execute(
        `UPDATE webhooks SET last_error = ? WHERE id = ?`,
        [errorMsg, subscriber.id]
      );

      return {
        subscriberId: subscriber.id,
        success: false,
        error: errorMsg,
      };
    }
  }
}

export const webhookService = new WebhookService();
