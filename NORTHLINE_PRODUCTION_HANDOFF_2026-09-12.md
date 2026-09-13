# Northline Production Handoff — 2026-09-12

## Purpose

This is the current handoff for the Northline production storefront and its dependency on the AeroVista production commerce API. It is intended to let another engineer or AI agent continue safely without rereading the incident thread.

The most important status is:

> **Northline is live and the browser CORS blocker is fixed. Production checkout is not yet considered closed because the server-side Square SKU/variation map does not yet contain the Northline catalog.**

Do not weaken server-side price or variation validation to make checkout pass. Synchronize the production catalog mapping instead.

---

## Canonical systems

### Northline storefront

Repository:

```text
aerovista-us/northline
```

Default branch:

```text
main
```

Production:

```text
https://northline.aerovista.us/
```

Storefront catalog source of truth:

```text
store.json
```

Relevant storefront configuration:

```text
config.js
app.js
store.json
```

The storefront uses the protected legacy Square checkout path:

```text
GET  https://api.aerovista.us/api/square/bootstrap
POST https://api.aerovista.us/api/square/checkout
```

### Production commerce API

Repository:

```text
aerovista-us/aerovista-commerce-api
```

Runtime host:

```text
NXCore
```

Compose ownership discovered during the incident:

```text
project=backend
service=av-store-api
working_dir=/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend
config_files=/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend/docker-compose.yml
```

Runtime API:

```text
https://api.aerovista.us/
```

Detailed commerce-side incident/runbook:

```text
NORTHLINE_CHECKOUT_RECOVERY_2026-09-12.md
```

---

## Recent source-control checkpoints

Northline documentation checkpoint:

```text
bcf4330d1b98d28b51865a7dea49c66839a17cbd
docs: record production checkout dependencies
```

Commerce recovery documentation checkpoints:

```text
4e172bf717afa11375c57c435344319392dc6496
docs: capture Northline checkout recovery lessons

cb6e73d75d12b113424462d773f16229979e380e
docs: link Northline checkout recovery runbook
```

Earlier Northline catalog/product sync checkpoint:

```text
324db79c14a4ceed0be79df7cabc54a8ff3aeccf
Sync Northline catalog and product mockups
```

---

## Current production state

### Confirmed working

1. `https://northline.aerovista.us/` is the production storefront and current deployment target.
2. Northline's client correctly points at `https://api.aerovista.us`.
3. The API itself is reachable and `/api/square/bootstrap` responds successfully.
4. Production CORS now explicitly admits:

```text
https://northline.aerovista.us
```

5. The production API container was recreated after the allowlist change.
6. Live CORS verification passed:

```text
GET /api/square/bootstrap
HTTP/2 200
Access-Control-Allow-Origin: https://northline.aerovista.us

OPTIONS /api/square/checkout
HTTP/2 204
Access-Control-Allow-Origin: https://northline.aerovista.us
```

7. The browser now reaches checkout application logic instead of being blocked by CORS.
8. The production API continues to keep price authority on the server rather than trusting client-sent prices.

### Current blocker

The next checkout error is:

```text
Unknown SKU 'Black__S' (variationId: SJACB3RVWKJBO5QG4C6WFW3E)
```

That variation is valid Northline catalog data:

```text
Product:     Blue Divide Tee
Color:       Black
Size:        S
Price:       $32.99
cartKey:     Black__S
variationId: SJACB3RVWKJBO5QG4C6WFW3E
```

The problem is server-side production mapping drift, not the storefront's selected variation.

---

## Critical architecture learned during the incident

### `cartKey` is not product identity

Northline intentionally reuses generic size/color cart keys across multiple designs:

```text
Black__S
Black__M
Black__L
Black__XL
Black__2XL
Black__3XL
```

For example, Blue Divide S and Ridgeline S both use `Black__S`, but they are different Square catalog variations.

Therefore:

- never overwrite the production `Black__S` entry with whichever product failed last;
- never treat `cartKey` alone as a globally unique product identifier;
- use the submitted Square `variationId` as the authoritative product identity.

### The commerce API already supports collisions correctly

The legacy commerce resolver treats a client-supplied Square variation ID as authoritative.

The SKU map supports a primary variation and additional identities beneath:

```json
{
  "Black__S": {
    "name": "Existing product (S)",
    "cents": 3299,
    "variationId": "EXISTING_VARIATION",
    "variationsById": {
      "SJACB3RVWKJBO5QG4C6WFW3E": {
        "name": "Blue Divide Tee (S)",
        "cents": 3299,
        "variationId": "SJACB3RVWKJBO5QG4C6WFW3E"
      }
    }
  }
}
```

This is the correct mechanism for Northline.

---

