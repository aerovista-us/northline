# Northline Production Handoff — Checkout Closed — 2026-09-12

## Status

**P0 production checkout is closed.** Northline can now reach the AeroVista production commerce API, resolve its Square variations safely even when multiple products share the same generic cart key, and receive a genuine Square-hosted checkout URL.

This file supersedes the checkout-blocker status in `NORTHLINE_PRODUCTION_HANDOFF_2026-09-12.md`.

## Production systems

- Storefront: `https://northline.aerovista.us/`
- Commerce API: `https://api.aerovista.us/`
- Commerce runtime host: NXCore
- Compose project: `backend`
- API service: `av-store-api`
- Backend working directory: `/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend`
- Northline catalog source: `store.json`

## What was fixed

### 1. CORS

Production `ALLOWED_ORIGINS` now includes:

```text
https://northline.aerovista.us
```

Verified live:

```text
GET /api/square/bootstrap       -> HTTP 200
OPTIONS /api/square/checkout    -> HTTP 204
Access-Control-Allow-Origin: https://northline.aerovista.us
```

### 2. Production SKU map persistence

The original 216-entry production `sku_map.generated.json` was copied out of the running API container before modification and retained as a timestamped secure backup.

The active map is now host-managed at:

```text
/srv/Collab/mini.shops/AV-PNW.com/av_storefront/backend/sku_map.generated.json
```

and mounted read-only into:

```text
/app/sku_map.generated.json
```

through:

```text
docker-compose.sku-map.override.yml
```

The running container mount was verified with `RW: false`.

### 3. Northline catalog merge

All current public, checkout-enabled Northline variants were merged into the production map:

```text
Public products: 8
Public checkout variants: 38
Original top-level SKU entries: 216
Result top-level SKU entries: 216
Existing primary mappings preserved: YES
```

The top-level entry count stayed at 216 because Northline shares generic cart keys with existing mappings; the new product identities are stored beneath `variationsById` rather than overwriting existing primary mappings.

## Collision-safe resolver proof

The production resolver successfully distinguished two different products that both use `Black__S`:

```text
Blue Divide Tee / S
cartKey: Black__S
variationId: SJACB3RVWKJBO5QG4C6WFW3E
price: 3299 cents

Ridgeline Tee / S
cartKey: Black__S
variationId: CYMAIUALBD5E65AY64AE33CS
price: 3299 cents
```

A different one-size cart shape also passed:

```text
Built Behind the Scenes Hat / One Size
cartKey: Gray__One Size
variationId: NGL72ITOR4SWK5DR5KY5QM6T
price: 3899 cents
```

Production verification ended with:

```text
PASS: collision-safe Northline resolver checks.
```

## Live checkout proof

A live production POST to:

```text
https://api.aerovista.us/api/square/checkout
```

using the Northline production origin and Blue Divide S returned:

```text
ok: true
checkoutUrl host: square.link
```

The returned URL passed an HTTPS + approved Square-host validation.

Production verification ended with:

```text
PASS: live Northline checkout created.
```

No purchase was required to prove link generation.

## Security properties retained

The fix did not weaken checkout validation:

- Square `variationId` remains authoritative when supplied.
- Generic cart keys are not treated as unique product identity.
- Unknown variation IDs still fail closed.
- Client-sent prices remain non-authoritative.
- Existing Gear/legacy primary SKU mappings were preserved.
- Runtime SKU mapping is mounted read-only.
- Only `av-store-api` was recreated for the map change.

## New drift-prevention tooling

The commerce API repo now contains:

```text
scripts/verify_storefront_sku_map.py
scripts/merge_storefront_sku_map.py
```

The validator checks public checkout variants for:

- missing cart keys;
- missing Square variation IDs;
- duplicate variation IDs;
- missing server-side mappings;
- shared-cart-key collision correctness; and
- storefront/server price drift.

The merge utility preserves existing primary mappings and adds storefront variants beneath `variationsById` where required.

Tests for shared `Black__S` collisions, one-size products, missing mappings, and price drift are included in the private commerce API repository. The backend contract workflow passed after these additions.

## What to work on next

### P1 — make consistency validation part of production release

This is the highest-value next step. The validator exists; now make it mandatory before a storefront catalog is promoted or a production SKU map is activated.

Desired flow:

```text
store.json
   -> validate catalog metadata
   -> merge/generate candidate server map
   -> verify storefront vs candidate map
   -> deploy read-only map
   -> resolver smoke tests
   -> live checkout smoke
```

A release must fail if any public + checkout-enabled variant cannot resolve server-side at the intended price.

### P2 — broader customer-path QA

After the release gate is automated, test:

- mixed-product carts;
- quantity > 1;
- multiple sizes;
- multiple designs sharing the same cart key;
- hats/one-size products;
- mobile Safari;
- mobile Chrome;
- desktop Chrome/Edge;
- return/back navigation from Square;
- graceful API-outage messaging.

### P3 — storefront conversion/UI polish

Only after P1/P2 are stable, return to product-card polish, cart ergonomics, checkout progress states, analytics, and broader mobile/audio QA.

## Recommended restart point

Start with:

> **Wire `verify_storefront_sku_map.py` into the production catalog publishing/deployment workflow so a storefront cannot become checkout-ready unless every visible variation resolves against the exact server-authoritative map at the expected price.**
