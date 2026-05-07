const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { extractStream } = require('./extractor');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // cache 1h

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Health ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'streamflix-scraper', timestamp: new Date().toISOString() });
});

// ── GET /extract?type=movie|tv&imdb=tt...&tmdb=...&season=1&episode=1 ──
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
    console.log(`[EXTRACT] ${type} imdb=${imdb} tmdb=${tmdb} s${season}e${episode}`);
    const result = await extractStream({ type, imdb, tmdb, season: parseInt(season), episode: parseInt(episode) });

    if (result.sources?.length > 0) {
      cache.set(cacheKey, result);
    }

    return res.json({ success: true, cached: false, ...result });
  } catch (err) {
    console.error('[ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Streamflix Scraper rodando na porta ${PORT}`);
});
