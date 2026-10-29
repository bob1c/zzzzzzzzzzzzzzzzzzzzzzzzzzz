// PULSE (GitHub-режим): один проход по источникам -> data/items.json. Запускается GitHub Actions.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch {}
const E = process.env, PORT = E.PORT || 3000, MAX_AGE = 12 * 3600e3;
const UA = 'Mozilla/5.0 (compatible; PulseBot/1.0)';
const gn = (q, lang = 'ru', gl = 'RU') => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:12h')}&hl=${lang}&gl=${gl}&ceid=${gl}:${lang}`;

// ===== ИСТОЧНИКИ: добавляй свои строки. every = пауза опроса в секундах =====
const S = [
  // Новости (RSS)
  ...[['BBC', 'https://feeds.bbci.co.uk/news/world/rss.xml'], ['Lenta.ru', 'https://lenta.ru/rss/news'], ['РИА Новости', 'https://ria.ru/export/rss2/archive/index.xml'],
  ['ТАСС', 'https://tass.ru/rss/v2.xml'], ['Интерфакс', 'https://www.interfax.ru/rss.asp'], ['Meduza', 'https://meduza.io/rss/all'], ['РБК', 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss'],
  ['Коммерсантъ', 'https://www.kommersant.ru/RSS/news.xml'], ['DW', 'https://rss.dw.com/rdf/rss-ru-all'], ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml'],
  ['CNN', 'http://rss.cnn.com/rss/edition.rss'], ['NYT', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'], ['Guardian', 'https://www.theguardian.com/world/rss'],
  ['Reuters', gn('site:reuters.com', 'en', 'US')], ['AP', gn('site:apnews.com', 'en', 'US')], ['Bloomberg', gn('site:bloomberg.com', 'en', 'US')]]
    .map(([name, url]) => ({ t: 'rss', cat: 'news', name, url, every: 30 })),
  // Telegram-каналы (публичные, через t.me/s/). Добавляй любые username.
  ...[['rian_ru', 'news'], ['tass_agency', 'news'], ['bbcrussian', 'news'], ['meduzalive', 'news'], ['rbc_news', 'news'], ['breakingmash', 'news'], ['readovkanews', 'news'], ['Cbpub', 'news']]
    .map(([u, cat]) => ({ t: 'tg', cat, name: 'TG @' + u, url: 'https://t.me/s/' + u, every: 20 })),
  // Мемы
  ...['memes', 'dankmemes', 'funny', 'me_irl', 'ProgrammerHumor', 'Pikabu', 'KGBTR'].map(r => ({ t: 'reddit', cat: 'memes', name: 'r/' + r, url: `https://www.reddit.com/r/${r}/hot.json?limit=25`, every: 45 })),
  // Тренды
  { t: 'rss', cat: 'trends', name: 'Google Trends RU', url: 'https://trends.google.com/trending/rss?geo=RU', every: 120 },
  { t: 'rss', cat: 'trends', name: 'Google Trends US', url: 'https://trends.google.com/trending/rss?geo=US', every: 120 },
  { t: 'rss', cat: 'trends', name: 'Hacker News', url: 'https://hnrss.org/frontpage', every: 60 },
  ...['popular', 'all'].map(r => ({ t: 'reddit', cat: 'trends', name: 'Reddit ' + r, url: `https://www.reddit.com/r/${r}/rising.json?limit=25`, every: 45 })),
  { t: 'yt', cat: 'trends', name: 'YouTube RU', region: 'RU', every: 300 },
  { t: 'yt', cat: 'trends', name: 'YouTube US', region: 'US', every: 300 },
  { t: 'tiktok', cat: 'trends', name: 'TikTok', every: Math.ceil(86400 / 45) }, // ~45 запросов/сутки из лимита 50
  // Персоны: что говорят и показывают
  ...[['Илон Маск', 'Elon Musk'], ['Трамп', 'Donald Trump'], ['Путин', 'Putin'], ['Зеленский', 'Zelensky'], ['Байден', 'Biden'], ['Марк Цукерберг', 'Zuckerberg'], ['Сэм Альтман', 'Sam Altman'], ['Дуров', 'Pavel Durov']]
    .flatMap(([p, q]) => [{ t: 'rss', cat: 'people', person: p, name: 'GNews RU', url: gn(q), every: 40 }, { t: 'rss', cat: 'people', person: p, name: 'GNews EN', url: gn(q, 'en', 'US'), every: 40 }]),
  ...[['Илон Маск', 'elonmusk'], ['Трамп', 'realDonaldTrump']].map(([p, u]) => ({ t: 'rss', cat: 'people', person: p, name: 'X @' + u, url: `https://nitter.net/${u}/rss`, every: 60 })),
];
// YouTube-каналы без API-ключа: YT_CHANNELS=UCxxx,UCyyy  (cat = trends)
(E.YT_CHANNELS || '').split(',').filter(Boolean).forEach(id => S.push({ t: 'rss', cat: 'trends', name: 'YouTube канал', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id, every: 60 }));

// ===== Парсеры =====
const tag = (s, t) => { const m = s.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>', 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
const dec = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const rss = x => (x.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []).map(b => ({
  title: dec(tag(b, 'title')),
  link: (tag(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '').trim(),
  ts: Date.parse(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')),
  img: (b.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*url="([^"]+)"/i) || [])[1],
}));
const get = async (url, opt = {}) => { const r = await fetch(url, { headers: { 'user-agent': UA, ...opt.headers }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(r.status); return r; };

async function fetchSrc(s) {
  if (s.t === 'rss') return rss(await (await get(s.url)).text());
  if (s.t === 'tg') {
    const h = await (await get(s.url)).text();
    return h.split('tgme_widget_message_wrap').slice(1).map(b => {
      const post = (b.match(/data-post="([^"]+)"/) || [])[1], txt = (b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/) || [])[1];
      const img = (b.match(/background-image:url\('([^']+)'\)/) || [])[1];
      return post && (txt || img) ? { title: dec(txt || 'Фото/видео').slice(0, 280), link: 'https://t.me/' + post, ts: Date.parse((b.match(/<time[^>]*datetime="([^"]+)"/) || [])[1]), img } : null;
    }).filter(Boolean);
  }
  if (s.t === 'reddit') {
    const j = await (await get(s.url)).json();
    return j.data.children.map(c => c.data).map(d => ({ title: d.title, link: 'https://reddit.com' + d.permalink, ts: d.created_utc * 1000, hot: d.score,
      img: /\.(jpe?g|png|gif|webp)$/i.test(d.url) ? d.url : (d.preview?.images?.[0]?.source?.url || '').replace(/&amp;/g, '&') || undefined }));
  }
  if (s.t === 'yt') {
    if (!E.YT_KEY) return [];
    const j = await (await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${s.region}&maxResults=50&key=${E.YT_KEY}`)).json();
    return (j.items || []).map(v => ({ title: v.snippet.title, link: 'https://youtu.be/' + v.id, ts: Date.parse(v.snippet.publishedAt), hot: +v.statistics.viewCount, img: v.snippet.thumbnails?.medium?.url }));
  }
  if (s.t === 'tiktok') { // подстрой под свой API: TIKTOK_URL + TIKTOK_KEY. Ответ ожидается как массив видео.
    if (!E.TIKTOK_URL) return [];
    const day = new Date().toISOString().slice(0, 10); tt.d !== day && (tt.d = day, tt.n = 0);
    if (tt.n >= 48) return []; tt.n++;
    const j = await (await get(E.TIKTOK_URL, { headers: { authorization: 'Bearer ' + (E.TIKTOK_KEY || ''), 'x-api-key': E.TIKTOK_KEY || '' } })).json();
    return (j.data?.videos || j.data || j.videos || j.items || []).map(v => ({ title: v.title || v.desc || v.description || 'TikTok', link: v.share_url || v.url || v.link, ts: (v.create_time || v.created_at) * 1000 || Date.now(), hot: v.play_count || v.views, img: v.cover || v.thumbnail }));
  }
  return [];
}
const tt = { d: '', n: 0 };


// ===== Сборка =====
const OUT = path.join(__dirname, 'data', 'items.json');
let db = { items: [], posted: [], last: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(OUT, 'utf8')) }; } catch {}
const map = new Map(db.items.map(i => [i.id, i])), fresh = [], first = map.size === 0;
async function tgPost(it) {
  if (!E.BOT_TOKEN || !E.CHANNEL_ID) throw new Error('BOT_TOKEN / CHANNEL_ID не заданы в Secrets');
  const text = `${it.person ? '👤 ' + it.person + '\n' : ''}${it.title}\n\n${it.link}`;
  const r = await (await fetch(`https://api.telegram.org/bot${E.BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: E.CHANNEL_ID, text }) })).json();
  if (!r.ok) throw new Error(r.description);
}
function add(s, x) {
  if (!x.title || !x.link || !x.ts || isNaN(x.ts) || Date.now() - x.ts > MAX_AGE || x.ts > Date.now() + 6e4) return;
  const id = crypto.createHash('sha1').update(x.link).digest('hex').slice(0, 12);
  if (map.has(id)) { if (x.hot) map.get(id).hot = x.hot; return; }
  const it = { id, title: x.title.slice(0, 300), link: x.link, ts: x.ts, img: x.img, hot: x.hot, cat: s.cat, src: s.name, person: s.person };
  map.set(id, it); fresh.push(it);
}
(async () => {
  if (process.argv[2] === 'post') {
    const it = map.get(process.argv[3]); if (!it) { console.log('запись уже устарела'); process.exit(1); }
    await tgPost(it); console.log('отправлено:', it.title); return;
  }
  const now = Date.now();
  await Promise.all(S.filter(s => now - (db.last[s.t + s.name + (s.url || s.region)] || 0) >= s.every * 1000 - 5000).map(async s => {
    db.last[s.t + s.name + (s.url || s.region)] = now;
    try { (await fetchSrc(s)).forEach(x => add(s, x)); } catch (e) { console.log('x', s.name, e.message); }
  }));
  if (E.AUTO_POST === '1' && !first) {
    const cats = (E.AUTO_CATS || 'news').split(',');
    for (const it of fresh.filter(i => cats.includes(i.cat)).slice(0, 5)) { try { await tgPost(it); db.posted.push(it.id); } catch (e) { console.log('post:', e.message); } }
  }
  const list = [...map.values()].filter(i => Date.now() - i.ts < MAX_AGE).sort((a, b) => b.ts - a.ts).slice(0, 1500);
  const ids = new Set(list.map(i => i.id));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: Date.now(), items: list, posted: db.posted.filter(i => ids.has(i)), last: db.last }));
  console.log(`новых: ${fresh.length}, всего: ${list.length}`);
})();
