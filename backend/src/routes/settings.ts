import { Hono } from 'hono';
import { z } from 'zod';
import { getValidatedBody, validateBody } from '../middleware/validation.js';
import { localIntegrationsService } from '../services/localIntegrations.js';
import { cronManager } from '../services/cron.js';
import { userSettingsQueries, type UpdateUserSettingsInput } from '../db/queries.js';

const settingsRouter = new Hono();

const saveIntegrationsSchema = z.object({
  values: z.record(z.string()),
});

const updateDisplaySettingsSchema = z.object({
  font_size: z.enum(['small', 'medium', 'large']).optional(),
  card_density: z.enum(['compact', 'normal', 'spacious']).optional(),
  line_spacing: z.enum(['tight', 'normal', 'relaxed']).optional(),
});

settingsRouter.get('/integrations', async (c) => {
  const rsshub = await localIntegrationsService.getRsshubSettings();
  if (rsshub.running) {
    cronManager.clearRecoveredIntegrationError();
  }
  await cronManager.clearStaleLastError();
  return c.json({
    ok: true,
    rsshub,
    scheduler: cronManager.getStatus(),
  });
});

settingsRouter.post('/integrations', validateBody(saveIntegrationsSchema), async (c) => {
  const { values } = getValidatedBody<z.infer<typeof saveIntegrationsSchema>>(c);
  const rsshub = await localIntegrationsService.saveRsshubSettings(values);

  return c.json({
    ok: true,
    rsshub,
    scheduler: cronManager.getStatus(),
    message: 'RSSHub local settings saved and restarted',
  });
});

settingsRouter.post('/integrations/restart', async (c) => {
  await localIntegrationsService.restartRsshub();
  const rsshub = await localIntegrationsService.getRsshubSettings();
  if (rsshub.running) {
    cronManager.clearRecoveredIntegrationError();
  }
  await cronManager.clearStaleLastError();

  return c.json({
    ok: true,
    rsshub,
    scheduler: cronManager.getStatus(),
    message: 'Collector services restarted',
  });
});

// Repair endpoint - restarts RSSHub and clears stale errors
settingsRouter.post('/repair', async (c) => {
  let rsshubRestarted = false;
  const rsshubBefore = await localIntegrationsService.getRsshubSettings();

  if (!rsshubBefore.running) {
    try {
      await localIntegrationsService.restartRsshub();
      rsshubRestarted = true;
    } catch (err) {
      console.error('[Settings/Repair] Failed to restart RSSHub:', err);
    }
  }

  cronManager.clearLastError();
  await cronManager.clearStaleLastError();

  const rsshub = await localIntegrationsService.getRsshubSettings();

  return c.json({
    ok: true,
    report: {
      rsshub: { wasRunning: rsshubBefore.running, restarted: rsshubRestarted },
      sources: {
        retried: 0,
        succeeded: 0,
        failed: 0,
        totalFailed: 0,
        diagnoses: [],
        byAction: {},
      },
      logins: [],
    },
    scheduler: cronManager.getStatus(),
    rsshub,
  });
});

// Display settings endpoints
settingsRouter.get('/display', async (c) => {
  const settings = await userSettingsQueries.get();
  return c.json({
    ok: true,
    settings: settings ? {
      font_size: settings.font_size,
      card_density: settings.card_density,
      line_spacing: settings.line_spacing,
    } : null,
  });
});

settingsRouter.patch('/display', validateBody(updateDisplaySettingsSchema), async (c) => {
  const input = getValidatedBody<UpdateUserSettingsInput>(c);
  const updated = await userSettingsQueries.update(input);
  return c.json({
    ok: true,
    settings: updated ? {
      font_size: updated.font_size,
      card_density: updated.card_density,
      line_spacing: updated.line_spacing,
    } : null,
  });
});

export default settingsRouter;