## Production SKU-map discovery

The running API reported:

```text
SQUARE_SKU_MAP_FILE=sku_map.generated.json
```

There is no production `SQUARE_SKU_MAP_JSON` environment value.

Inside the running container:

```text
/app/sku_map.generated.json   ~62 KB
/app/sku_map.generated.env    ~49 KB
```

The loaded production SKU map contained:

```text
216 top-level entries
```

The failing Northline variation was absent from both:

1. `_variation_index_from_sku_map(app.load_sku_map())`; and
2. `app.load_catalog_checkout_meta()["by_variation"]`.

The current container mounts showed no host bind for `/app/sku_map.generated.json`.

Existing relevant read-only mounts were:

```text
/srv/Collab/mini.shops/AV-PNW.com/av_storefront/square_products_latest.json -> /app/square_products_latest.json
/srv/Collab/mini.shops/AV-PNW.com/av_storefront/img -> /app/img
/srv/Collab/mini.shops/AV-PNW.com/av_storefront/store -> /app/store
```

Conclusion:

> The active production SKU map is image-baked. It can drift from newly launched storefront catalogs and can be lost/reverted on later image replacement unless it is deliberately rebuilt or externalized.

---

## Immediate next milestone — P0

### Goal

**Close the production checkout loop without weakening any validation.**

Completion means a live Northline customer can select a sellable product, Northline can bootstrap against the production API, the exact Square variation can be resolved server-side at the intended price, and the API returns a valid Square-hosted checkout URL.

### Work sequence

#### 1. Preserve current production mapping

Before changing the map, copy the exact running `/app/sku_map.generated.json` out of `av-store-api` and retain a timestamped secure backup.

Do not regenerate a fresh map from only Northline data; the existing 216-entry production map must be preserved.

#### 2. Externalize the production map

Recommended host path:

```text
/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend/sku_map.generated.json
```

Recommended container path:

```text
/app/sku_map.generated.json
```

Mount it read-only into `av-store-api` through a small Compose override or another explicit production-managed Compose change.

This makes the active mapping observable and persistent across API image rebuilds.

#### 3. Merge all public Northline variants

Import every variant where:

```text
publicVisible = true
checkoutReady = true
```

from Northline `store.json`.

At the current catalog checkpoint this is expected to be:

```text
8 public products
38 public checkout-enabled variations
```

Preserve all existing production mappings.

For generic cart-key collisions, add each Northline Square variation under `variationsById`.

#### 4. Recreate only the API service

After Compose config validates the new map mount:

```text
av-store-api
```

should be recreated without restarting PostgreSQL, fulfillment workers, reconciliation workers, or unrelated services.

#### 5. Verify from inside the running container

At minimum verify:

```text
SJACB3RVWKJBO5QG4C6WFW3E
```

resolves as:

```text
Blue Divide Tee (S)
3299 cents
```

through `resolve_checkout_meta()`.

Do not consider a JSON grep alone sufficient. Exercise the same resolver checkout uses.

#### 6. Run collision-safe smoke cases

At minimum test:

```text
Blue Divide Tee / Black / S
Ridgeline Tee / Black / S
```

These intentionally share:

```text
Black__S
```

but must resolve to their own Square variation IDs.

Also test one one-size hat variant to cover a different cart-key shape.

#### 7. Exercise the live customer path

From `https://northline.aerovista.us/`:

1. hard refresh;
2. add a product;
3. start checkout;
4. confirm bootstrap succeeds;
5. confirm checkout POST succeeds;
6. confirm redirect reaches a Square-hosted checkout URL;
7. do not complete a real purchase merely to prove link generation unless a deliberate test order is intended.

### P0 exit gate

P0 is complete only when all of the following are true:

- Northline origin remains present in live CORS.
- All 38 public Northline variations resolve server-side.
- Same-cart-key/different-variation tests pass.
- Server-authoritative prices match Northline's intended prices.
- A live browser checkout reaches Square-hosted checkout.
- The production SKU map survives an API service recreation because it is no longer dependent only on an image-baked copy.

---

## What should be worked on immediately after P0 — P1

### 1. Eliminate manual storefront/SKU drift

This incident occurred because Northline `store.json` knew the correct Square variation IDs but production commerce did not.

Create a deterministic synchronization/validation workflow that compares customer-visible storefront variants to the server-authoritative commerce map before release.

Preferred behavior:

```text
storefront catalog
        ↓
validation/generation
        ↓
production checkout map
        ↓
smoke gate
```

The gate should fail if any public + checkout-enabled variant:

- lacks a Square variation ID;
- has no production server mapping;
- has a different server-authoritative price;
- collides incorrectly under a generic cart key; or
- is visible in the store while checkout resolution would fail.

