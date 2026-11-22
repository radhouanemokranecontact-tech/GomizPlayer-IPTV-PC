const { init: widgetHelpersInit, analogClockSVG, mosqueSVG, weatherGlyph, weatherDescription, wmoBucket, weatherEmoji, timeOfDayKey, formatCountdown, getNextPrayerInfo, formatTime, formatTemp } = window.WidgetHelpers;
'use strict';

/* ===================== GomizPlayer IPTV renderer ===================== */

function normalizeMediaKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'live' || k === 'livetv') return 'live';
  if (k === 'series' || k === 'serie') return 'series';
  if (k === 'movie' || k === 'movies' || k === 'vod' || k === 'film' || k === 'films') return 'movie';
  if (k === 'unknown') return 'unknown';
  return '';
}

function effectiveMediaKind(item) {
  const stored = normalizeMediaKind(item && item.kind);
  if (stored === 'live' || stored === 'movie' || stored === 'series') return stored;
  try {
    if (typeof GomizClassification !== 'undefined' && GomizClassification && typeof GomizClassification.classifyMedia === 'function') {
      const k = GomizClassification.classifyMedia(item || {});
      return (k === 'live' || k === 'movie' || k === 'series') ? k : 'unknown';
    }
  } catch (_) {}
  // Minimal safe fallback: trust explicit stored kind only; never infer Live from .m3u8/.ts
  const raw = normalizeMediaKind(item && item.kind);
  if (raw === 'live' || raw === 'movie' || raw === 'series') return raw;
  try {
    const url = String(item && item.url || '');
    if (typeof GomizClassification !== 'undefined' && GomizClassification) {
      if (GomizClassification.explicitTypeFromUrl) {
        const e = GomizClassification.explicitTypeFromUrl(url);
        if (e) return e;
      }
      if (GomizClassification.isVodFileUrl && GomizClassification.isVodFileUrl(url)) return 'movie';
    }
  } catch (_) {}
  return 'unknown';
}

function isLiveKind(item) { return effectiveMediaKind(item) === 'live'; }
function isMovieKind(item) { return effectiveMediaKind(item) === 'movie'; }
function isSeriesKind(item) { return effectiveMediaKind(item) === 'series'; }
function splitKinds(items) {
  const out = { live: [], movies: [], series: [] };
  for (const it of items) {
    if (isLiveKind(it)) out.live.push(it);
    else if (isMovieKind(it)) out.movies.push(it);
    else if (isSeriesKind(it)) out.series.push(it);
  }
  return out;
}

function isVodKind(item) { const k = effectiveMediaKind(item); return k === 'movie' || k === 'series'; }
function mediaKindLabel(kind) {
  const k = normalizeMediaKind(kind) || effectiveMediaKind({ kind });
  if (k === 'live') return t('nav_live');
  if (k === 'series') return t('nav_series');
  if (k === 'movie') return t('nav_movies');
  return t('nav_movies');
}

const state = {
  ready: false,
  info: null,
  settings: null,
  route: 'home',
  stack: [],
  scroll: {},
  sources: [],
  items: [],
  itemsBySource: new Map(),
  accountInfo: new Map(),
  library: { favorites: [], history: [], liveHistory: [], search: [] },
  downloads: [],
  recordings: [],
  recordingTarget: null,
  recordingPath: null,
  epg: {},
  epgIndex: new Map(),
  epgAt: 0,
  epgLoading: false,
  epgPromise: null,
  weather: null,
  prayer: null,
  location: null,
  clockTimer: null,
  filters: {
    movies: { group: 'all', sort: 'default' },
    series: { group: 'all', sort: 'default' }
  },
  searchTerm: '',
  searchTimer: null,
  settingsTab: 'general',
  loading: true
};

// Wire extracted widget helpers immediately (state/t/I18N are in scope here).
if (typeof widgetHelpersInit === 'function') widgetHelpersInit({
  t: (k) => (typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(k) : k),
  I18N: (typeof window !== 'undefined' ? window.I18N : null) || { lang: 'en', number: (n) => String(n) },
  state
});

function activeProfile() { return (state.settings && state.settings.profile) || state.profile || 'default'; }

let player = null;

/* Home screen rows, in default order. Users can reorder / hide them in Settings → Home screen. */
const HOME_SECTIONS = [
  { id: 'hero', label: 'home_section_hero' },
  { id: 'live', label: 'home_section_live' },
  { id: 'movies', label: 'nav_movies' },
  { id: 'series', label: 'nav_series' }
];
const HOME_DEFAULTS = {
  order: HOME_SECTIONS.map((s) => s.id),
  hidden: [],
  density: 'comfortable',
  rowLimit: 16
};

function homeLayout() {
  const raw = (state.settings && state.settings.home) || {};
  const order = HOME_SECTIONS.map((s) => s.id).filter((id) => !Array.isArray(raw.order) || !raw.order.includes(id));
  const saved = Array.isArray(raw.order) ? raw.order.filter((id) => HOME_SECTIONS.some((s) => s.id === id)) : [];
  const merged = [...saved, ...order.filter((id) => !saved.includes(id))];
  return {
    order: merged.length ? merged : HOME_DEFAULTS.order.slice(),
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id) => HOME_SECTIONS.some((s) => s.id === id)) : [],
    density: ['compact', 'comfortable', 'large'].includes(raw.density) ? raw.density : 'comfortable',
    rowLimit: Math.min(30, Math.max(8, Number(raw.rowLimit) || HOME_DEFAULTS.rowLimit))
  };
}



/* ===================== Icons ===================== */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.6 12 3.2l9 7.4V20a1 1 0 0 1-1 1h-5.4v-6.2H9.4V21H4a1 1 0 0 1-1-1v-9.4Z"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="12.5" rx="2.4"/><path d="m8.5 3 3.5 3.5L15.5 3"/><circle cx="8.7" cy="12.7" r="1.1" fill="currentColor" stroke="none"/><path d="M15.5 10.4c1 .8 1 2.4 0 3.2M18 8.4c2 1.7 2 5.5 0 7.2"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.4"/><path d="M7 4.5v15M17 4.5v15M2.5 9.5h4.5M2.5 14.5h4.5M17 9.5h4.5M17 14.5h4.5"/></svg>',
  series: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="12.5" rx="2.2"/><path d="M5.5 8V5.4a1.4 1.4 0 0 1 1.4-1.4h10.2a1.4 1.4 0 0 1 1.4 1.4V8M8 3.5 6 6.5M12 3.5 10 6.5M16 3.5l-2 3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.3S3.5 15.4 3.5 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.8c0 6-8.5 10.9-8.5 10.9Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5.5" rx="1.6"/><rect x="3" y="14.5" width="18" height="5.5" rx="1.6"/><path d="M6.5 6.75h.01M6.5 17.25h.01M10.5 6.75h5M10.5 17.25h5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9c.26.63.87 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5.5 6.5 6.5L9 18.5"/></svg>',
  guide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.2"/><path d="M8 3v4M16 3v4M3 10h18M7.5 14h4M7.5 17.5h7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.2v14H6zM19 5.6v12.8L9.4 12 19 5.6Z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.8 5H18v14h-2.2zM5 5.6v12.8L14.6 12 5 5.6Z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 10 6 6 6-6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6.5h16M4 12h16M4 17.5h10"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.4"/><path d="M10 10.2a2.4 2.4 0 1 0 0 3.6M17.5 10.2a2.4 2.4 0 1 0 0 3.6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13v4a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 1z"/><path d="M20 13v4a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 1z"/><path d="M4 13a8 8 0 0 1 16 0"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  back10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6a8 8 0 1 0 8 8"/><path d="M12 2v4l3-2-3-2"/><path d="M10 11v4M14.5 11v4"/></svg>',
  forward10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6a8 8 0 1 1-8 8"/><path d="M12 2v4l-3-2 3-2"/><path d="M9.5 11v4M14 11v4"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-1.8"/></svg>',
  screenshot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2h6l2 2h3v10H4z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 10v3l2 1.5"/><path d="M9 3h6"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10h1.5v5"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6 12h3M15 12h3"/><path d="M12 6v3M12 15v3"/></svg>',
  mini: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><rect x="13" y="12" width="7" height="6" rx="1"/></svg>',
  ab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h4M7 4v16M15 7h4M17 4v16"/></svg>',
  pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="4.5" width="19" height="15" rx="2.2"/><rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.4 6.3M20 4.5V11h-6.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14 6 4 4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.2v5.1l3.3 2"/><path d="M12 3.5v1.2M12 19.3v1.2M3.5 12h1.2M19.3 12h1.2"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M6.5 12h11M10 18h4"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="12.5" rx="2.2"/><path d="m8 3.2 4 3.3 4-3.3"/></svg>',
  record: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>',
  lang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M2.5 12h19M12 2.5a15.5 15.5 0 0 1 0 19 15.5 15.5 0 0 1 0-19Z"/></svg>',
  weather: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 17.5h8.2a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-9.8 1.3A3.3 3.3 0 0 0 7.5 17.5Z"/><path d="M12.2 5.2a3.2 3.2 0 0 1 4.6 2.8"/></svg>',
  prayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20v-6c0-3.3 3.6-5.5 9-5.5s9 2.2 9 5.5v6"/><path d="M2 20h20"/><path d="M10 20v-4a2 2 0 0 1 4 0v4"/><path d="M12 3v2.3"/><circle cx="12" cy="2" r=".6" fill="currentColor"/></svg>',
  golive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6 12h3M15 12h3"/><path d="M12 6v3M12 15v3"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.4v3h2.7v8h3.4Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84c.85 0 1.7.11 2.5.33 1.9-1.29 2.74-1.02 2.74-1.02.56 1.38.21 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>'
};

