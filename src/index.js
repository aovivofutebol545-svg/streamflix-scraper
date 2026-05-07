const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { extractStream } = require('./extractor');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // cache 1h

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'streamflix-scraper', timestamp: new Date().toISOString() });
});

// GET /extract?type=movie|tv&imdb=tt...&tmdb=...&season=1&episode=1
app.get('/extract', async (req, res) => {
  const { type = 'movie', imdb, tmdb, season = '1', episode = '1' } = req.query;

  if (!imdb && !tmdb) {
    return res.status(400).json({ success: false, error: 'Precisa de imdb ou tmdb' });
  }

  const cacheKey = `${type}-${imdb || tmdb}-s${season}e${episode}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] ${cacheKey}`);
    return res.json({ success: true, cached: true, ...cached });
  }

  try {
    console.log(`\n============================`);
    console.log(`[REQUEST] ${type} imdb=${imdb} tmdb=${tmdb} s${season}e${episode}`);
    console.log(`============================`);

    const result = await extractStream({
      type,
      imdb,
      tmdb,
      season: parseInt(season),
      episode: parseInt(episode),
    });

    if (result.sources?.length > 0) {
      cache.set(cacheKey, result);
      console.log(`[CACHED] ${cacheKey} — ${result.sources.length} fonte(s)`);
    }

    return res.json({ success: true, cached: false, ...result });
  } catch (err) {
    console.error('[ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /cache/clear — limpar cache
app.post('/cache/clear', (req, res) => {
  cache.flushAll();
  res.json({ success: true, message: 'Cache limpo' });
});

// GET /cache/stats
app.get('/cache/stats', (req, res) => {
  res.json({ success: true, stats: cache.getStats() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎬 Streamflix Scraper rodando na porta ${PORT}\n`);
});
