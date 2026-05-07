const { chromium } = require('playwright');

function buildTargets({ type, imdb, tmdb, season, episode }) {
  const targets = [];

  if (type === 'movie') {
    if (imdb) {
      targets.push({ label: '🇧🇷 SuperFlix',     url: `https://superflixapi.dev/filme/${imdb}`,              ptbr: true });
      targets.push({ label: '🇧🇷 WarezCDN',      url: `https://embed.warezcdn.link/filme/${imdb}`,           ptbr: true });
      targets.push({ label: '🇧🇷 CineHD',        url: `https://cinemahdplus.xyz/embed/movie/${imdb}`,        ptbr: true });
      targets.push({ label: 'VidSrc.to',          url: `https://vidsrc.to/embed/movie/${imdb}`,              ptbr: false });
      targets.push({ label: 'VidSrc.xyz',         url: `https://vidsrc.xyz/embed/movie/${imdb}`,             ptbr: false });
      targets.push({ label: 'EmbedSU',            url: `https://embed.su/embed/movie/${imdb}`,               ptbr: false });
      targets.push({ label: 'VidSrc.me',          url: `https://vidsrc.me/embed/movie?imdb=${imdb}`,         ptbr: false });
      targets.push({ label: '2Embed',             url: `https://www.2embed.cc/embed/${imdb}`,                ptbr: false });
    }
    if (tmdb) {
      targets.push({ label: '🇧🇷 SuperFlix TMDB', url: `https://superflixapi.dev/filme/${tmdb}`,             ptbr: true });
      targets.push({ label: 'MultiEmbed',         url: `https://multiembed.mov/?video_id=${tmdb}&tmdb=1`,    ptbr: false });
      targets.push({ label: 'Smashy',             url: `https://player.smashy.stream/movie/${tmdb}`,         ptbr: false });
    }
  } else {
    if (imdb) {
      targets.push({ label: '🇧🇷 SuperFlix',     url: `https://superflixapi.dev/serie/${imdb}/${season}/${episode}`,        ptbr: true });
      targets.push({ label: '🇧🇷 WarezCDN',      url: `https://embed.warezcdn.link/serie/${imdb}/${season}/${episode}`,     ptbr: true });
      targets.push({ label: 'VidSrc.to',          url: `https://vidsrc.to/embed/tv/${imdb}/${season}/${episode}`,           ptbr: false });
      targets.push({ label: 'VidSrc.xyz',         url: `https://vidsrc.xyz/embed/tv/${imdb}/${season}/${episode}`,          ptbr: false });
      targets.push({ label: 'EmbedSU',            url: `https://embed.su/embed/tv/${imdb}/${season}/${episode}`,            ptbr: false });
      targets.push({ label: 'VidSrc.me',          url: `https://vidsrc.me/embed/tv?imdb=${imdb}&season=${season}&episode=${episode}`, ptbr: false });
    }
    if (tmdb) {
      targets.push({ label: '🇧🇷 SuperFlix TMDB', url: `https://superflixapi.dev/serie/${tmdb}/${season}/${episode}`,       ptbr: true });
      targets.push({ label: 'MultiEmbed',         url: `https://multiembed.mov/?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`, ptbr: false });
      targets.push({ label: 'Smashy',             url: `https://player.smashy.stream/tv/${tmdb}?s=${season}&e=${episode}`,  ptbr: false });
    }
  }

  return targets;
}

const BLOCKED_DOMAINS = [
  'googlesyndication', 'doubleclick', 'googletagmanager', 'google-analytics',
  'facebook.net', 'adservice', 'popads', 'popcash', 'propellerads', 'adnxs',
  'adsystem', 'adserver', 'monetag', 'exosrv', 'hilltopads', 'trafficjunky',
  'mgid.com', 'realsrv', 'adclick', 'popunder', 'clickunder', 'pushnotif',
  'browser-update', 'adcash', 'bidvertiser', 'yllix', 'exoclick',
];

const STREAM_EXTENSIONS = ['.m3u8', '.mp4', '.mkv', '.webm'];

function isStreamUrl(url) {
  return (
    STREAM_EXTENSIONS.some((ext) => url.includes(ext)) &&
    !url.includes('googlevideo') &&
    !url.includes('ytimg') &&
    !BLOCKED_DOMAINS.some((d) => url.includes(d))
  );
}

