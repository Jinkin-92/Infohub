import { Hono } from 'hono';
import { z } from 'zod';
import { getValidatedBody, validateBody } from '../middleware/validation.js';
import { localIntegrationsService } from '../services/localIntegrations.js';

const settingsRouter = new Hono();

const saveIntegrationsSchema = z.object({
  values: z.record(z.string()),
});

settingsRouter.get('/integrations', async (c) => {
  const rsshub = await localIntegrationsService.getRsshubSettings();
  return c.json({
    ok: true,
    rsshub,
  });
});

settingsRouter.post('/integrations', validateBody(saveIntegrationsSchema), async (c) => {
  const { values } = getValidatedBody<z.infer<typeof saveIntegrationsSchema>>(c);
  const rsshub = await localIntegrationsService.saveRsshubSettings(values);

  return c.json({
    ok: true,
    rsshub,
    message: 'RSSHub local settings saved and restarted',
  });
});

export default settingsRouter;
