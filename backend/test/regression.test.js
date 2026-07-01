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

test('MongoDB connection is environment-owned and has no hardcoded Atlas fallback', async () => {
  const databaseSource = readRepoFile('backend/src/database.js');
  const { resolveMongoUri } = await importFromBackend('src/database.js');

  assert.doesNotMatch(databaseSource, /mongodb\+srv:\/\/[^'"\s]+/);
  assert.match(databaseSource, /MONGO_URI is required/);
  assert.equal(
    resolveMongoUri({ MONGO_URI: 'mongodb://127.0.0.1:27017/client_db' }),
    'mongodb://127.0.0.1:27017/client_db'
  );
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'production' }),
    /MONGO_URI is required/
  );
  assert.match(resolveMongoUri({ NODE_ENV: 'development' }), /narmada_broadcast_dev/);
});

test('JWT session validation route exists and frontend does not trust stale persisted auth', () => {
  const authSource = readRepoFile('backend/src/routes/auth.js');
  const storeSource = readRepoFile('frontend/src/stores/store.js');
  const appSource = readRepoFile('frontend/src/App.jsx');

  assert.match(authSource, /router\.get\('\/me',\s*auth/);
  assert.match(storeSource, /validateSession:\s*async/);
  assert.match(storeSource, /api\('\/auth\/me'/);
  assert.match(storeSource, /AUTH_TOKEN_KEY\s*=\s*'narmada_broadcast_token'/);
  assert.doesNotMatch(storeSource, /localStorage\.getItem\('token'\)/);
  assert.doesNotMatch(storeSource, /localStorage\.setItem\('token'/);
  assert.match(storeSource, /narmada-broadcast-storage/);
  assert.match(appSource, /validateSession\(\)/);
  assert.match(appSource, /isAuthReady/);
});

test('tenant settings route exposes AI assistant and embedding endpoints used by Settings UI', () => {
  const routeSource = readRepoFile('backend/src/routes/tenant-settings.js');

  for (const pattern of [
    /router\.get\('\/ai-assistant\/analytics'/,
    /router\.get\('\/ai-assistant\/suggestions'/,
    /router\.get\('\/ai-assistant\/score'/,
    /router\.get\('\/ai-assistant\/digest'/,
    /router\.post\('\/ai-assistant\/test'/,
    /router\.post\('\/ai-assistant\/learning\/cluster'/,
    /router\.get\('\/embeddings'/,
    /router\.post\('\/embeddings\/reembed'/,
  ]) {
    assert.match(routeSource, pattern);
  }

  assert.match(routeSource, /api_key_configured:\s*Boolean\(process\.env\.AI_API_KEY\)/);
  assert.match(routeSource, /AI_API_KEY is required to re-embed/);
});

test('knowledge base API matches frontend contracts for list, test console, and phrasings', () => {
  const routeSource = readRepoFile('backend/src/routes/knowledge-base.js');
  const componentSource = readRepoFile('frontend/src/components/KnowledgeBase.jsx');

  assert.match(routeSource, /res\.json\(\{\s*faqs/);
  assert.match(componentSource, /data\.faqs\s*\|\|\s*\[\]/);
  assert.match(routeSource, /router\.post\('\/test'/);
  assert.match(routeSource, /would_reply/);
  assert.match(routeSource, /matched_answer/);
  assert.match(routeSource, /router\.get\('\/:id\/phrasings'/);
  assert.match(routeSource, /router\.post\('\/:id\/phrasings'/);
  assert.match(routeSource, /router\.delete\('\/:id\/phrasings\/:phrasingId'/);
});

test('smart responder can score text-only FAQs when Gemini embeddings are unavailable', async () => {
  const { scoreTextMatch } = await importFromBackend('src/services/smartResponder.js');

  assert.ok(scoreTextMatch('What are your delivery charges?', 'Delivery charges and shipping fees') >= 0.45);
  assert.ok(scoreTextMatch('blue silk blouse', 'Blue silk blouse with lining') >= 0.45);
  assert.equal(scoreTextMatch('delivery charges', 'return policy warranty'), 0);
});

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

test('product image uploads only accept image file types', () => {
  const productsSource = readRepoFile('backend/src/routes/products.js');
  assert.match(productsSource, /ALLOWED_IMAGE_MIME_TYPES/);
  assert.match(productsSource, /fileFilter/);
  assert.match(productsSource, /Only JPG, PNG, WebP, or GIF image uploads are allowed/);
  assert.match(productsSource, /router\.post\('\/upload-image'/);
});

test('public debug chat-status endpoint is not registered', () => {
  const appSource = readRepoFile('backend/src/app.js');
  assert.doesNotMatch(appSource, /app\.get\(['"]\/api\/v1\/debug\/chat-status['"]/);
  assert.doesNotMatch(appSource, /verify_token:\s*process\.env\.WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
});

test('unused lead mailer route is not shipped with a Nodemailer dependency', () => {
  const appSource = readRepoFile('backend/src/app.js');
  const backendPackage = JSON.parse(readRepoFile('backend/package.json'));

  assert.doesNotMatch(appSource, /leadsRoutes|routes\/leads|\/api\/v1\/leads/);
  assert.equal(backendPackage.dependencies.nodemailer, undefined);
});

test('labeled broadcasts are supported by the campaign schema and route', () => {
  const campaignModelSource = readRepoFile('backend/src/models/WhatsAppCampaign.js');
  const whatsappRouteSource = readRepoFile('backend/src/routes/whatsapp.js');

  assert.match(campaignModelSource, /enum:\s*\['all', 'custom', 'labeled', 'tagged', 'filtered'\]/);
  assert.match(whatsappRouteSource, /recipientType === 'labeled'/);
  assert.match(whatsappRouteSource, /labels:\s*\{\s*\$regex:\s*new RegExp\(recipientFilter\.label, 'i'\)/);
});

test('Socket chat refresh accepts the backend conversationId event key', () => {
  const storeSource = readRepoFile('frontend/src/stores/store.js');
  assert.match(storeSource, /data\.conversationId\s*\?\?\s*data\.conversation_id/);
  assert.doesNotMatch(storeSource, /activeConversation\.id === data\.conversation_id/);
});

test('bot pause is persisted server-side and webhook auto-reply respects it', () => {
  const conversationModelSource = readRepoFile('backend/src/models/WhatsAppConversation.js');
  const chatRouteSource = readRepoFile('backend/src/routes/whatsapp-chat.js');
  const webhookSource = readRepoFile('backend/src/routes/webhook.js');
  const chatComponentSource = readRepoFile('frontend/src/components/WhatsAppChat.jsx');

  assert.match(conversationModelSource, /bot_paused:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/);
  assert.match(chatRouteSource, /\/conversations\/:id\/bot-pause/);
  assert.match(webhookSource, /conversation\.bot_paused/);
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
  assert.doesNotMatch(deploymentDoc, /mongodb\+srv:\/\/[^<\s]+/);
  assert.match(deploymentDoc, /MONGO_URI=<mongodb-connection-string>/);
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

test('mobile app shell exposes an openable drawer and avoids misleading admin nav', () => {
  const sidebarSource = readRepoFile('frontend/src/components/Sidebar.jsx');
  const mainCss = readRepoFile('frontend/src/styles/main.css');
  const storeSource = readRepoFile('frontend/src/stores/store.js');

  assert.match(sidebarSource, /sidebar--open/);
  assert.match(mainCss, /\.sidebar\.sidebar--open\s*\{\s*transform:\s*translateX\(0\)/);
  assert.doesNotMatch(sidebarSource, /user\?\.role\s*===\s*['"]admin['"]/);
  assert.match(storeSource, /currentView:\s*['"]overview['"]/);
});

test('Orders provides a mobile card surface instead of only a wide table', () => {
  const ordersSource = readRepoFile('frontend/src/components/Orders.jsx');
  const mainCss = readRepoFile('frontend/src/styles/main.css');

  assert.match(ordersSource, /orders-table-card/);
  assert.match(ordersSource, /orders-mobile-list/);
  assert.match(ordersSource, /orders-mobile-card/);
  assert.match(mainCss, /\.orders-mobile-list/);
});

test('Vite dev proxy targets the backend default port and can be overridden for QA', () => {
  const viteConfig = readRepoFile('frontend/vite.config.js');
  assert.match(viteConfig, /VITE_DEV_API_PROXY_TARGET/);
  assert.match(viteConfig, /process\.env\.VITE_DEV_API_PROXY_TARGET\s*\|\|\s*['"]http:\/\/localhost:3000['"]/);
  assert.match(viteConfig, /target:\s*apiProxyTarget/);
});
