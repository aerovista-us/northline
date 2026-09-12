# Northline EchoStory

A mobile-first, GitHub Pages-ready immersive album/story/store experience for the **AeroVista Northline Collection**.

**Branding:** EchoVerse Audio | An AeroVista Production

**Production:** `https://northline.aerovista.us/`

## What is included

- Mobile-first album player with 6-track Northline sequence
- Track-specific AeroVista artwork
- Built-in **Northline demo bed** so the visualizer, transport and EQ work immediately
- Web Audio API: bass / mid / air EQ, compressor, volume and analyzer
- Three themed visualizer modes: Ridgeline, Mirror and Signal
- Auto-continue, shuffle, repeat modes, seeking and Media Session controls
- Track story view and immersive art
- JSON-driven Northline store
- Fail-closed Square checkout integration following the current AeroVista storefront pattern
- Local catalog import at `?admin=1`
- JSON + generated-JS fallbacks so the experience can be previewed from `file://`
- No external UI framework or runtime dependency

## Northline audio masters

The player is wired for these final files:

```text
audio/northline.mp3
audio/blue-divide.mp3
audio/ridgeline.mp3
audio/idaho-after-dark.mp3
audio/powderline.mp3
audio/source-code.mp3
```

All six approved master files are connected using lowercase, URL-safe filenames. `tracks.json` is authoritative; regenerate `tracks.generated.js` with `scripts/build-fallbacks.py` whenever track metadata changes.

The player exposes loading, buffering, playback and error states, publishes duration and seek position to supported lock-screen controls, and keeps unavailable tracks fail-closed.

## Store catalog

`store.json` is the Northline storefront source of truth. Each sellable variant should provide:

```json
{
  "id": "NL-01-TEE-BLK-L",
  "label": "Tee / Black / L",
  "priceCents": 3200,
  "cartKey": "YOUR_PRODUCTION_CART_KEY",
  "squareVariationId": "YOUR_SQUARE_VARIATION_ID",
  "checkoutReady": true
}
```

The client:

1. GETs `https://api.aerovista.us/api/square/bootstrap`
2. Verifies `cartKey` against `sellableCartKeys`
3. POSTs the cart to `https://api.aerovista.us/api/square/checkout`
4. Redirects only when the API returns `ok: true` and a `checkoutUrl`

Until a product is explicitly mapped, its purchase button stays disabled.

### Production checkout dependencies

A valid `store.json` entry is necessary but not sufficient for production checkout. The server-side commerce configuration must also agree with the storefront.

The 2026-09-12 production checkout recovery established these rules:

- Production `ALLOWED_ORIGINS` must explicitly include `https://northline.aerovista.us`.
- A plain HTTP 200 from `/api/square/bootstrap` is not enough; browser-origin CORS must be tested with `Origin: https://northline.aerovista.us`.
- `OPTIONS /api/square/checkout` must return `Access-Control-Allow-Origin: https://northline.aerovista.us` before the browser can POST JSON checkout data.
- Generic cart keys such as `Black__S` are shared across multiple Northline designs and are therefore not unique product identities.
- `squareVariationId` is the authoritative product identity submitted to the commerce API.
- The production commerce API deliberately rejects an unknown variation ID instead of silently using another product that happens to share the same cart key.
- Client-sent prices are not authoritative. The production API must have server-side price metadata for the submitted Square variation.

For example, Blue Divide Tee / Black / S uses:

```text
cartKey:           Black__S
squareVariationId: SJACB3RVWKJBO5QG4C6WFW3E
priceCents:        3299
```

Other tee designs also use `Black__S` with different Square variation IDs. Do not "fix" checkout by replacing a shared `Black__S` mapping with one product. The commerce API supports multiple identities beneath a shared cart key through `variationsById`.

Operationally, storefront release QA should validate both sides:

```text
Northline store.json
        +
production api.aerovista.us CORS allowlist
        +
production Square variation/SKU map
        =
checkout-ready variant
```

For local catalog testing, open:

```text
index.html?admin=1
```

and use **Import store.json**. The imported catalog is stored in localStorage and can be reset to the bundled version.

## GitHub Pages / custom domain

Production is served at:

```text
https://northline.aerovista.us/
```

The repository contains the `CNAME` used by GitHub Pages for that custom domain. Treat the production custom domain, rather than the older proposed `echostory.aerovista.us/northline/` path, as the current deployment target.

## Source art

The browser build uses optimized WebP artwork in `assets/art/`. The included files are small enough for GitHub Pages while preserving the black/silver/electric-blue linework.

## Production hardening / release checklist

- Keep all public, checkout-enabled Northline products aligned with the production Square checkout map.
- Verify each `squareVariationId`, not only each size/color cart key.
- Confirm `https://northline.aerovista.us` remains in production API CORS configuration.
- Test both `/api/square/bootstrap` and the `/api/square/checkout` preflight from the Northline origin.
- Test at least two different products that share the same generic cart key to catch variation-collision regressions.
- Confirm the server-authoritative price matches the intended storefront price.
- Use square, product-only catalog images on the shared white product-card surface.
- Run real iOS Safari and Android Chrome audio tests.
- Add Umami/analytics only after the final event taxonomy is agreed.
