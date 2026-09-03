const API_ORIGIN = 'https://api.aerovista.us'
const STORE_ID = 'northline'
const SOURCE_CATALOG_URL = 'https://northline.aerovista.us/store.json'
const SUCCESS_URL = 'https://northline.aerovista.us/?checkout=success'
const CANCEL_URL = 'https://northline.aerovista.us/#store'

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

async function readJson(response, fallback = {}) {
  try {
    return await response.json()
  } catch {
    return fallback
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init)
  const body = await readJson(response)
  if (!response.ok) {
    const message = body.message || body.error || `Upstream request failed (${response.status}).`
    const error = new Error(message)
    error.status = response.status
    error.body = body
    throw error
  }
  return body
}

async function sourceCatalog() {
  return fetchJson(SOURCE_CATALOG_URL, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 30, cacheEverything: true },
  })
}

async function normalizedCatalog() {
  return fetchJson(`${API_ORIGIN}/v1/storefront/${STORE_ID}/catalog`, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 30, cacheEverything: true },
  })
}

function availablePairs(catalog) {
  const pairs = new Set()
  for (const product of catalog.products || []) {
    if (product.visibility !== 'visible' || product.availability !== 'available') continue
    for (const variant of product.variants || []) {
      if (variant.availability === 'available') pairs.add(`${product.id}\n${variant.id}`)
    }
  }
  return pairs
}

function sourceEntries(catalog) {
  const entries = []
  for (const product of catalog.products || []) {
    for (const variant of product.variants || []) {
      entries.push({ product, variant })
    }
  }
  return entries
}

function findSourceLine(entries, line) {
  let candidates = entries
  if (line.productId) candidates = candidates.filter(({ product }) => product.id === line.productId)
  if (line.variationId) {
    const byVariation = candidates.filter(({ variant }) => variant.squareVariationId === line.variationId)
    if (byVariation.length === 1) return byVariation[0]
    if (byVariation.length > 1) candidates = byVariation
  }
  if (line.sku) {
    const bySku = candidates.filter(({ variant }) => variant.cartKey === line.sku || variant.id === line.sku)
    if (bySku.length === 1) return bySku[0]
    if (bySku.length > 1) candidates = bySku
  }
  if (line.variantId) {
    const byId = candidates.filter(({ variant }) => variant.id === line.variantId)
    if (byId.length === 1) return byId[0]
  }
  return null
}

async function bootstrap() {
  const [source, normalized] = await Promise.all([sourceCatalog(), normalizedCatalog()])
  const available = availablePairs(normalized)
  const sellableCartKeys = sourceEntries(source)
    .filter(({ product, variant }) =>
      product.publicVisible !== false &&
      product.checkoutReady !== false &&
      variant.checkoutReady !== false &&
      variant.cartKey &&
      available.has(`${product.id}\n${variant.id}`)
    )
    .map(({ variant }) => variant.cartKey)

  return json({
    ok: true,
    storeId: STORE_ID,
    currency: normalized.currency || source.currency || 'USD',
    sellableCartKeys: [...new Set(sellableCartKeys)],
    commerceVersion: 'v1',
  })
}

async function legacyCheckout(request) {
  const payload = await request.json().catch(() => null)
  if (!payload || !Array.isArray(payload.cart) || !payload.cart.length || payload.cart.length > 50) {
    return json({ ok: false, error: 'A valid cart is required.' }, 400)
  }

  const source = await sourceCatalog()
  const entries = sourceEntries(source)
  const items = []

  for (let index = 0; index < payload.cart.length; index += 1) {
    const line = payload.cart[index] || {}
    const match = findSourceLine(entries, line)
    const quantity = Number(line.qty || line.quantity || 0)
    if (!match || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) {
      return json({ ok: false, error: 'One or more cart items are no longer available.' }, 422)
    }
    items.push({
      lineId: `legacy-${index + 1}-${crypto.randomUUID()}`,
      productId: match.product.id,
      variantId: match.variant.id,
      quantity,
    })
  }

  const quote = await fetchJson(`${API_ORIGIN}/v1/cart/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      currency: payload.currency || source.currency || 'USD',
      items,
    }),
  })

  if (!quote.checkoutEligible) {
    return json({ ok: false, error: 'One or more cart items are not available for checkout.' }, 422)
  }

  const checkout = await fetchJson(`${API_ORIGIN}/v1/checkout/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': `legacy-${STORE_ID}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      storeId: STORE_ID,
      quoteId: quote.quoteId,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    }),
  })

  return json({
    ok: true,
    checkoutUrl: checkout.checkoutUrl,
    sessionId: checkout.sessionId,
    quoteId: quote.quoteId,
  })
}

async function proxyV1(request, url) {
  const target = `${API_ORIGIN}${url.pathname}${url.search}`
  const headers = new Headers(request.headers)
  headers.set('Host', 'api.aerovista.us')
  headers.delete('cf-connecting-ip')
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow',
  })
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/square/bootstrap' && request.method === 'GET') return bootstrap()
      if (url.pathname === '/api/square/checkout' && request.method === 'POST') return legacyCheckout(request)
      if (url.pathname.startsWith('/v1/')) return proxyV1(request, url)
      return new Response('Not Found', { status: 404 })
    } catch (error) {
      const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 502
      return json({
        ok: false,
        error: error.message || 'Commerce is temporarily unavailable.',
        code: error.body && error.body.code ? error.body.code : 'COMMERCE_UNAVAILABLE',
      }, status)
    }
  },
}
