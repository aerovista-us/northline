# Northline — EchoStory

A mobile-first, GitHub Pages experience for the **AeroVista Northline Collection**, built as an immersive release rather than a conventional album page.

**EchoVerse Audio | An AeroVista Production**

## Live architecture

This repository is intentionally static-first so it can run directly from GitHub Pages with no build server.

- `index.html` — player / story / store shell
- `styles.css` — Northline visual system
- `app.js` — player, Web Audio graph, visualizers, story UI, cart and Square handoff
- `tracks.json` — album / track source of truth
- `store.json` — merchandise source of truth
- `tracks.generated.js` / `store.generated.js` — fallback snapshots for local preview
- `assets/art/` — optimized Northline artwork
- `assets/audio/northline-demo.mp3` — temporary built-in system demo
- `audio/` — destination for approved masters
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

## Player

The release player includes:

- Six-track Northline sequence
- Automatic next-track continuation
- Shuffle
- Repeat all / repeat one / off
- Seek and volume controls
- Media Session controls where supported
- Web Audio API signal chain
- Bass / mids / air EQ
- Compressor + output gain
- Presets: **Flat / Night / Summit / Low Road**
- Visualizer modes: **Ridgeline / Mirror / Signal**
- Full-screen visualizer
- Track-specific artwork and story views

## Audio masters

The final files are expected at:

```text
audio/northline.mp3
audio/blue-divide.mp3
audio/ridgeline.mp3
audio/idaho-after-dark.mp3
audio/powderline.mp3
audio/source-code.mp3
```

The current build includes a small original system-demo bed for **Northline** only so transport, EQ, visualizers and auto-continuation can be tested before the approved masters arrive. Tracks without a master remain visible and fail closed rather than playing unrelated audio.

When an approved master is added, update its entry in `tracks.json`:

```json
{
  "audio": "audio/northline.mp3",
  "available": true,
  "demo": false
}
```

Then regenerate the fallback snapshot:

```bash
python scripts/build-fallbacks.py
```

## Store + Square

`store.json` is the Northline merchandise source of truth. A production-ready variant should include:

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

The browser follows the same fail-closed commerce pattern used by current AeroVista storefronts:

1. `GET https://api.aerovista.us/api/square/bootstrap`
2. Verify the selected `cartKey` is allowed by the production Square map
3. `POST` the cart to `/api/square/checkout`
4. Redirect only when the API returns an approved `checkoutUrl`

Until a product has real pricing and Square mappings, its purchase action stays disabled.

For local catalog testing, open the site with:

```text
?admin=1
```

and use **Import store.json**. The imported catalog is kept in localStorage and can be reset to the bundled catalog.

## GitHub Pages

Repository:

```text
https://github.com/aerovista-us/northline
```

The included Pages workflow deploys the repository root on pushes to `main`.

Expected default Pages URL once GitHub Pages is enabled for **GitHub Actions**:

```text
https://aerovista-us.github.io/northline/
```

A custom AeroVista domain can be added later without changing the application architecture.

## Before public launch

- Replace the demo bed with the approved Northline master.
- Add the five remaining MP3 masters.
- Add production garment variants, prices and Square mappings to `store.json`.
- Confirm `api.aerovista.us` CORS permits the final public Northline origin.
- Test iOS Safari and Android Chrome audio behavior on physical devices.
- Add the final analytics event taxonomy only after release behavior is locked.

© 2026 AeroVista / EchoVerse Audio.
