# Streamflix Scraper

Extrai links diretos `.m3u8`/`.mp4` de filmes e séries PT-BR usando Playwright headless.
Sem anúncios, sem redirects, sem abrir navegador.

## Endpoints

### `GET /extract`
Parâmetros:
- `type` — `movie` ou `tv`
- `imdb` — IMDB ID (ex: `tt1375666`)
- `tmdb` — TMDB ID (ex: `27205`)
- `season` — temporada (padrão: 1)
- `episode` — episódio (padrão: 1)

**Exemplo filme:**
```
GET /extract?type=movie&imdb=tt1375666&tmdb=27205
```

**Exemplo série:**
```
GET /extract?type=tv&imdb=tt0903747&tmdb=1396&season=1&episode=1
```

**Resposta:**
```json
{
  "success": true,
  "playUrl": "https://cdn.exemplo.com/inception.m3u8",
  "sources": [
    {
      "label": "🇧🇷 SuperFlix",
      "directUrl": "https://cdn.exemplo.com/inception.m3u8",
      "ptbr": true,
      "type": "hls"
    }
  ]
}
```

### `GET /health`
```json
{ "status": "ok" }
```

## Deploy no Railway

1. Crie conta em railway.app
2. New Project → Deploy from GitHub repo
3. Selecione este repositório
4. Railway detecta o Dockerfile automaticamente
5. Deploy!

## Integração no App

No `services/api.ts`:
```ts
const SCRAPER_URL = 'https://seu-scraper.railway.app';

export async function fetchStreamSources(type, tmdbId, imdbId, season=1, episode=1) {
  const params = new URLSearchParams({ type, tmdb: String(tmdbId) });
  if (imdbId) params.set('imdb', imdbId);
  if (type === 'tv') {
    params.set('season', String(season));
    params.set('episode', String(episode));
  }
  const res = await fetch(`${SCRAPER_URL}/extract?${params}`);
  const data = await res.json();
  return data.sources || [];
}
```
