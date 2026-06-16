import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8');
const importFromBackend = (relativePath) => import(pathToFileURL(resolve(repoRoot, 'backend', relativePath)).href);

test('Razorpay webhook signatures require a valid HMAC over the raw body', async () => {
  const { verifyRazorpayWebhookSignature } = await importFromBackend('src/utils/security.js');
  const rawBody = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { notes: { order_id: '42' } } } } });
  const secret = 'webhook_secret';
  const validSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSignature, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, 'bad-signature', secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSignature, ''), false);
  assert.equal(verifyRazorpayWebhookSignature('', validSignature, secret), false);
});

test('public debug chat-status endpoint is not registered', () => {
  const appSource = readRepoFile('backend/src/app.js');
  assert.doesNotMatch(appSource, /app\.get\(['"]\/api\/v1\/debug\/chat-status['"]/);
  assert.doesNotMatch(appSource, /verify_token:\s*process\.env\.WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
});

test('labeled broadcasts are supported by the campaign schema and migration', () => {
  const databaseSource = readRepoFile('backend/src/database.js');
  assert.match(databaseSource, /recipient_type ENUM\('all','tagged','custom','labeled'\)/);
  assert.match(databaseSource, /ALTER TABLE whatsapp_campaigns MODIFY COLUMN recipient_type ENUM\('all','tagged','custom','labeled'\)/);
});

test('Socket chat refresh accepts the backend conversationId event key', () => {
  const storeSource = readRepoFile('frontend/src/stores/store.js');
  assert.match(storeSource, /data\.conversationId\s*\?\?\s*data\.conversation_id/);
  assert.doesNotMatch(storeSource, /activeConversation\.id === data\.conversation_id/);
});

test('bot pause is persisted server-side and webhook auto-reply respects it', () => {
  const databaseSource = readRepoFile('backend/src/database.js');
  const chatRouteSource = readRepoFile('backend/src/routes/whatsapp-chat.js');
  const appSource = readRepoFile('backend/src/app.js');
  const chatComponentSource = readRepoFile('frontend/src/components/WhatsAppChat.jsx');

  assert.match(databaseSource, /bot_paused BOOLEAN DEFAULT FALSE/);
  assert.match(databaseSource, /ALTER TABLE whatsapp_conversations ADD COLUMN bot_paused BOOLEAN DEFAULT FALSE/);
  assert.match(chatRouteSource, /\/conversations\/:id\/bot-pause/);
  assert.match(appSource, /conversation\.bot_paused/);
  assert.doesNotMatch(chatComponentSource, /localStorage\.setItem\(BOT_PAUSE_KEY/);
});

test('tenant settings mask payment secrets before returning to the browser', async () => {
  const { sanitizeBotSettingsForClient, mergeSecretSettings } = await importFromBackend('src/utils/settings-security.js');
  const storedSettings = {
    enabled: true,
    razorpay_key_id: 'rzp_live_123',
    razorpay_key_secret: 'super-secret',
    razorpay_webhook_secret: 'webhook-secret',
    payment_link_template: 'Pay here',
  };

  assert.deepEqual(sanitizeBotSettingsForClient(storedSettings), {
    enabled: true,
    razorpay_key_id: 'rzp_live_123',
    razorpay_key_secret: '',
    razorpay_webhook_secret: '',
    payment_link_template: 'Pay here',
    has_razorpay_key_secret: true,
    has_razorpay_webhook_secret: true,
  });

  assert.deepEqual(mergeSecretSettings(storedSettings, {
    razorpay_key_id: 'rzp_live_456',
    razorpay_key_secret: '',
    razorpay_webhook_secret: '',
    payment_link_template: 'Updated',
  }), {
    enabled: true,
    razorpay_key_id: 'rzp_live_456',
    razorpay_key_secret: 'super-secret',
    razorpay_webhook_secret: 'webhook-secret',
    payment_link_template: 'Updated',
  });
});

test('deployment docs use placeholders instead of production-looking secrets', () => {
  const deploymentDoc = readRepoFile('knowledge-base/DEPLOYMENT.md');
  const legacySecretPrefix = 'Wa' + 'Broadcast_';
  assert.doesNotMatch(deploymentDoc, new RegExp(`${legacySecretPrefix}[A-Za-z0-9_!]+`));
  assert.doesNotMatch(deploymentDoc, new RegExp(`IDENTIFIED BY '${legacySecretPrefix}[^']+'`));
  assert.match(deploymentDoc, /DB_PASSWORD=<strong-random-db-password>/);
  assert.match(deploymentDoc, /JWT_SECRET=<strong-random-jwt-secret>/);
});

test('Catalogue declares hooks before any loading return', () => {
  const catalogueSource = readRepoFile('frontend/src/components/Catalogue.jsx');
  const hookIndex = catalogueSource.indexOf("const [searchTerm, setSearchTerm] = useState('')");
  const loadingReturnIndex = catalogueSource.indexOf('if (loading)');

  assert.ok(hookIndex > -1, 'search hook exists');
  assert.ok(loadingReturnIndex > -1, 'loading return exists');
  assert.ok(hookIndex < loadingReturnIndex, 'search/sort/filter hooks must be declared before loading return');
});