async function scrapeTarget(target) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--disable-background-networking', '--disable-default-apps',
      '--mute-audio',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  });

  // Bloquear anúncios e recursos desnecessários
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();

    // Bloquear domínios de anúncio
    if (BLOCKED_DOMAINS.some((d) => url.includes(d))) return route.abort();

    // Bloquear recursos pesados que não precisamos
    if (['font', 'stylesheet', 'image'].includes(type)) return route.abort();

    return route.continue();
  });

  const page = await context.newPage();
  const foundStreams = [];

  // Interceptar requests de rede
  page.on('request', (req) => {
    const url = req.url();
    if (isStreamUrl(url) && !foundStreams.includes(url)) {
      console.log(`  [REQ STREAM] ${url.slice(0, 120)}`);
      foundStreams.push(url);
    }
  });

  // Interceptar responses (JSON com URLs de stream)
  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('application/json') || ct.includes('javascript') || ct.includes('text/plain')) {
      try {
        const text = await res.text().catch(() => '');
        const matches = text.match(/https?:\/\/[^\s"'\\,\]]+\.(m3u8|mp4)[^\s"'\\,\]]*/gi) || [];
        matches.forEach((u) => {
          if (!foundStreams.includes(u) && isStreamUrl(u)) {
            console.log(`  [JSON STREAM] ${u.slice(0, 120)}`);
            foundStreams.push(u);
          }
        });
      } catch {}
    }
  });

  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Tentar clicar no play
    const playSelectors = [
      '.jw-icon-display', '.vjs-big-play-button', '.plyr__control--overlaid',
      'button.play', '#play', '[data-plyr="play"]', '.play-button',
      'button:has-text("Assistir")', 'button:has-text("Play")',
      '[aria-label*="play" i]', '[class*="play"][class*="btn"]',
      '.overlay-play', '.video-play-button',
    ];

    for (const sel of playSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click({ timeout: 2000 }).catch(() => {});
          console.log(`  [CLICKED] ${sel}`);
          await page.waitForTimeout(4000);
          if (foundStreams.length > 0) break;
        }
      } catch {}
    }

    // Aguardar mais um pouco
    await page.waitForTimeout(3000);

    // Tentar extrair via JS do player
    if (foundStreams.length === 0) {
      const jsStreams = await page.evaluate(() => {
        const found = [];
        // JWPlayer
        try { const s = window.jwplayer?.()?.getPlaylistItem?.()?.file; if (s) found.push(s); } catch {}
        // VideoJS
        try { const s = window.videojs?.players; if (s) Object.values(s).forEach((p) => { const src = p?.src?.(); if (src) found.push(typeof src === 'string' ? src : src.src); }); } catch {}
        // Plyr
        try { if (window.player?.media?.src) found.push(window.player.media.src); } catch {}
        // Generic video elements
        document.querySelectorAll('video').forEach((v) => {
          if (v.src && v.src.includes('http')) found.push(v.src);
          v.querySelectorAll('source').forEach((s) => { if (s.src) found.push(s.src); });
        });
        return found.filter(Boolean);
      }).catch(() => []);

      jsStreams.forEach((u) => {
        if (!foundStreams.includes(u)) foundStreams.push(u);
      });
    }

  } catch (err) {
    console.log(`  [PAGE ERROR] ${err.message}`);
  } finally {
    await browser.close();
  }

  return [...new Set(foundStreams)];
}

async function extractStream({ type, imdb, tmdb, season = 1, episode = 1 }) {
  const targets = buildTargets({ type, imdb, tmdb, season, episode });
  const allSources = [];
  let bestStream = null;

  for (const target of targets) {
    console.log(`\n[TRYING] ${target.label} — ${target.url}`);
    try {
      const streams = await scrapeTarget(target);

      if (streams.length > 0) {
        console.log(`[SUCCESS] ${target.label} — ${streams.length} stream(s)`);

        const m3u8 = streams.find((s) => s.includes('.m3u8'));
        const mp4  = streams.find((s) => s.includes('.mp4'));
        const best = m3u8 || mp4 || streams[0];

        allSources.push({
          label:     target.label,
          url:       best,
          directUrl: best,
          allUrls:   streams,
          ptbr:      target.ptbr,
          type:      best.includes('.m3u8') ? 'hls' : 'mp4',
        });

        if (!bestStream && target.ptbr) bestStream = best;
        if (!bestStream) bestStream = best;

        // Tem PT-BR? Para.
        if (allSources.filter((s) => s.ptbr).length >= 1) {
          console.log('[DONE] PT-BR encontrado, parando');
          break;
        }
      } else {
        console.log(`[EMPTY] ${target.label}`);
      }
    } catch (err) {
      console.log(`[ERROR] ${target.label}: ${err.message}`);
    }
  }

  return {
    type,
    imdb:    imdb || null,
    tmdb:    tmdb || null,
    season:  type === 'tv' ? season : undefined,
    episode: type === 'tv' ? episode : undefined,
    playUrl: bestStream || null,
    sources: allSources,
    totalFound: allSources.length,
  };
}

module.exports = { extractStream };
