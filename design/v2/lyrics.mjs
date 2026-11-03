// src/renderer/domain/lyrics/parse-lrc.ts
function parseTimestamp(raw) {
  const m = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(raw.trim());
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec > 59) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  return min * 6e4 + sec * 1e3 + frac;
}
function splitTags(line) {
  const tags = [];
  let rest = line;
  const re = /^\[([^\[\]]*)\]/;
  let m = re.exec(rest);
  while (m) {
    tags.push(m[1]);
    rest = rest.slice(m[0].length);
    m = re.exec(rest);
  }
  return { tags, text: rest.trim() };
}
function parseWords(text, lineStartMs3) {
  if (!text.includes("<")) return { clean: text, words: [] };
  const words = [];
  const re = /<(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)>([^<]*)/g;
  let m;
  const starts = [];
  const texts = [];
  while (m = re.exec(text)) {
    const ts = parseTimestamp(m[1]);
    if (ts === null) continue;
    starts.push(ts);
    texts.push(m[2]);
  }
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1] : starts[i] + 2e3;
    const w = texts[i].trim();
    if (!w) continue;
    words.push({ startMs: Math.max(0, starts[i] - lineStartMs3), endMs: end - lineStartMs3, text: w });
  }
  const clean = words.map((w) => w.text).join("") || text.replace(/<[^>]*>/g, "").trim();
  return { clean, words };
}
function parseLrc(raw, options) {
  const empty = {
    trackId: options.trackId,
    source: options.source ?? "local",
    hasWordTiming: false,
    lines: [],
    segments: [],
    offsetMs: options.offsetMs ?? 0,
    quality: "none",
    fetchedAt: Date.now()
  };
  if (!raw || !raw.trim()) return empty;
  const metaOffset = /(?:^|\n)\s*\[offset:\s*(-?\d+)\s*\]/.exec(raw);
  const offsetMs = (options.offsetMs ?? 0) + (metaOffset ? Number(metaOffset[1]) : 0);
  const drafts = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const { tags, text } = splitTags(rawLine);
    if (!text) continue;
    const times = [];
    let hasWordTag = false;
    for (const tag of tags) {
      const ts = parseTimestamp(tag);
      if (ts !== null) times.push(ts);
      else if (tag.includes("<")) hasWordTag = true;
    }
    if (!times.length) continue;
    const { clean, words } = parseWords(text, times[0]);
    const body = words.length ? clean : text;
    if (!body) continue;
    for (const t of times) {
      drafts.push({
        startMs: t,
        text: body,
        words: words.map((w) => ({ ...w, startMs: w.startMs + (t - times[0]) }))
      });
    }
    void hasWordTag;
  }
  if (!drafts.length) return empty;
  drafts.sort((a, b) => a.startMs - b.startMs);
  const lines = drafts.map((d, i) => {
    const next = drafts[i + 1];
    const endMs = next ? Math.min(next.startMs, d.startMs + 8e3) : d.startMs + 5e3;
    return {
      index: i,
      startMs: d.startMs,
      endMs,
      text: d.text,
      words: d.words
    };
  });
  const hasWordTiming = lines.some((l) => l.words.length > 0);
  return {
    trackId: options.trackId,
    source: options.source ?? "local",
    hasWordTiming,
    lines,
    segments: [],
    // 段落聚类是第 3 步（21 §二），v1 先空
    offsetMs,
    quality: hasWordTiming ? "exact" : "estimated",
    fetchedAt: Date.now()
  };
}