function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((node) => {
    if (node.dataset.done) return;
    const svg = ICONS[node.getAttribute('data-icon')];
    if (svg) {
      node.innerHTML = svg;
      node.dataset.done = '1';
    }
  });
}

/* ===================== Movie recommendations ===================== */

function recommendMovies(item, limit) {
  const kind = (item && item.kind) || 'movie';
  const pool = state.items.filter((x) => effectiveMediaKind(x) === normalizeMediaKind(kind) && x.key !== item.key);
  const scored = [];
  for (const x of pool) {
    let score = 0;
    if (item.group && x.group && item.group === x.group) score += 40;
    if (item.sourceName && x.sourceName && item.sourceName === x.sourceName) score += 15;
    if (x.kind === kind) score += 5;
    scored.push({ x, score });
  }
  scored.sort((a, b) => (b.score - a.score) || String(a.x.name).localeCompare(String(b.x.name)));
  return scored.map((s) => s.x).slice(0, limit || 18);
}

/* ===================== Tiny DOM helpers ===================== */

const view = document.getElementById('view');
const modalRoot = document.getElementById('modalRoot');
const modalBody = document.getElementById('modalBody');

const reduceMotionQuery = (typeof matchMedia === 'function') ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function detectLowPerf() {
  try {
    if (reduceMotionQuery && reduceMotionQuery.matches) { document.documentElement.dataset.perf = 'low'; return; }
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) { document.documentElement.dataset.perf = 'low'; return; }
    if (gl.getExtension && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
    document.documentElement.dataset.perf = 'gpu';
  } catch (_) { document.documentElement.dataset.perf = 'low'; }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function iconSpan(name) {
  const span = el('span');
  span.setAttribute('data-icon', name);
  span.innerHTML = ICONS[name] || '';
  return span;
}

function makeButton(label, { cls = 'btn btn-ghost', icon = null, onClick = null, title = '' } = {}) {
  const b = el('button', cls);
  if (title) b.title = title;
  if (icon) b.appendChild(iconSpan(icon));
  if (label) b.appendChild(el('span', null, label));
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function initials(name) {
  const clean = String(name || '').replace(/[\[\](){}]/g, ' ').trim();
  const parts = clean.split(/[\s\-_.]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function humanBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return v.toFixed(v >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
}

function fileUrl(p) {
  const norm = String(p).replace(/\\/g, '/');
  return 'file:///' + encodeURI(norm).replace(/#/g, '%23');
}

function toast(message, kind) {
  const box = document.getElementById('toasts');
  const node = el('div', 'toast' + (kind ? ' ' + kind : ''), message);
  box.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s ease';
    setTimeout(() => node.remove(), 260);
  }, 3200);
}

function loadingBlock(text) {
  const box = el('div', 'loading-block');
  box.appendChild(el('span', 'spinner'));
  box.appendChild(el('span', null, text || t('loading')));
  return box;
}

function emptyBlock(title, text, action) {
  const box = el('div', 'empty');
  box.appendChild(el('h3', null, title));
  if (text) box.appendChild(el('p', null, text));
  if (action) box.appendChild(action);
  return box;
}

function pageHead(title, sub, actions) {
  const head = el('div', 'page-head');
  const info = el('div');
  info.appendChild(el('h1', 'page-title', title));
  if (sub) info.appendChild(el('p', 'page-sub', sub));
  head.appendChild(info);
  head.appendChild(el('div', 'spacer'));
  (actions || []).forEach((a) => head.appendChild(a));
  return head;
}

function section(title, count, linkLabel, onLink) {
  const head = el('div', 'section-head');
  head.appendChild(el('h2', 'section-title', title));
  if (count !== undefined && count !== null) head.appendChild(el('span', 'section-count', count));
  if (linkLabel) {
    const link = el('button', 'link');
    link.appendChild(el('span', null, linkLabel));
    link.appendChild(iconSpan('chevron'));
    link.addEventListener('click', onLink);
    head.appendChild(link);
  }
  return head;
}

/* ===================== Library helpers ===================== */

function isFavorite(key) {
  try {
    const favs = state.library && Array.isArray(state.library.favorites) ? state.library.favorites : [];
    return favs.some((x) => x && x.key === key);
  } catch (_) {
    return false;
  }
}

async function toggleFavorite(item) {
  const key = item && item.key;
  if (!key) return;
  const profile = activeProfile();
  const on = !isFavorite(key);
  try {
    await window.api.library.favorite(item, on, profile);
    state.library = await window.api.library.get(profile);
  } catch (err) {
    toast((err && err.message) || t('error'), 'err');
    return;
  }
  // Feedback so the user knows the favorite state changed
  toast(on ? t('favorite_added') : t('favorite_removed'), 'ok');
  // Reflect state immediately in every visible card with matching data-fav
  try {
    const sel = '[data-fav="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]';
    document.querySelectorAll(sel).forEach((node) => {
      node.classList.toggle('on', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
      node.title = on ? t('unfavorite') : t('favorite');
    });
  } catch (_) {}
  try { render(); } catch (_) {}
}

function historyEntry(key) {
  return state.library.history.find((x) => x.key === key) || state.library.liveHistory.find((x) => x.key === key) || null;
}

function resumeFor(item) {
  const entry = historyEntry(item.key);
  if (!entry) return 0;
  if (!entry.position || !entry.duration) return 0;
  if (entry.position > entry.duration - 5) return 0;
  return entry.position;
}

async function recordHistory(item) {
  const entry = {
    ...item,
    position: item.position || 0,
    duration: item.duration || 0,
    mode: item.kind === 'live' ? (state.liveEntry || 'live') : undefined
  };
  try {
    const bucket = await window.api.library.history(entry, item.kind === 'live' ? 'live' : 'vod', activeProfile());
    if (Array.isArray(bucket)) {
      if (item.kind === 'live') state.library.liveHistory = bucket;
      else state.library.history = bucket;
    }
  } catch (_) {}
}

function kindLabel(kind) {
  return mediaKindLabel(kind);
}

function cardsRow(items, playlist, opts = {}) {
  const wrap = el('div', 'row-wrap');
  const row = el('div', 'row');
  const limit = opts.limit || 20;
  const slice = items.slice(0, limit);
  slice.forEach((item) => row.appendChild(cardNode(item, playlist, opts)));
  wrap.appendChild(row);

  if (slice.length > 2) {
    const forward = () => document.documentElement.dir !== 'rtl';
    const step = () => Math.max(220, Math.round(row.clientWidth * 0.82));
    const arrow = (side, icon) => {
      const b = el('button', 'row-arrow ' + side);
      b.type = 'button';
      b.title = side === 'next' ? t('scroll_next') : t('scroll_prev');
      b.setAttribute('aria-label', b.title);
      b.appendChild(iconSpan(icon));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = side === 'next' ? 1 : -1;
        row.scrollBy({ left: dir * step() * (forward() ? 1 : -1), behavior: 'smooth' });
      });
      return b;
    };
    wrap.appendChild(arrow('prev', 'back'));
    wrap.appendChild(arrow('next', 'back'));
    requestAnimationFrame(() => {
      if (row.scrollWidth <= row.clientWidth + 4) wrap.classList.add('no-arrows');
    });
  }
  return wrap;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
  return String(value == null ? '' : value).replace(/["\\#.:;,!?+*~>'"()\[\]\/\s]/g, '\\$&');
}


/* The last live channel the user actually watched, matched against the current
   library so removed/renamed sources fall back gracefully. */

/* Sidebar "Live TV" behaves like a set-top box: the player opens straight away
   on the last watched channel, with the full channel browser (categories +
   every channel) merged into the drawer. There is no separate Live TV page. */



function posterNode(item, { wide = false } = {}) {
  const poster = el('div', 'card-poster');
  const fallback = el('div', 'ph');
  fallback.appendChild(el('span', null, initials(item.name)));
  poster.appendChild(fallback);

  if (item.logo) {
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = item.logo;
    img.addEventListener('load', () => { fallback.style.display = 'none'; });
    img.addEventListener('error', () => { img.remove(); fallback.style.display = 'grid'; });
    poster.appendChild(img);
  }

  if (isRecordingTargetItem(item)) {
    const rec = el('div', 'card-badge rec');
    rec.appendChild(el('span', null, '● REC'));
    poster.appendChild(rec);
  } else if (isLiveKind(item)) {
    const badge = el('div', 'card-badge live');
    badge.appendChild(el('span', null, '● ' + t('live')));
    poster.appendChild(badge);
  } else if (item.group) {
    poster.appendChild(el('div', 'card-badge', item.group.slice(0, 18)));
  }

  if (item.duration && item.position > 0) {
    const bar = el('div', 'card-progress');
    const fill = el('i');
    fill.style.width = Math.min(100, Math.round((item.position / item.duration) * 100)) + '%';
    bar.appendChild(fill);
    poster.appendChild(bar);
  }

  const overlay = el('div', 'card-play');
  const bubble = el('i');
  bubble.appendChild(iconSpan('play'));
  overlay.appendChild(bubble);
  poster.appendChild(overlay);

  const fav = el('button', 'card-fav' + (isFavorite(item.key) ? ' on' : ''));
  fav.setAttribute('data-fav', cssEscape(item.key));
  fav.title = isFavorite(item.key) ? t('unfavorite') : t('favorite');
  fav.appendChild(iconSpan('heart'));
  fav.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(item);
  });
  poster.appendChild(fav);

  if (wide) poster.classList.add('card-wide');
  return poster;
}

