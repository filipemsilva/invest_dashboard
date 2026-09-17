/**
 * server.js — API proxy para Yahoo Finance
 *
 * Endpoints:
 *   GET /health                                  → liveness probe  { status: 'ok' }
 *   GET /api/prices?symbols=A,B,C,…             → cotações actuais (formato simples)
 *   GET /api/charts?symbols=A,B,C,…             → cotações actuais (formato completo, usado pelo frontend)
 *   GET /api/chart/:symbol                       → cotação individual (fallback do frontend)
 *   GET /api/historical?ticker=AAPL&year=2023   → preço de fecho de 31 Dez
 *
 * Porta: 0.0.0.0:3000
 * Runtime: Node.js 18+ (usa fetch nativo — sem node-fetch)
 */

import express from 'express';

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://filipeinv.duckdns.org';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Cache em memória (5 minutos) ─────────────────────────────────────────────
// 5 min para cotações actuais — partilhada entre separadores/dispositivos.
// O frontend tem a sua própria cache de 30 min em localStorage.
const CACHE_TTL_MS = 5 * 60_000;
const priceCache   = new Map();
// Map<symbol, { price, currency, name, changePercent, cachedAt }>

function getFromCache(sym) {
  const entry = priceCache.get(sym);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    priceCache.delete(sym);
    return null;
  }
  const { cachedAt: _c, ...data } = entry;
  return data;
}

function setInCache(sym, data) {
  priceCache.set(sym, { ...data, cachedAt: Date.now() });
}

// ─── Headers para o Yahoo Finance ─────────────────────────────────────────────
const YF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com/',
};

// ─── Core: fetch + parse de um único símbolo ──────────────────────────────────
/**
 * Retorna { price, currency, name, changePercent } ou null.
 * Tenta query1 → query2 como fallback.
 */
async function fetchSymbol(sym) {
  const enc  = encodeURIComponent(sym);
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=1d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: YF_HEADERS,
        signal:  AbortSignal.timeout(8_000),
      });

      if (res.status === 429) {
        console.warn(`[fetch] ${sym}: rate-limited (429)`);
        return null;
      }
      if (!res.ok) {
        console.warn(`[fetch] ${sym}: HTTP ${res.status} — a tentar fallback`);
        continue;
      }

      const json     = await res.json();
      const meta     = json?.chart?.result?.[0]?.meta;
      const price    = meta?.regularMarketPrice ?? meta?.previousClose ?? null;

      if (price == null) {
        console.warn(`[fetch] ${sym}: sem preço — a tentar fallback`);
        continue;
      }

      const prevClose     = meta.previousClose ?? meta.chartPreviousClose ?? null;
      const changePercent = prevClose
        ? ((price - prevClose) / prevClose) * 100
        : null;

      return {
        price:         Math.round(price * 10000) / 10000,
        currency:      meta.currency || 'USD',
        name:          meta.longName || meta.shortName || null,
        changePercent: changePercent !== null
          ? Math.round(changePercent * 100) / 100
          : null,
      };
    } catch (err) {
      console.warn(`[fetch] ${sym}: ${err.message}`);
    }
  }

  console.error(`[fetch] ${sym}: falhou em todos os URLs — omitido`);
  return null;
}

// ─── Processamento em lotes ────────────────────────────────────────────────────
const CHUNK_SIZE  = 5;   // símbolos em paralelo por chunk
const CHUNK_DELAY = 150; // ms entre chunks

async function fetchAll(symbols) {
  const result  = {};
  const toFetch = [];

  // Servir da cache o que já tivermos
  for (const sym of symbols) {
    const cached = getFromCache(sym);
    if (cached) {
      result[sym] = cached;
    } else {
      toFetch.push(sym);
    }
  }

  // Fetch em chunks com pausa entre eles
  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk   = toFetch.slice(i, i + CHUNK_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (sym) => ({ sym, data: await fetchSymbol(sym) }))
    );

    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      const { sym, data } = r.value;
      if (data !== null) {
        setInCache(sym, data);
        result[sym] = data;
      }
    }

    if (i + CHUNK_SIZE < toFetch.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY));
    }
  }

  return result;
}

// ─── Validação de parâmetro "symbols" ─────────────────────────────────────────
function parseSymbols(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  const symbols = [...new Set(
    raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  )];
  if (symbols.length === 0 || symbols.length > 100) return null;
  return symbols;
}