// src/renderer/domain/lyrics/cursor.ts
function findLine(doc, positionMs) {
  const { lines } = doc;
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (lines[mid].startMs <= positionMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
function findWord(words, rel) {
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (words[mid].startMs <= rel) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
function cursorAt(doc, positionMs) {
  const empty = { lineIndex: -1, wordIndex: -1, nextLineIndex: doc.lines.length ? 0 : -1 };
  if (!doc.lines.length) return empty;
  const pos = positionMs - doc.offsetMs;
  const li = findLine(doc, pos);
  if (li < 0) return { lineIndex: -1, wordIndex: -1, nextLineIndex: 0 };
  const line = doc.lines[li];
  if (pos >= line.endMs) {
    const next = li + 1 < doc.lines.length ? li + 1 : -1;
    return { lineIndex: -1, wordIndex: -1, nextLineIndex: next };
  }
  let wordIndex = -1;
  if (line.words.length) {
    wordIndex = findWord(line.words, pos - line.startMs);
  }
  return {
    lineIndex: li,
    wordIndex,
    nextLineIndex: li + 1 < doc.lines.length ? li + 1 : -1
  };
}
function lineStartMs(doc, lineIndex) {
  const line = doc.lines[lineIndex];
  return line ? line.startMs + doc.offsetMs : null;
}

// src/renderer/domain/lyrics/fetch-lrclib.ts
var API = "https://lrclib.net/api/search";
var UA = "afeifei/0.1 (local music player)";
async function searchLrclib(http, query) {
  const params = new URLSearchParams({ track_name: query.trackName });
  if (query.artistName) params.set("artist_name", query.artistName);
  const res = await http.fetchJson(`${API}?${params.toString()}`, {
    headers: { "User-Agent": UA }
  });
  if (res.status !== 200 || !Array.isArray(res.json)) return [];
  return res.json.filter((h) => h && typeof h.trackName === "string");
}
function pickBest(hits, durationMs) {
  const synced = hits.filter((h) => h.syncedLyrics && h.syncedLyrics.trim());
  const pool = synced.length ? synced : hits.filter((h) => h.plainLyrics);
  if (!pool.length) return null;
  if (!durationMs) return pool[0];
  const target = durationMs / 1e3;
  return [...pool].sort(
    (a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target)
  )[0];
}
async function fetchLyricText(http, query) {
  try {
    const hits = await searchLrclib(http, query);
    const best = pickBest(hits, query.durationMs);
    if (!best) return null;
    return best.syncedLyrics ?? best.plainLyrics;
  } catch {
    return null;
  }
}

// src/renderer/domain/lyrics/index.ts
var kvKey = (trackId) => `lyric:${trackId}`;
function createLyricPort(deps) {
  const { kv } = deps;
  const cache = /* @__PURE__ */ new Map();
  const failed = /* @__PURE__ */ new Set();
  const load = async (trackId) => {
    const hit = cache.get(trackId);
    if (hit) return hit;
    const raw = await kv.read(kvKey(trackId));
    if (!raw) return null;
    try {
      const doc = JSON.parse(raw);
      cache.set(trackId, doc);
      return doc;
    } catch {
      return null;
    }
  };
  const save = async (doc) => {
    cache.set(doc.trackId, doc);
    await kv.write(kvKey(doc.trackId), JSON.stringify(doc));
  };
  const api = {
    async get(trackId) {
      const cached = await load(trackId);
      if (cached) return cached;
      const meta = deps.metaOf?.(trackId);
      if (deps.http && meta?.title && !failed.has(trackId)) {
        const text = await fetchLyricText(deps.http, {
          trackName: meta.title,
          artistName: meta.artist,
          durationMs: meta.durationMs
        });
        if (text) {
          const doc = parseLrc(text, { trackId, source: "lrclib" });
          if (doc.quality !== "none") {
            await save(doc);
            return doc;
          }
        }
        failed.add(trackId);
      }
      return {
        trackId,
        source: "local",
        hasWordTiming: false,
        lines: [],
        segments: [],
        offsetMs: 0,
        quality: "none",
        fetchedAt: 0
      };
    },
    cursorAt,
    async setOffset(trackId, offsetMs) {
      const doc = await load(trackId);
      if (!doc) throw new Error("lyric: no doc for offset");
      const next = { ...doc, offsetMs };
      cache.set(trackId, next);
      await kv.write(kvKey(trackId), JSON.stringify(next));
      return next;
    },
    async refetch(trackId, source) {
      if (source === "lrclib" && deps.http) {
        cache.delete(trackId);
        failed.delete(trackId);
        return api.get(trackId);
      }
      const doc = await load(trackId);
      return doc ?? parseLrc("", { trackId });
    }
  };
  return api;
}
function importLrcText(trackId, text, offsetMs = 0) {
  return parseLrc(text, { trackId, source: "manual", offsetMs });
}
export {
  createLyricPort,
  cursorAt,
  fetchLyricText,
  importLrcText,
  lineStartMs,
  parseLrc,
  pickBest,
  searchLrclib
};