function cardNode(item, playlist, opts = {}) {
  const card = el('div', 'card' + (isLiveKind(item) ? ' card-wide' : ''));
  card.tabIndex = 0;
  card.appendChild(posterNode(item, { wide: isLiveKind(item) }));

  const body = el('div', 'card-body');
  body.appendChild(el('h3', 'card-title', item.name));
  const meta = el('div', 'card-meta');
  meta.appendChild(el('span', null, item.group || kindLabel(item.kind)));
  if (item.kind !== 'live' && item.sourceName) {
    meta.appendChild(el('span', 'dot'));
    meta.appendChild(el('span', null, item.sourceName));
  }
  body.appendChild(meta);
  card.appendChild(body);

  const open = () => {
    if (opts.onOpen) return opts.onOpen(item);
    if (isLiveKind(item)) playItem(item, playlist);
    else showDetail(item, playlist);
  };

  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  const playOverlay = card.querySelector('.card-play');
  if (playOverlay) {
    playOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isLiveKind(item)) playItem(item, playlist);
      else playItem(item, playlist);
    });
  }

  return card;
}

function skeletonCards(n) {
  const wrap = el('div', 'row-wrap');
  const row = el('div', 'row');
  for (let i = 0; i < Math.max(0, n); i++) {
    const card = el('div', 'card');
    const poster = el('div', 'card-poster');
    const sk = el('div', 'skel');
    sk.style.cssText = 'position:absolute;inset:0;background:linear-gradient(100deg, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.05) 70%);background-size:200% 100%;animation:skel-shimmer 1.3s linear infinite;';
    poster.appendChild(sk);
    card.appendChild(poster);
    const body = el('div', 'card-body');
    body.appendChild(el('h3', 'card-title', ''));
    body.appendChild(el('div', 'card-meta'));
    card.appendChild(body);
    row.appendChild(card);
  }
  wrap.appendChild(row);
  return wrap;
}

function cardsGrid(items, playlist, opts = {}) {
  const wrap = el('div', 'cards-wrap');
  const grid = el('div', 'cards');
  wrap.appendChild(grid);
  const pageSize = Math.max(20, Number(opts.pageSize || 40));
  const limit = Math.max(0, Number(opts.limit || 500));
  const slice = items.slice(0, limit);
  let shown = 0;
  let footBtn = null;
  const append = () => {
    const end = Math.min(slice.length, shown + pageSize);
    for (let i = shown; i < end; i++) grid.appendChild(cardNode(slice[i], playlist, opts));
    shown = end;
    if (footBtn) { wrap.removeChild(footBtn); footBtn = null; }
    if (shown < slice.length) {
      const remaining = slice.length - shown;
      footBtn = makeButton(t('load_more') + ' (' + I18N.number(remaining) + ')', { cls: 'btn btn-ghost btn-lg', onClick: append });
      wrap.appendChild(footBtn);
    }
  };
  append();
  return wrap;
}

/* ===================== Navigation ===================== */

/* Instant scroll: the viewport uses `scroll-behavior: smooth`, which makes
   programmatic resets animate (and stall when the window is hidden). Route
   changes and category switches should land immediately. */
function setViewScroll(top) {
  const prev = view.style.scrollBehavior;
  view.style.scrollBehavior = 'auto';
  view.scrollTop = top;
  view.style.scrollBehavior = prev;
}

function navigate(route, opts = {}) {
  // There is no standalone Live TV page anymore: the sidebar and every
  // "view all" link open the receiver on the last watched channel.
  if (route === 'live') {
    openLiveReceiver();
    return;
  }
  // "My List" sidebar entry: opens the live receiver like Live TV, starting on
  // the user's favorites (controls via "All Channels" drawer remain available).
  if (route === 'favorites') {
    openLiveReceiver('favorites');
    return;
  }
  if (state.route === route) {
    if (opts.force) render();
    return;
  }
  state.scroll[state.route] = view.scrollTop;
  if (!opts.replace) state.stack.push(state.route);
  state.route = route;
  if (route === 'favorites' || route === 'live') state.liveEntry = route;
  if (route !== 'search') {
    state.searchTerm = '';
    document.getElementById('searchInput').value = '';
  }
  if (opts.tab) state.settingsTab = opts.tab;
  render();
  if (opts.scrollTop !== undefined) {
    requestAnimationFrame(() => { setViewScroll(opts.scrollTop); });
  } else {
    setViewScroll(0);
  }
}

function goBack() {
  if (!state.stack.length) return;
  const prev = state.stack.pop();
  state.scroll[state.route] = view.scrollTop;
  state.route = prev;
  if (prev !== 'search') {
    state.searchTerm = '';
    document.getElementById('searchInput').value = '';
  }
  render();
  requestAnimationFrame(() => { setViewScroll(state.scroll[prev] || 0); });
}

