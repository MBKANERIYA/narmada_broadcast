# Catalogue

## What This Subsystem Does

The Catalogue subsystem manages the client's local product list, product images,
Meta catalogue import, and WhatsApp customer catalogue publishing. A product can
be visible in the dashboard because it exists in MongoDB, but that does not by
itself prove the product is visible to WhatsApp customers. WhatsApp visibility
depends on queueing the product through the connected Meta catalogue using the
same retailer/content ID that WhatsApp product messages use.

## How It Is Structured

| Path | Responsibility |
|------|----------------|
| `frontend/src/components/Catalogue.jsx` | Product grid, add/edit/delete modal, image upload, Sync from Meta, Publish to WhatsApp. |
| `backend/src/routes/products.js` | Product CRUD, image serving, Meta import, and bulk WhatsApp catalogue publishing routes. |
| `backend/src/services/metaCatalogSync.js` | Low-level Meta `items_batch` upsert/delete helper used by the product routes. |
| `backend/src/models/Product.js` | Local Mongo product document, including `sku`, `meta_product_id`, image URLs, prices, and inventory fields. |
| `backend/src/models/Image.js` | Stores uploaded product image binary data in MongoDB so Meta crawlers can fetch stable image URLs on Vercel. |
| `backend/src/routes/webhook.js` | Sends native WhatsApp single-product messages using `whatsapp_catalog_id` and `product.sku`. |

## Conventions And Rules

- Treat `Product.sku` as the WhatsApp product retailer/content ID. The webhook
  uses it as `product_retailer_id` for native product messages.
- Store Meta's Graph product object ID separately as `Product.meta_product_id`;
  do not overwrite `sku` with the Graph ID when `retailer_id` is available.
- `Sync from Meta` imports products from the configured Meta catalogue and now
  also queues those products for WhatsApp customer visibility.
- `Publish to WhatsApp` bulk-queues all local products through the Meta
  `items_batch` API and reports how many queued or failed.
- Do not claim a publish succeeded only because the route looped through
  products. Use the result returned from `syncProductToMeta()`.
- Keep product images publicly fetchable through
  `/api/v1/products/images/:filename`; Vercel temp files are not durable enough
  for Meta image crawlers.

## Known Gotchas

- Dashboard visibility and WhatsApp customer visibility are separate states.
  The dashboard can show products imported from Meta even before they are
  queued for WhatsApp publishing.
- The configured `whatsapp_catalog_id` must be the catalogue connected to the
  client's WhatsApp Business account/phone number. If the wrong catalogue is
  configured, the dashboard may still import products while WhatsApp customers
  see a different storefront.
- Meta `items_batch` is asynchronous. A successful queue response means Meta
  accepted the batch job, not that every customer device refreshes instantly.
- If a Meta import was previously saved with the Graph product `id` as `sku`,
  the next import should match by old SKU or `meta_product_id`, then update
  `sku` to `retailer_id` when Meta returns it.
- Products can still fail Meta review or catalogue diagnostics outside this
  app. The API now surfaces first failure messages so operators are not left
  with a false success toast.

## How It Is Tested

- `backend/test/regression.test.js` covers that Meta imports request
  `retailer_id`, preserve `meta_product_id`, queue imported products for
  WhatsApp publishing, report push failures, and show the frontend action as
  `Publish to WhatsApp`.
- Full local verification for this subsystem should include:
  - `cd backend && npm test`
  - backend `node --check` sweep
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`
  - high-level npm audits for both apps
- Live QA after deploy should run `Sync from Meta` or `Publish to WhatsApp`,
  confirm the toast has `failed: 0`, then check the WhatsApp customer catalogue
  after Meta has processed the batch.

## Related KB Files

- `whatsapp-webhook.md` for native WhatsApp product messages and cart orders.
- `hosted-checkout.md` for checkout/order flows that consume product data.
- `frontend.md` for app-shell and Catalogue UI conventions.
- `testing.md` for the required verification gates.
