const { chromium } = require('playwright');

// Sites a tentar em ordem de prioridade (PT-BR primeiro)
function buildTargets({ type, imdb, tmdb, season, episode }) {
  const targets = [];

  if (type === 'movie') {
    if (imdb) {
      targets.push({ label: '🇧🇷 SuperFlix',  url: `https://superflixapi.dev/filme/${imdb}` });
      targets.push({ label: '🇧🇷 WarezCDN',   url: `https://embed.warezcdn.link/filme/${imdb}` });
      targets.push({ label: '🇧🇷 CineHD',     url: `https://cinemahdplus.xyz/embed/movie/${imdb}` });
    }
    if (tmdb) {
      targets.push({ label: '🇧🇷 SuperFlix TMDB', url: `https://superflixapi.dev/filme/${tmdb}` });
    }
    if (imdb) {
      targets.push({ label: 'VidSrc.to',  url: `https://vidsrc.to/embed/movie/${imdb}` });
      targets.push({ label: 'EmbedSU',    url: `https://embed.su/embed/movie/${imdb}` });
      targets.push({ label: 'VidSrc.xyz', url: `https://vidsrc.xyz/embed/movie/${imdb}` });
    }
    if (tmdb) {
      targets.push({ label: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdb}&tmdb=1` });
      targets.push({ label: 'Smashy',     url: `https://player.smashy.stream/movie/${tmdb}` });
    }
  } else {
    if (imdb) {
      targets.push({ label: '🇧🇷 SuperFlix',  url: `https://superflixapi.dev/serie/${imdb}/${season}/${episode}` });
      targets.push({ label: '🇧🇷 WarezCDN',   url: `https://embed.warezcdn.link/serie/${imdb}/${season}/${episode}` });
    }
    if (imdb) {
      targets.push({ label: 'VidSrc.to',  url: `https://vidsrc.to/embed/tv/${imdb}/${season}/${episode}` });
      targets.push({ label: 'EmbedSU',    url: `https://embed.su/embed/tv/${imdb}/${season}/${episode}` });
      targets.push({ label: 'VidSrc.xyz', url: `https://vidsrc.xyz/embed/tv/${imdb}/${season}/${episode}` });
    }
    if (tmdb) {
      targets.push({ label: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}` });
      targets.push({ label: 'Smashy',     url: `https://player.smashy.stream/tv/${tmdb}?s=${season}&e=${episode}` });
    }
  }

  return targets;
}

// Abre o site no headless browser e intercepta os requests de rede
async function scrapeStreamUrl(pageUrl, label) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 1280, height: 720 },
    // Bloqueia anúncios e trackers
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  // Bloquear recursos desnecessários (anúncios, trackers)
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const blocked = [
      'googlesyndication', 'doubleclick', 'googletagmanager',
      'google-analytics', 'facebook.net', 'adservice',
      'popads', 'popcash', 'propellerads', 'adnxs',
      'adsystem', 'adserver', 'monetag', 'exosrv',
      'hilltopads', 'trafficjunky', 'mgid.com',
    ];
    if (blocked.some((b) => url.includes(b))) {
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  const foundStreams = [];

  // Interceptar todas as requisições de rede e capturar m3u8/mp4
  page.on('request', (request) => {
    const url = request.url();
    if (
      (url.includes('.m3u8') || url.includes('.mp4') || url.includes('manifest')) &&
      !url.includes('googlevideo') &&
      !url.includes('ytimg') &&
      !url.includes('ads')
    ) {
      console.log(`[FOUND STREAM] ${url.substring(0, 100)}`);
      foundStreams.push(url);
    }
  });

  // Também interceptar responses pra pegar streams em JSON
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (
      (contentType.includes('application/json') || contentType.includes('text/javascript')) &&
      (url.includes('api') || url.includes('source') || url.includes('stream') || url.includes('player'))
    ) {
      try {
        const text = await response.text().catch(() => '');
        // Procura por URLs de stream dentro do JSON
        const m3u8Matches = text.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g) || [];
        const mp4Matches = text.match(/https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g) || [];
        [...m3u8Matches, ...mp4Matches].forEach((u) => {
          if (!foundStreams.includes(u)) {
            console.log(`[FOUND IN JSON] ${u.substring(0, 100)}`);
            foundStreams.push(u);
          }
        });
      } catch {}
    }
  });

  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 });

    // Tentar clicar no botão de play se existir
    const playSelectors = [
      'button.play', '.play-btn', '#play', '.jw-icon-display',
      'button[aria-label*="play"]', '.vjs-big-play-button',
      '.plyr__control--overlaid', '[data-plyr="play"]',
      'button:has-text("Assistir")', 'button:has-text("Play")',
    ];

    for (const sel of playSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(3000);
          break;
        }
      } catch {}
    }

    // Aguardar mais um pouco pra capturar streams lazy
    await page.waitForTimeout(5000);

  } catch (err) {
    console.log(`[TIMEOUT/ERROR] ${label}: ${err.message}`);
  } finally {
    await browser.close();
  }

  return [...new Set(foundStreams)]; // deduplicar
}

// Função principal — tenta cada target até encontrar stream
async function extractStream({ type, imdb, tmdb, season = 1, episode = 1 }) {
  const targets = buildTargets({ type, imdb, tmdb, season, episode });
  const allSources = [];
  let bestStream = null;

  for (const target of targets) {
    try {
      console.log(`\n[TRYING] ${target.label} — ${target.url}`);
      const streams = await scrapeStreamUrl(target.url, target.label);

      if (streams.length > 0) {
        console.log(`[SUCCESS] ${target.label} — ${streams.length} stream(s) encontrado(s)`);

        // Prefere m3u8 sobre mp4, e PT-BR sobre outros
        const m3u8 = streams.find((s) => s.includes('.m3u8'));
        const mp4 = streams.find((s) => s.includes('.mp4'));
        const best = m3u8 || mp4 || streams[0];

        allSources.push({
          label: target.label,
          url: best,
          directUrl: best,   // link direto — sem passar pelo site
          allUrls: streams,
          ptbr: target.label.includes('🇧🇷'),
          type: best.includes('.m3u8') ? 'hls' : 'mp4',
        });

        // Guarda o primeiro PT-BR encontrado como melhor
        if (!bestStream && target.label.includes('🇧🇷')) {
          bestStream = best;
        }
      } else {
        console.log(`[EMPTY] ${target.label} — nenhum stream encontrado`);
      }
    } catch (err) {
      console.log(`[ERROR] ${target.label}: ${err.message}`);
    }

    // Se já tem stream PT-BR, pode parar
    if (bestStream && allSources.filter((s) => s.ptbr).length >= 2) {
      console.log('[DONE] Stream PT-BR encontrado, parando busca');
      break;
    }
  }

  return {
    type,
    imdb: imdb || null,
    tmdb: tmdb || null,
    season: type === 'tv' ? season : undefined,
    episode: type === 'tv' ? episode : undefined,
    playUrl: bestStream || allSources[0]?.directUrl || null,
    sources: allSources,
    totalFound: allSources.length,
  };
}

module.exports = { extractStream };