function updateChrome() {
  // While the receiver is open the sidebar should read "Live TV" / "My List" as the active section.
  const liveOn = !!(player && player.open && player.item && isLiveKind(player.item));
  const entry = state.liveEntry || 'live';
  document.querySelectorAll('.nav .nav-item').forEach((btn) => {
    const route = btn.getAttribute('data-route');
    if (route === 'live' || route === 'favorites') {
      btn.classList.toggle('active', liveOn && route === entry);
      return;
    }
    btn.classList.toggle('active', liveOn ? false : route === state.route);
  });
  document.getElementById('backBtn').hidden = state.stack.length === 0;
  document.getElementById('searchInput').placeholder = t('search_placeholder');
  const langLabels = { en: 'EN', fr: 'FR', ar: 'AR' };
  document.getElementById('langBtn').textContent = langLabels[state.settings.language] || 'EN';
  document.getElementById('langBtn').title = t('language');
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    const name = String(activeProfile() || 'default');
    const avatar = profileBtn.querySelector('.avatar');
    const label = profileBtn.querySelector('[data-i18n="profile_default"], .profile-name, span:last-child');
    if (avatar) avatar.textContent = (name.charAt(0) || 'N').toUpperCase();
    if (label) {
      label.textContent = name === 'default' ? t('profile_default') : name;
      label.classList.add('profile-name');
      label.removeAttribute('data-i18n');
    }
  }
}

/* ===================== Rendering ===================== */

function render() {
  if (!state.settings) return;
  applyStaticText();
  updateChrome();
  view.dataset.density = homeLayout().density;
  view.innerHTML = '';

  if (state.loading) {
    view.appendChild(loadingBlock());
    return;
  }

  switch (state.route) {
    case 'home': renderHome(); break;
    case 'movies': renderCatalog('movies'); break;
    case 'series': renderCatalog('series'); break;
    case 'favorites': renderFavorites(); break;
    case 'myvod': renderMyVod(); break;
    case 'downloads': renderDownloads(); break;
    case 'recordings': renderRecordings(); break;
    case 'sources': renderSources(); break;
    case 'settings': renderSettings(); break;
    case 'search': renderSearch(); break;
    default: renderHome();
  }

  hydrateIcons(view);
}

function applyStaticText() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    const value = t(key);
    if (value && node.textContent !== value) node.textContent = value;
  });
}

/* ===================== Welcome ===================== */

function renderWelcome() {
  const box = el('div', 'empty');
  box.style.padding = '54px 26px';
  box.style.borderStyle = 'solid';
  box.style.background = 'linear-gradient(160deg, rgba(255,61,90,0.08), rgba(90,108,255,0.05))';

  const mark = el('div', 'brand-mark');
  mark.style.width = '56px';
  mark.style.height = '56px';
  mark.innerHTML = ICONS.tv;
  box.appendChild(mark);

  box.appendChild(el('h3', null, t('welcome_title')));
  box.appendChild(el('p', null, t('welcome_sub')));

  const points = el('div');
  points.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin:8px 0 16px;text-align:start';
  [t('welcome_point_1'), t('welcome_point_2'), t('welcome_point_3')].forEach((line) => {
    const row = el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--muted)';
    const chk = el('span');
    chk.style.cssText = 'width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:rgba(56,211,159,0.14);color:var(--ok)';
    chk.innerHTML = ICONS.check;
    chk.firstChild.style.width = '12px';
    row.appendChild(chk);
    row.appendChild(el('span', null, line));
    points.appendChild(row);
  });
  box.appendChild(points);

  const seg = el('div', 'seg');
  const langs = [['ar', t('arabic')], ['en', t('english')]];
  langs.forEach(([code, label]) => {
    const b = el('button', state.settings.language === code ? 'on' : '', label);
    b.addEventListener('click', async () => {
      await setLanguage(code);
      render();
    });
    seg.appendChild(b);
  });
  const langRow = el('div');
  langRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px';
  langRow.appendChild(el('span', 'tiny dim', t('welcome_language')));
  langRow.appendChild(seg);
  box.appendChild(langRow);

  const actions = el('div');
  actions.style.cssText = 'display:flex;gap:9px;flex-wrap:wrap;justify-content:center';
  actions.appendChild(makeButton(t('add_source'), { cls: 'btn btn-primary', icon: 'plus', onClick: () => openSourceModal() }));
  actions.appendChild(makeButton(t('sample_playlist'), { cls: 'btn btn-ghost', icon: 'play', onClick: () => loadDemo() }));
  box.appendChild(actions);

  view.appendChild(box);
}

/* ===================== Home ===================== */


/** Hide Xtream credentials from any URL shown in the UI. */




/* ---------- Realistic widget artwork (SVG, no external assets) ---------- */





const WMO_DESCRIPTIONS = {
  clear: { en: 'Clear sky', ar: 'صافي' },
  partly: { en: 'Partly cloudy', ar: 'غائم جزئيًا' },
  overcast: { en: 'Overcast', ar: 'غيوم كثيفة' },
  fog: { en: 'Fog', ar: 'ضباب' },
  rain: { en: 'Rain', ar: 'مطر' },
  snow: { en: 'Snow', ar: 'ثلج' },
  thunder: { en: 'Thunderstorm', ar: 'عاصفة رعدية' },
  other: { en: 'Variable', ar: 'متغير' }
};

const HERO_COUNT = 10;



const _catalogCache = { items: null, movies: null, series: null, groups: null };
function catalogItems(which) {
  if (_catalogCache.items !== state.items) {
    _catalogCache.items = state.items;
    _catalogCache.movies = state.items.filter(isMovieKind);
    _catalogCache.series = state.items.filter(isSeriesKind);
    _catalogCache.groups = null;
  }
  if (which === 'series') return _catalogCache.series;
  return _catalogCache.movies;
}
function groupCounts(items) {
  if (items === _catalogCache.items && _catalogCache.groups) return _catalogCache.groups;
  const out = {};
  for (const item of items) {
    const g = item.group || 'Uncategorized';
    out[g] = (out[g] || 0) + 1;
  }
  if (items === _catalogCache.items) _catalogCache.groups = out;
  return out;
}

/* ===================== Live ===================== */

/* How many channel cards are painted per batch. Keeps the Live screen responsive
   with thousands of channels while still making every channel reachable. */
async function loadEpgFor(channels) {
  const eps = await window.api.epg.list().catch(() => []);
  if (!eps.length) return;
  // De-duplicate ids so we never ask the main process for the same channel twice.
  const ids = Array.from(new Set(channels.map((c) => c.tvgId || c.tvgName).filter(Boolean)));
  if (!ids.length) return;
  const fresh = Date.now() - state.epgAt < 5 * 60 * 1000;
  const missing = ids.filter((id) => !epgLookup(id));
  if (fresh && !missing.length) return;
  // Share one in-flight request: two rapid renders must not leave the second
  // one without EPG labels.
  if (state.epgLoading) return state.epgPromise;
  state.epgLoading = true;
  state.epgPromise = (async () => {
    try {
      // Merge: playing a channel fetches only its id and must not wipe the
      // guide data already loaded for the rest of the library.
      const fetched = await window.api.epg.channels(ids);
      state.epg = Object.assign({}, state.epg, fetched);
      state.epgIndex = new Map();
      for (const key of Object.keys(state.epg)) {
        const list = state.epg[key];
        if (!list || !list.length) continue;
        for (const variant of epgVariants(key)) {
          if (!state.epgIndex.has(variant)) state.epgIndex.set(variant, list);
        }
      }
      state.epgAt = Date.now();
    } catch (_) {
    } finally {
      state.epgLoading = false;
      state.epgPromise = null;
    }
  })();
  return state.epgPromise;
}

function epgVariants(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const noAt = lower.split('@')[0];
  const compact = lower.replace(/[\s._-]+/g, '');
  return Array.from(new Set([lower, noAt, compact]));
}

/* XMLTV ids and playlist ids rarely match character-for-character:
   "Eurosport1.fr@France" vs "Eurosport1.fr". Try the normalised forms too. */
function epgLookup(value) {
  for (const key of epgVariants(value)) {
    const list = state.epgIndex.get(key);
    if (list && list.length) return list;
  }
  const raw = String(value || '');
  return (raw && state.epg[raw]) || null;
}