// ─── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── GET /api/prices ──────────────────────────────────────────────────────────
// Formato simples: { SYM: { price, currency } }
app.get('/api/prices', async (req, res) => {
  const symbols = parseSymbols(req.query.symbols);
  if (!symbols) {
    return res.status(400).json({ error: 'Parâmetro "symbols" inválido. Exemplo: ?symbols=AAPL,NVG.LS' });
  }
  try {
    const all = await fetchAll(symbols);
    // Retorna apenas price + currency (formato original, compatibilidade)
    const out = {};
    for (const [sym, d] of Object.entries(all)) {
      out[sym] = { price: d.price, currency: d.currency };
    }
    res.json(out);
  } catch (err) {
    console.error('[/api/prices]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── GET /api/charts ──────────────────────────────────────────────────────────
// Formato completo: { SYM: { price, currency, name, changePercent } }
// Usado pelo priceService.js do frontend
app.get('/api/charts', async (req, res) => {
  const symbols = parseSymbols(req.query.symbols);
  if (!symbols) {
    return res.status(400).json({ error: 'Parâmetro "symbols" inválido. Exemplo: ?symbols=AAPL,NVG.LS' });
  }
  try {
    const prices = await fetchAll(symbols);
    res.json(prices);
  } catch (err) {
    console.error('[/api/charts]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── GET /api/chart/:symbol ───────────────────────────────────────────────────
// Ticker individual — usado como fallback pelo priceService.js
// Devolve formato compatível com Yahoo Finance v8/chart para reutilizar parseMeta()
app.get('/api/chart/:symbol', async (req, res) => {
  const sym = req.params.symbol?.trim().toUpperCase();
  if (!sym) return res.status(400).json({ error: 'Símbolo inválido' });

  try {
    // Verifica cache primeiro
    const cached = getFromCache(sym);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      // Devolve formato compatível com Yahoo v8/chart
      return res.json({
        chart: { result: [{ meta: {
          regularMarketPrice: cached.price,
          currency:           cached.currency,
          longName:           cached.name,
          previousClose:      null,
        }}]}
      });
    }

    const data = await fetchSymbol(sym);
    if (!data) {
      return res.status(404).json({ error: `Sem cotação para ${sym}` });
    }

    setInCache(sym, data);
    res.setHeader('X-Cache', 'MISS');
    res.json({
      chart: { result: [{ meta: {
        regularMarketPrice: data.price,
        currency:           data.currency,
        longName:           data.name,
        previousClose:      null,
      }}]}
    });
  } catch (err) {
    console.error(`[/api/chart/${sym}]`, err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── GET /api/historical ──────────────────────────────────────────────────────
// Preço de fecho do último dia de negociação de um ano
// Usado por useHistoricalPrices.js do frontend
app.get('/api/historical', async (req, res) => {
  const { ticker, year } = req.query;

  if (!ticker || !year) {
    return res.status(400).json({ error: '"ticker" e "year" são obrigatórios' });
  }

  const y           = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(y) || y < 1970 || y > currentYear) {
    return res.status(400).json({ error: `"year" deve ser um inteiro entre 1970 e ${currentYear}` });
  }

  const enc = encodeURIComponent(ticker.trim().toUpperCase());
  // Janela: 27 Dez → 3 Jan do ano seguinte (captura o último dia útil do ano)
  const p1  = Math.floor(new Date(y, 11, 27).getTime() / 1000);
  const p2  = Math.floor(new Date(y + 1, 0, 3).getTime() / 1000);

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&period1=${p1}&period2=${p2}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&period1=${p1}&period2=${p2}`,
  ];

  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        headers: YF_HEADERS,
        signal:  AbortSignal.timeout(10_000),
      });

      if (upstream.status === 429) return res.status(429).json({ error: 'rate-limited' });
      if (!upstream.ok) {
        console.warn(`[historical] ${ticker}/${y}: HTTP ${upstream.status}`);
        continue;
      }

      const json       = await upstream.json();
      const result     = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps = result.timestamp || [];
      const closes     = result.indicators?.quote?.[0]?.close || [];
      const currency   = result.meta?.currency || 'USD';
      const dec31      = Math.floor(new Date(y, 11, 31, 23, 59, 59).getTime() / 1000);

      // Encontra o último fecho antes ou até 31 Dez
      let lastPrice = null;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] <= dec31 && closes[i] != null) {
          lastPrice = closes[i];
        }
      }

      if (lastPrice !== null) {
        return res.json({ price: Math.round(lastPrice * 10000) / 10000, currency });
      }
    } catch (err) {
      console.warn(`[historical] ${ticker}/${y}: ${err.message}`);
    }
  }

  res.status(404).json({ error: `Sem dados históricos para ${ticker}/${y}` });
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 API a escutar em http://0.0.0.0:${PORT}`);
  console.log(`   GET /health`);
  console.log(`   GET /api/prices?symbols=AAPL,NVG.LS,…       (price + currency)`);
  console.log(`   GET /api/charts?symbols=AAPL,NVG.LS,…       (price + currency + name + changePercent)`);
  console.log(`   GET /api/chart/:symbol                        (ticker individual)`);
  console.log(`   GET /api/historical?ticker=AAPL&year=2023    (fecho de ano)`);
  console.log(`   Cache TTL: ${CACHE_TTL_MS / 1000}s | Chunk: ${CHUNK_SIZE} | Delay: ${CHUNK_DELAY}ms`);
  console.log(`   CORS: ${ALLOWED_ORIGIN}\n`);
});
