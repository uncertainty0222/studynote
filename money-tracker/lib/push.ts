import webpush from 'web-push';
import { getConfigValue, setConfigValue, getPushSubscriptionsForRole, deletePushSubscription } from './db';

async function getOrCreateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const stored = await getConfigValue('vapid_keys');
  if (stored) return JSON.parse(stored);
  const keys = webpush.generateVAPIDKeys();
  await setConfigValue('vapid_keys', JSON.stringify(keys));
  return keys;
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await getOrCreateVapidKeys();
  return keys.publicKey;
}

export async function sendPushToRole(
  role: 'husband' | 'wife',
  title: string,
  body: string
): Promise<void> {
  const [keys, subscriptions] = await Promise.all([
    getOrCreateVapidKeys(),
    getPushSubscriptionsForRole(role),
  ]);
  if (subscriptions.length === 0) return;

  webpush.setVapidDetails('mailto:noreply@app.local', keys.publicKey, keys.privateKey);

  await Promise.all(
    subscriptions.map(async ({ endpoint, subscription }) => {
      try {
        await webpush.sendNotification(
          JSON.parse(subscription) as webpush.PushSubscription,
          JSON.stringify({ title, body })
        );
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 410 || e.statusCode === 404) {
          await deletePushSubscription(endpoint);
        }
      }
    })
  );
}