function epgForChannel(channel) {
  const keys = [channel.tvgId, channel.tvgName, channel.name].filter(Boolean);
  for (const key of keys) {
    const list = epgLookup(key);
    if (list && list.length) return list;
  }
  return null;
}

function epgNowNext(channel) {
  const list = epgForChannel(channel);
  if (!list) return null;
  const now = Date.now();
  const current = list.find((p) => p.start && p.stop && p.start <= now && p.stop > now) || null;
  const next = list.find((p) => p.start && p.start > now) || null;
  return { current, next };
}

function openGuide() {
  const channels = state.items.filter(isLiveKind);
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('guide')));
  wrap.appendChild(el('p', 'lead', t('nav_live')));

  if (!channels.length) {
    wrap.appendChild(emptyBlock(t('empty'), t('empty_hint')));
    openModal(wrap, { wide: true });
    return;
  }

  const hasEpg = Object.keys(state.epg).length > 0;
  if (!hasEpg) {
    wrap.appendChild(emptyBlock(t('no_epg_data'), t('no_epg'), makeButton(t('add_epg'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: () => { closeModal(); openEpgModal(); }
    })));
    openModal(wrap, { wide: true });
    loadEpgFor(channels).then(() => {
      if (Object.keys(state.epg).length) { closeModal(); openGuide(); }
    });
    return;
  }

  const table = el('div', 'list');
  channels.slice(0, 300).forEach((channel) => {
    const info = epgNowNext(channel);
    if (!info) return;
    const row = el('div', 'list-row');
    const logo = el('div', 'channel-logo');
    logo.style.width = '44px';
    logo.style.height = '32px';
    if (channel.logo) {
      const img = el('img');
      img.src = channel.logo;
      img.addEventListener('error', () => {
        img.remove();
        logo.textContent = initials(channel.name);
      });
      logo.appendChild(img);
    } else logo.textContent = initials(channel.name);

    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', channel.name));
    if (info.current) {
      main.appendChild(el('div', 'channel-sub', t('now') + ' · ' + ltr(I18N.date(info.current.start) + '–' + I18N.date(info.current.stop)) + ' · ' + info.current.title));
    }
    if (info.next) {
      main.appendChild(el('div', 'list-sub', t('next') + ' · ' + ltr(I18N.date(info.next.start)) + ' · ' + info.next.title));
    }
    row.appendChild(logo);
    row.appendChild(main);

    const play = makeButton(t('play'), { cls: 'btn btn-ghost btn-sm', icon: 'play', onClick: () => { closeModal(); playItem(channel, channels); } });
    row.appendChild(play);
    table.appendChild(row);
  });

  if (!table.children.length) wrap.appendChild(emptyBlock(t('no_epg_data')));
  else wrap.appendChild(table);
  openModal(wrap, { wide: true });
}

/* ===================== Catalogs ===================== */

function renderCatalog(which) {
  const all = catalogItems(which);
  const label = which === 'series' ? t('nav_series') : t('nav_movies');
  if (!all.length) {
    view.appendChild(pageHead(label, t('tagline')));
    view.appendChild(emptyBlock(t('empty'), t('empty_hint'), makeButton(t('add_source'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: () => openSourceModal()
    })));
    return;
  }

  const filter = state.filters[which];
  const counts = groupCounts(all);
  const groups = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  const groupSel = makeDarkSelect(
    [['all', t('all')]].concat(groups.map((g) => [g, g + ' (' + counts[g] + ')'])),
    filter.group,
    (v) => { filter.group = v; render(); },
    { minWidth: '150px', width: 'auto' }
  );

  const sortSel = makeDarkSelect(
    [['default', t('sort_default')], ['name', t('sort_name')], ['group', t('sort_group')]],
    filter.sort,
    (v) => { filter.sort = v; render(); },
    { minWidth: '150px', width: 'auto' }
  );

  view.appendChild(pageHead(label, I18N.count(all.length, 'items'), [groupSel, sortSel]));

  let items = filter.group === 'all' ? all.slice() : all.filter((x) => (x.group || 'Uncategorized') === filter.group);
  if (filter.sort === 'name') items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  else if (filter.sort === 'group') items.sort((a, b) => String(a.group || '').localeCompare(String(b.group || '')) || String(a.name).localeCompare(String(b.name)));

  if (!items.length) {
    view.appendChild(emptyBlock(t('no_results')));
    return;
  }

  const shown = Math.min(items.length, 1000);
  view.appendChild(cardsGrid(items, items, { limit: shown, pageSize: 60 }));
}

/* ===================== Favorites ===================== */

function renderFavorites() {
  const items = state.library.favorites;
  view.appendChild(pageHead(t('nav_favorites'), I18N.count(items.length, 'items'), [
    items.length ? makeButton(t('clear'), {
      cls: 'btn btn-ghost btn-sm', icon: 'trash',
      onClick: async () => {
        const ok = await confirmModal(t('clear_favorites'), t('clear_history_q'), t('clear'), true);
        if (!ok) return;
        state.library = await window.api.library.clear('favorites', activeProfile());
        toast(t('cleared'), 'ok');
        render();
      }
    }) : null
  ].filter(Boolean)));

  if (!items.length) {
    view.appendChild(emptyBlock(t('empty'), t('favorite'), makeButton(t('nav_live'), {
      cls: 'btn btn-primary', icon: 'live', onClick: () => navigate('live')
    })));
    return;
  }
  view.appendChild(cardsGrid(items, items, { limit: 600 }));
}

function renderMyVod() {
  const favKeys = new Set(state.library.favorites.map((x) => x && x.key));
  const items = state.items.filter((x) => isVodKind(x) && favKeys.has(x.key));
  view.appendChild(pageHead(t('nav_my_vod') || 'My Movies & Series', I18N.count(items.length, 'items'), [
    items.length && makeButton(t('clear'), {
      cls: 'btn btn-ghost btn-sm', icon: 'trash',
      onClick: async () => {
        const ok = await confirmModal(t('clear_favorites'), t('clear_history_q'), t('clear'), true);
        if (!ok) return;
        state.library = await window.api.library.clear('favorites', activeProfile());
        toast(t('cleared'), 'ok');
        render();
      }
    })
  ].filter(Boolean)));
  if (!items.length) {
    view.appendChild(emptyBlock(t('empty'), t('favorite'), makeButton(t('nav_movies'), {
      cls: 'btn btn-primary', icon: 'film', onClick: () => navigate('movies')
    })));
    return;
  }
  view.appendChild(cardsGrid(items, items, { limit: 600 }));
}
/* ===================== Search ===================== */

function renderSearch() {
  const term = state.searchTerm.trim();
  if (!term) {
    view.appendChild(pageHead(t('search'), t('search_history')));
    if (state.library.search.length) {
      const box = el('div');
      box.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      state.library.search.forEach((q) => {
        const chip = el('button', 'chip', q);
        chip.addEventListener('click', () => {
          state.searchTerm = q;
          document.getElementById('searchInput').value = q;
          render();
        });
        box.appendChild(chip);
      });
      view.appendChild(box);
    } else {
      view.appendChild(emptyBlock(t('search'), t('search_placeholder')));
    }
    return;
  }

  const lower = term.toLowerCase();
  const results = state.items.filter((x) =>
    (x.name || '').toLowerCase().includes(lower) ||
    (x.group || '').toLowerCase().includes(lower) ||
    (x.tvgName || '').toLowerCase().includes(lower)
  );

  view.appendChild(pageHead(t('search'), I18N.count(results.length, 'results')));

  if (!results.length) {
    view.appendChild(emptyBlock(t('no_results'), term));
    return;
  }

  const live = results.filter(isLiveKind);
  const moviesRes = results.filter(isMovieKind);
  const seriesRes = results.filter(isSeriesKind);

  if (live.length) {
    view.appendChild(section(t('nav_live'), live.length));
    view.appendChild(cardsRow(live, live, { limit: 16 }));
  }
  if (moviesRes.length) {
    view.appendChild(section(t('nav_movies'), moviesRes.length));
    view.appendChild(cardsGrid(moviesRes, moviesRes, { limit: 120 }));
  }
  if (seriesRes.length) {
    view.appendChild(section(t('nav_series'), seriesRes.length));
    view.appendChild(cardsGrid(seriesRes, seriesRes, { limit: 120 }));
  }
}