### 2. Add a Northline checkout contract test

Automate at least these cases:

- bootstrap recognizes Northline sellable cart keys;
- Blue Divide S resolves by variation ID;
- Ridgeline S resolves independently despite sharing `Black__S`;
- one-size hat resolves;
- unknown variation ID fails closed;
- client-sent price is ignored;
- CORS responds to the exact production Northline origin.

### 3. Make storefront origin onboarding explicit

A future storefront launch should not discover CORS only from a customer browser.

Add an onboarding gate that proves:

```text
GET bootstrap with Origin header
OPTIONS checkout preflight
```

for the production hostname before marking checkout ready.

A longer-term improvement is to derive permitted storefront origins from a governed storefront registry instead of hand-maintaining a growing `.env` allowlist, provided that change keeps the allowlist fail-closed and reviewable.

---

## P2 — production checkout QA

After mapping and automation are stable, test the behavior customers actually use:

- different tee designs sharing the same size/color cart key;
- multiple sizes;
- hat/one-size product;
- mixed-item cart;
- quantity > 1;
- mobile Chrome;
- mobile Safari;
- desktop Chrome/Edge;
- Square-hosted checkout redirect;
- back-navigation from Square to Northline;
- useful customer-facing error state if the commerce API is unavailable.

Confirm analytics/telemetry does not capture payment secrets or sensitive checkout payloads.

---

## P3 — storefront polish after checkout is trustworthy

Only after the production checkout loop and drift-prevention gate are complete should work return to lower-risk presentation improvements such as:

- store-card/product-image consistency;
- mobile cart ergonomics;
- product detail clarity;
- loading and checkout-progress states;
- conversion analytics;
- audio/mobile QA;
- social sharing polish.

Do not let presentation work obscure an unresolved commerce dependency.

---

## Known-good CORS verification

The following shape passed after the production allowlist fix:

```bash
curl -si \
  -H 'Origin: https://northline.aerovista.us' \
  https://api.aerovista.us/api/square/bootstrap \
  | grep -Ei 'HTTP/|access-control|vary'

curl -si -X OPTIONS \
  -H 'Origin: https://northline.aerovista.us' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  https://api.aerovista.us/api/square/checkout \
  | grep -Ei 'HTTP/|access-control|vary'
```

Expected critical header:

```text
Access-Control-Allow-Origin: https://northline.aerovista.us
```

---

## Fast production ownership checks

When debugging the live API, do not assume a path or Compose project. Verify it from Docker labels:

```bash
docker inspect av-store-api --format '
working_dir={{ index .Config.Labels "com.docker.compose.project.working_dir" }}
config_files={{ index .Config.Labels "com.docker.compose.project.config_files" }}
project={{ index .Config.Labels "com.docker.compose.project" }}
service={{ index .Config.Labels "com.docker.compose.service" }}
'
```

Current known result:

```text
working_dir=/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend
config_files=/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend/docker-compose.yml
project=backend
service=av-store-api
```

---

## Security and operational boundaries

- Never commit production `.env` values, Square access tokens, webhook secrets, operator secrets, or private provider exports.
- Keep the checkout price server-authoritative.
- Keep unknown Square variations fail-closed.
- Do not solve product collisions by falling back to a generic same-size cart key when the browser supplied a specific variation ID.
- Back up the active production map before merging new storefront data.
- Prefer a read-only runtime mount for generated mapping data.
- Recreate only the service that needs the configuration change.
- Preserve the 216-entry production baseline while adding Northline; do not replace it with a Northline-only map.

---

## Handoff status summary

### Green

- Northline production domain established.
- Northline repo/config points at production commerce API.
- CORS diagnosis complete.
- Production Northline CORS allowlist fixed and verified live.
- Browser reaches commerce application logic.
- Exact failing Square variation identified.
- Generic cart-key collision behavior understood.
- Production Compose ownership identified.
- Production SKU-map loading behavior identified.
- Recovery lessons documented in both Northline and commerce API repositories.

### Yellow

- Production SKU map is currently image-baked.
- Northline variations are not yet present in the server-authoritative production resolver.
- A persistent host-managed SKU map has been designed/recommended but not yet confirmed deployed.

### Red / release blocker

- Live Northline checkout has not yet been proven through to a Square-hosted checkout URL after synchronizing the server-side map.

---

## Recommended restart point

Start here:

> **Externalize the exact running 216-entry production SKU map, merge all 38 public Northline variations without losing existing entries, mount it read-only into `av-store-api`, recreate only the API, verify collision-safe resolver behavior, then perform a live Northline-to-Square checkout smoke.**

Do not redesign the store or change checkout validation before completing that sequence.
