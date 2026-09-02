# Northline EchoStory

A mobile-first, GitHub Pages-ready immersive album/story/store experience for the **AeroVista Northline Collection**.

**Branding:** EchoVerse Audio | An AeroVista Production

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

`store.json` is the source of truth. Each sellable variant should provide:

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

For local catalog testing, open:

```text
index.html?admin=1
```

and use **Import store.json**. The imported catalog is stored in localStorage and can be reset to the bundled version.

## GitHub Pages

The existing `aerovista-us/echostory` repository already serves the custom domain `echostory.aerovista.us`.

Recommended additive deployment path:

```text
/northline/
```

which makes the experience available at:

```text
https://echostory.aerovista.us/northline/
```

without replacing the current EchoStory tribute storefront at the site root.

## Source art

The browser build uses optimized WebP artwork in `assets/art/`. The included files are small enough for GitHub Pages while preserving the black/silver/electric-blue linework.

## Production hardening before public launch

- Confirm the four mapped Northline tees against the production Square checkout bootstrap.
- Add the Idaho After Dark garment and Square variations when its product export arrives.
- Run real iOS Safari and Android Chrome audio tests.
- Confirm CORS on `api.aerovista.us` allows the EchoStory origin.
- Add Umami/analytics only after the final event taxonomy is agreed.