/* ===================== Detail modal ===================== */


/* ===================== Sources ===================== */


function sourceSubText(source) {
  const kindText = source.kind === 'xtream' ? t('type_xtream') : (source.kind === 'single' ? t('type_single') : t('type_playlist'));
  const updated = source.fetchedAt ? I18N.day(source.fetchedAt) + ' · ' + I18N.date(source.fetchedAt) : '—';
  let exp = '—';
  if (source.kind === 'xtream') {
    const info = state.accountInfo.get(source.id);
    exp = info ? formatAccountExpiry(info) : '…';
  }
  return kindText + ' · ' + I18N.count(source.count || 0, 'items') + ' · ' + updated + ' · ' + (t('server_expires') || 'Expires') + ': ' + exp;
}

async function fetchAccountInfo(id) {
  if (state.accountInfo.has(id)) return;
  try {
    const info = await window.api.sources.account(id);
    state.accountInfo.set(id, info || { available: false });
  } catch (_) {
    state.accountInfo.set(id, { available: false, error: 'unavailable' });
  }
  if (state.route === 'sources') render();
}

function renderSources() {
  const headActions = [
    makeButton(t('import_file'), { cls: 'btn btn-ghost btn-sm', icon: 'folder', onClick: () => importPlaylistFile() }),
    makeButton(t('add_source'), { cls: 'btn btn-primary btn-sm', icon: 'plus', onClick: () => openSourceModal() })
  ];
  view.appendChild(pageHead(t('nav_sources'), t('tagline'), headActions));

  view.appendChild(section(t('nav_sources'), state.sources.length));

  if (!state.sources.length) {
    view.appendChild(emptyBlock(t('no_sources'), t('no_sources_hint'), makeButton(t('sample_playlist'), {
      cls: 'btn btn-primary', icon: 'play', onClick: () => loadDemo()
    })));
  } else {
    const list = el('div', 'list');
    for (const source of state.sources) {
      const row = el('div', 'list-row');
      const ico = el('div', 'channel-logo');
      ico.style.borderRadius = '10px';
      ico.innerHTML = ICONS.source;
      ico.style.color = 'var(--accent)';
      row.appendChild(ico);

      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', source.name));
      main.appendChild(el('div', 'list-sub', sourceSubText(source)));
      row.appendChild(main);

      const actions = el('div', 'list-actions');
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'edit', title: t('edit'),
        onClick: () => openSourceModal(null, source)
      }));
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'refresh', title: t('refresh'),
        onClick: async (e) => {
          const btn = e.currentTarget;
          btn.classList.add('spin-ico');
          try {
            const data = await refreshSource(source.id);
            toast(t('updated') + (data && data.count != null ? ' · ' + I18N.count(data.count, 'items') : ''), 'ok');
          } catch (err) {
            toast(err.message || t('source_failed'), 'err');
          } finally {
            btn.classList.remove('spin-ico');
          }
        }
      }));
      if (source.kind === 'xtream') {
        actions.appendChild(makeButton('', {
          cls: 'icon-btn', icon: 'lock', title: 'Re-enter password / إعادة إدخال كلمة المرور',
          onClick: async () => {
            const pw = await promptModal('Re-enter password',
              'Enter the Xtream password again (after restoring a backup on another PC):', '', true);
            if (pw == null) return;
            const r = await window.api.sources.setPassword(source.id, pw);
            toast(r && r.ok ? 'Password saved' : 'Failed', r && r.ok ? 'ok' : 'err');
          }
        }));
      }
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'trash', title: t('delete'),
        onClick: async () => {
          const ok = await confirmModal(t('delete_source'), t('delete_source_q'), t('delete'), true);
          if (!ok) return;
          await window.api.sources.remove(source.id);
          await loadAllItems();
          toast(t('source_removed'), 'ok');
          render();
        }
      }));
      row.appendChild(actions);
      list.appendChild(row);
    }
    view.appendChild(list);
  }

  // Fetch Xtream account expiry lazily (cached in state.accountInfo)
  for (const source of state.sources) {
    if (source.kind === 'xtream' && !state.accountInfo.has(source.id)) {
      fetchAccountInfo(source.id);
    }
  }

  // EPG section
  const eps = state.settings.epgUrls || [];
  const epgSection = section(t('guide'), eps.length);
  const addEpg = makeButton(t('add_epg'), { cls: 'btn btn-ghost btn-sm', icon: 'plus', onClick: openEpgModal });
  epgSection.appendChild(el('div', 'spacer')).style.flex = '1';
  epgSection.appendChild(addEpg);
  view.appendChild(epgSection);

  if (!eps.length) {
    view.appendChild(emptyBlock(t('no_epg'), t('epg_url'), makeButton(t('add_epg'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: openEpgModal
    })));
  } else {
    const list = el('div', 'list');
    eps.forEach((entry) => {
      const row = el('div', 'list-row');
      const ico = el('div', 'channel-logo');
      ico.innerHTML = ICONS.guide;
      ico.style.color = 'var(--accent)';
      row.appendChild(ico);
      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', entry.name || safeDisplayUrl(entry.url)));
      main.appendChild(el('div', 'list-sub', entry.url));
      row.appendChild(main);
      const actions = el('div', 'list-actions');
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'refresh', title: t('refresh'),
        onClick: async () => {
          try {
            const res = await window.api.epg.refresh(entry.id);
            toast(I18N.count(res.count, 'items'), 'ok');
            state.epgAt = 0;
            state.epg = {};
            state.epgIndex = new Map();
            render();
          } catch (err) {
            toast(err.message || t('epg_failed'), 'err');
          }
        }
      }));
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'trash', title: t('delete'),
        onClick: async () => {
          state.settings.epgUrls = await window.api.epg.remove(entry.id);
          state.epg = {};
          state.epgIndex = new Map();
          state.epgAt = 0;
          toast(t('epg_removed'), 'ok');
          render();
        }
      }));
      row.appendChild(actions);
      list.appendChild(row);
    });
    view.appendChild(list);
  }
}

async function refreshSource(id) {
  const data = await window.api.sources.refresh(id);
  const source = state.sources.find((s) => s.id === id);
  if (source) {
    source.count = data.count;
    source.fetchedAt = data.fetchedAt;
  }
  const enriched = (data.items || []).map((it) => ({ ...it, sourceId: id, sourceName: source ? source.name : '' }));
  state.itemsBySource.set(id, enriched);
  rebuildItems();
  if (state.route === 'sources' || state.route === 'home') render();
  return data;
}

/* ===================== Add source modal ===================== */

function openSourceModal(preset, editSource) {
  const wrap = el('div');
  const isEdit = !!editSource;
  wrap.appendChild(el('h2', null, isEdit ? (t('edit_source') || 'Edit source') : t('add_source')));
  wrap.appendChild(el('p', 'lead', t('no_sources_hint')));
  // Security warning: plaintext HTTP exposes Xtream credentials on the network.
  const httpWarn = el('p', 'hint', '⚠ ' + (I18N.lang === 'ar'
    ? 'روابط http:// غير مشفّرة — قد تظهر بيانات اشتراكك (Xtream) على الشبكة. استخدم https:// إن توفر.'
    : 'http:// URLs are unencrypted — Xtream credentials may be exposed on the network. Prefer https:// where available.'));
  httpWarn.style.color = '#e0a030';
  wrap.appendChild(httpWarn);

  const form = el('div', 'form-grid');

  const nameField = field(t('source_name'), inputNode('text', 'GomizPlayer IPTV playlist'));
  const typeField = field(t('source_type'), makeDarkSelect(
    [['m3u', t('type_playlist')], ['xtream', t('type_xtream')], ['single', t('type_single')]],
    'm3u',
    (v) => {
      const vk = String(v);
      userField.hidden = vk !== 'xtream';
      passField.hidden = vk !== 'xtream';
      urlInput.placeholder = vk === 'xtream'
        ? 'http://host:8080'
        : (vk === 'single' ? 'https://example.com/stream.m3u8' : 'https://example.com/playlist.m3u');
    },
    { width: '100%' }
  ));

  const urlInput = inputNode('text', 'https://example.com/playlist.m3u');
  const urlField = field(t('source_url'), urlInput);
  urlField.classList.add('full');

  const browseBtn = makeButton(t('import_file'), {
    cls: 'btn btn-ghost btn-sm', icon: 'folder',
    onClick: async () => {
      const file = await window.api.dialog.openFile('playlist');
      if (!file) return;
      urlInput.value = file;
      if (!nameField.input.value) nameField.input.value = file.split(/[\\/]/).pop().replace(/\.(m3u8?|txt)$/i, '');
      typeSel.value = 'm3u';
    }
  });
  urlField.appendChild(browseBtn);
  browseBtn.style.marginTop = '6px';
  browseBtn.style.alignSelf = 'flex-start';

  const typeSel = typeField.querySelector('.dark-select');
  const userInput = inputNode('text', '');
  const passInput = inputNode('password', '');
  const userField = field(t('username'), userInput);
  const passField = field(t('password'), passInput);
  userField.hidden = true;
  passField.hidden = true;

  const headersInput = el('textarea', 'textarea');
  headersInput.placeholder = 'User-Agent: VLC/3.0.21\nReferer: https://example.com';
  const headersField = field(t('headers') + ' (' + t('optional') + ')', headersInput);
  headersField.classList.add('full');

  form.appendChild(nameField);
  form.appendChild(typeField);
  form.appendChild(urlField);
  form.appendChild(userField);
  form.appendChild(passField);
  form.appendChild(headersField);
  wrap.appendChild(form);

  if (editSource) {
    nameField.input.value = editSource.name || '';
    typeSel.value = editSource.kind || 'm3u';
    urlInput.value = editSource.url || '';
    userInput.value = editSource.username || '';
    userField.hidden = editSource.kind !== 'xtream';
    passField.hidden = editSource.kind !== 'xtream';
    const h = editSource.headers || {};
    headersInput.value = Object.entries(h).map(([k, v]) => k + ': ' + v).join('\n');
    passInput.placeholder = '•••••• (unchanged)';
  }

  if (preset && preset.url) {
    urlInput.value = preset.url;
    if (preset.name) nameField.input.value = preset.name;
  }

  const actions = el('div', 'modal-actions');
  const cancel = makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: closeModal });
  const submit = makeButton(isEdit ? (t('save') || 'Save') : t('add'), { cls: 'btn btn-primary', icon: isEdit ? 'check' : 'plus' });

  submit.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      urlInput.focus();
      return;
    }
    const headers = {};
    headersInput.value.split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    const name = nameField.input.value.trim() || url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || 'Source';
    const kind = typeSel.value;

    submit.disabled = true;
    submit.classList.add('spin-ico');
    try {
      const payload = { name, url, kind, username: userInput.value, headers };
      if (passInput.value) payload.password = passInput.value;
      const res = isEdit
        ? await window.api.sources.update(editSource.id, payload)
        : await window.api.sources.add({ ...payload, password: passInput.value });
      closeModal();
      if (res.error) toast(t('source_failed') + ': ' + res.error, 'err');
      else toast(t('source_added'), 'ok');
      await window.api.settings.patch({ onboarded: true });
      state.settings = await window.api.settings.get();
      await loadAllItems();
      navigate('sources', { replace: true });
      render();
    } catch (err) {
      toast(err.message || t('source_failed'), 'err');
    } finally {
      submit.disabled = false;
      submit.classList.remove('spin-ico');
    }
  });

  actions.appendChild(cancel);
  actions.appendChild(submit);
  openModalWithActions(wrap, actions);
  setTimeout(() => urlInput.focus(), 60);
}

function field(labelText, input) {
  const box = el('div', 'field');
  box.appendChild(el('label', null, labelText));
  box.appendChild(input);
  box.input = input;
  return box;
}

function inputNode(type, placeholder) {
  const input = el('input', 'input');
  input.type = type;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

async function importPlaylistFile() {
  const file = await window.api.dialog.openFile('playlist');
  if (!file) return;
  openSourceModal({ url: file, name: file.split(/[\\/]/).pop().replace(/\.(m3u8?|txt)$/i, '') });
}

function openEpgModal() {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('add_epg')));
  wrap.appendChild(el('p', 'lead', t('no_epg')));

  const urlInput = inputNode('text', 'https://example.com/epg.xml');
  const urlField = field(t('epg_url'), urlInput);
  urlField.classList.add('full');
  const browse = makeButton(t('import_file'), {
    cls: 'btn btn-ghost btn-sm', icon: 'folder',
    onClick: async () => {
      const file = await window.api.dialog.openFile('epg');
      if (file) urlInput.value = file;
    }
  });
  urlField.appendChild(browse);
  browse.style.marginTop = '6px';
  browse.style.alignSelf = 'flex-start';

  const nameInput = inputNode('text', 'TV Guide');
  const nameField = field(t('name'), nameInput);
  wrap.appendChild(urlField);
  wrap.appendChild(nameField);

  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: closeModal }));
  const submit = makeButton(t('add'), { cls: 'btn btn-primary', icon: 'plus' });
  submit.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }
    submit.disabled = true;
    try {
      const res = await window.api.epg.add(url, nameInput.value.trim() || 'TV Guide');
      closeModal();
      if (res.error) toast(t('epg_failed') + ': ' + res.error, 'err');
      else toast(t('epg_added') + ' · ' + I18N.number(res.count), 'ok');
      state.settings = await window.api.settings.get();
      state.epg = {};
      state.epgIndex = new Map();
      state.epgAt = 0;
      render();
    } catch (err) {
      toast(err.message || t('epg_failed'), 'err');
    } finally {
      submit.disabled = false;
    }
  });
  actions.appendChild(submit);
  openModalWithActions(wrap, actions);
  setTimeout(() => urlInput.focus(), 60);
}

/* ===================== Downloads ===================== */

function renderDownloads() {
  view.appendChild(pageHead(t('downloads'), I18N.count(state.downloads.length, 'items'), [
    makeButton(t('data_folder'), {
      cls: 'btn btn-ghost btn-sm', icon: 'folder',
      onClick: () => { if (state.info) window.api.shell.showItem(state.info.dataDir + '\\'); }
    })
  ]));

  if (!state.downloads.length) {
    view.appendChild(emptyBlock(t('empty'), t('download_stream_error')));
    return;
  }

  const list = el('div', 'list');
  for (const rec of state.downloads) {
    const row = el('div', 'dl-row');
    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', rec.title || safeDisplayUrl(rec.url)));
    const pct = rec.total > 0 ? Math.min(100, Math.round((rec.received / rec.total) * 100)) : rec.state === 'Complete' ? 100 : 0;
    const info = el('div', 'list-sub', ltr(humanBytes(rec.received) + ' / ' + (rec.total ? humanBytes(rec.total) : '—') + ' · ' + I18N.number(pct) + '%'));
    main.appendChild(info);
    const bar = el('div', 'dl-bar');
    const fill = el('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    main.appendChild(bar);
    if (rec.error) main.appendChild(el('div', 'list-sub', rec.error));
    row.appendChild(main);

    const stateLabel = el('span', 'dl-state ' + rec.state, t((rec.state || 'waiting').toLowerCase()) || rec.state);
    row.appendChild(stateLabel);

    const actions = el('div', 'list-actions');
    if (rec.state === 'Downloading' || rec.state === 'Waiting') {
      actions.appendChild(makeButton('', { cls: 'icon-btn', icon: 'pause', title: t('pause'), onClick: async () => { await window.api.downloads.pause(rec.id); } }));
    } else if (rec.state === 'Paused' || rec.state === 'Failed') {
      actions.appendChild(makeButton('', { cls: 'icon-btn', icon: 'play', title: t('resume'), onClick: async () => { await window.api.downloads.resume(rec.id); } }));
    }
    if (rec.state === 'Complete' && rec.file) {
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'play', title: t('play'),
        onClick: () => {
          playItem({
            key: 'file:' + rec.id,
            name: rec.title,
            url: fileUrl(rec.file),
            kind: 'vod',
            group: t('downloads'),
            logo: rec.logo
          }, []);
        }
      }));
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'folder', title: t('open_folder'),
        onClick: () => window.api.shell.showItem(rec.file)
      }));
    }
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'trash', title: t('delete'),
      onClick: async () => {
        const ok = await confirmModal(t('remove_download'), t('remove_download_q'), t('delete'), true);
        if (!ok) return;
        state.downloads = await window.api.downloads.remove(rec.id);
        render();
      }
    }));
    row.appendChild(actions);

    list.appendChild(row);
  }
  view.appendChild(list);
}

function renderRecordings() {
  view.appendChild(pageHead(t('nav_recordings'), I18N.count((state.recordings || []).length, 'items')));

  if (!state.recordings || !state.recordings.length) {
    view.appendChild(emptyBlock(t('empty'), t('no_recordings_yet')));
    return;
  }

  const list = el('div', 'list');
  for (const rec of state.recordings) {
    const row = el('div', 'dl-row');
    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', rec.name));
    const info = el('div', 'list-sub', humanBytes(rec.size || 0));
    main.appendChild(info);
    row.appendChild(main);

    const actions = el('div', 'list-actions');
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'play', title: t('play'),
      onClick: () => {
        const url = encodeURI('file:///' + String(rec.path).replace(/\\/g, '/'));
        playItem({ key: 'rec:' + rec.path, name: rec.name, kind: 'movie', url, group: 'Recordings' }, state.recordings.map((r) => ({ key: 'rec:' + r.path, name: r.name, kind: 'movie', url: encodeURI('file:///' + String(r.path).replace(/\\/g, '/')), group: 'Recordings' })));
      }
    }));
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'folder', title: t('open_folder'),
      onClick: () => window.api.shell.showItem(rec.path)
    }));
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'trash', title: t('delete'),
      onClick: async () => {
        if (state.recordingPath && String(state.recordingPath).toLowerCase() === String(rec.path).toLowerCase()) {
          toast(t('recording_active'), 'err');
          return;
        }
        if (player && player.item && String(player.item.key) === 'rec:' + rec.path) {
          try { player.close(true); } catch (_) {}
        }
        const ok = await confirmYesNo(t('delete_recording'), t('delete_recording_q'), true);
        if (!ok) return;
        const res = await window.api.recording.delete(rec.path);
        if (res && res.ok) toast(t('deleted'), 'ok');
        else toast((res && res.error ? res.error + ': ' : '') + t('error'), 'err');
        await refreshRecordings();
      }
    }));
    row.appendChild(actions);
    list.appendChild(row);
  }
  view.appendChild(list);
}

/* ===================== Settings ===================== */


  const ACCENT_PRESETS = [
    { c: '#ff3d5a', n: 'Red' },
    { c: '#ff7a45', n: 'Orange' },
    { c: '#ffb020', n: 'Amber' },
    { c: '#38d39f', n: 'Green' },
    { c: '#4da3ff', n: 'Blue' },
    { c: '#9b6bff', n: 'Violet' }
  ];

  function hexToRgb(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixHex(hex, withHex, t) {
    const a = hexToRgb(hex);
    const b = hexToRgb(withHex);
    const mix = (x, y) => Math.round(x + (y - x) * t);
    const r = mix(a.r, b.r), g = mix(a.g, b.g), bl = mix(a.b, b.b);
    const ch = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
    return '#' + ch(r) + ch(g) + ch(bl);
  }

  /* Apply a custom accent (and its soft glow) to the CSS variables. */
  function applyAccent(accent, accent2) {
    const root = document.documentElement;
    const a = accent || '#ff3d5a';
    const a2 = accent2 || mixHex(a, '#ffffff', 0.32);
    root.style.setProperty('--accent', a);
    root.style.setProperty('--accent-2', a2);
    const rgb = hexToRgb(a);
    root.style.setProperty('--accent-soft', 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.14)');
  }

  function applyAccessibility() {
    const s = state.settings || {};
    const root = document.documentElement;
    root.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
    root.dataset.highContrast = s.highContrast ? 'true' : 'false';
    const scale = Math.min(140, Math.max(80, Number(s.uiScale || 100))) / 100;
    root.style.setProperty('--ui-scale', String(scale));
  }

  async function pickAccent(c) {
    const a2 = state.settings.accent2 || mixHex(c, '#ffffff', 0.32);
    await patchSettings({ accent: c, accent2: a2 });
  }














const darkOpenSelects = new Set();
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (darkOpenSelects.size === 0) return;
    // Clicks inside a dark-select wrap (button or options) are handled by the wrap itself
    const t = e && e.target;
    if (t && t.closest && t.closest('.dark-select')) return;
    Array.from(darkOpenSelects).forEach((w) => { if (w._closeMenu) w._closeMenu(); });
  });
}




/* ===================== Modal plumbing ===================== */



let confirmResolve = null;




/* ===================== Data loading ===================== */

async function loadAllItems() {
  state.loading = true;
  try {
    state.sources = await window.api.sources.list();
    const merged = new Map();
    for (const source of state.sources) {
      let data = await window.api.sources.items(source.id);
      if (!data) {
        try {
          data = await window.api.sources.refresh(source.id);
          source.count = data.count;
          source.fetchedAt = data.fetchedAt;
        } catch (_) {
          continue;
        }
      }
      const items = (data.items || []).filter((x) => !x.hidden);
      state.itemsBySource.set(source.id, items.map((it) => ({ ...it, sourceId: source.id, sourceName: source.name })));
      for (const item of state.itemsBySource.get(source.id)) {
        if (!merged.has(item.key)) merged.set(item.key, item);
      }
    }
    state.items = Array.from(merged.values());
  } finally {
    state.loading = false;
  }
}

function rebuildItems() {
  const merged = new Map();
  for (const [id, list] of state.itemsBySource.entries()) {
    for (const item of list) {
      if (item.hidden) continue;
      if (!merged.has(item.key)) merged.set(item.key, item);
    }
  }
  state.items = Array.from(merged.values());
}

async function refreshLibrary() {
  try {
    state.profiles = await window.api.profiles.list();
  } catch (_) {}
  try {
    state.library = await window.api.library.get(activeProfile());
  } catch (_) {
    state.library = { favorites: [], history: [], liveHistory: [], search: [] };
  }
}

async function refreshDownloads() {
  try {
    state.downloads = await window.api.downloads.list();
  } catch (_) {
    state.downloads = [];
  }
}

async function refreshRecordingStatus() {
  try {
    const st = await window.api.recording.status();
    state.recordingTarget = (st && st.recording && st.target) ? st.target : null;
    state.recordingPath = (st && st.recording) ? st.path : null;
  } catch (_) {
    state.recordingTarget = null;
    state.recordingPath = null;
  }
  const route = state.route;
  if (route === 'home' || route === 'live' || route === 'movies' || route === 'series' || route === 'favorites' || route === 'search' || route === 'history' || route === 'recordings') {
    render();
  }
}

async function refreshRecordings() {
  try {
    state.recordings = await window.api.recording.list();
  } catch (_) {
    state.recordings = [];
  }
  await refreshRecordingStatus();
  if (player && player.recordBadge) {
    player.recordBadge.textContent = state.recordings.length;
    player.recordBadge.hidden = !state.recordings.length;
  }
  if (state.route === 'home' || state.route === 'recordings') render();
}

















/* ===================== Boot ===================== */





boot();

/* Test / debugging hook (harmless in normal use). */
window.__novaTest = {
  state,
  player: () => player,
  play: (item, list) => playItem(item, list),
  openLive: () => openLiveReceiver(),
  detail: (item, list) => showDetail(item, list),
  guide: () => openGuide(),
  setLanguage: async (lang) => { await setLanguage(lang); render(); },
  refreshWeather: () => loadLocationWeatherPrayer(),
  reload: async () => {
    await loadAllItems();
    await refreshLibrary();
    await refreshDownloads();
    await refreshRecordings();
    render();
  },
  navigate: (route) => navigate(route, { replace: true }),
  render
};
