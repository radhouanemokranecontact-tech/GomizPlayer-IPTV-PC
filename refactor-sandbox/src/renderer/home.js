/* home.js — split from app.js (classic script, shared global scope). */

function widgetRefreshButton() {
  const b = el('button', 'wc-refresh');
  b.type = 'button';
  const label = t('refresh') || 'Refresh';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    b.classList.add('spinning');
    try { await loadLocationWeatherPrayer(); }
    finally { b.classList.remove('spinning'); b.disabled = false; }
  });
  return b;
}

function safeDisplayUrl(url) {
  try {
    const s = String(url || '');
    return s.replace(/([?&](?:username|user|password|pass|token|apikey)=)[^&#\s]+/gi, '$1••••');
  } catch (_) { return String(url || ''); }
}

function homeWidget() {
  const s = state.settings || {};
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 18;
  const wrap = el('div', 'home-widget premium' + (isNight ? ' wc-night' : ' wc-day'));

  /* ---------- Clock card ---------- */
  const clock = el('section', 'wc-card wc-clock');
  clock.id = 'wcClockCard';
  clock.appendChild(premiumTag(t('widget_time') || 'Local Time', 'wc-clock-dot'));
  clock.appendChild(widgetRefreshButton());
  const clockValue = el('div', 'wc-value wc-value-mono', formatTime(new Date()));
  clockValue.id = 'homeClock';
  const analogGlyph = el('div', 'wc-glyph wc-glyph-svg');
  analogGlyph.innerHTML = analogClockSVG();
  const clockRow = el('div', 'wc-row');
  clockRow.appendChild(analogGlyph);
  clockRow.appendChild(clockValue);
  clock.appendChild(clockRow);
  const clockSub = el('div', 'wc-sub', new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
  clockSub.id = 'homeClockDate';
  clock.appendChild(clockSub);
  if (s.widgetClock === false) clock.classList.add('hidden-ui');

  /* ---------- Weather card ---------- */
  const weather = el('section', 'wc-card wc-weather');
  weather.id = 'wcWeatherCard';
  weather.appendChild(premiumTag(t('widget_weather') || 'Weather', 'wc-weather-dot'));
  weather.appendChild(widgetRefreshButton());
  const wRow = el('div', 'wc-row');
  const wGlyph = el('div', 'wc-glyph wc-glyph-svg');
  wGlyph.innerHTML = weatherGlyph(state.weather && state.weather.icon, state.weather && state.weather.isDay);
  wGlyph.id = 'homeWeatherGlyph';
  wRow.appendChild(wGlyph);
  const wCol = el('div', 'wc-col');
  const wValue = el('div', 'wc-value', formatTemp(state.weather && state.weather.tempC));
  wValue.id = 'homeWeatherTemp';
  wCol.appendChild(wValue);
  let wSubText = '';
  if (state.weather && state.location) {
    const wind = state.weather.windspeed != null ? Math.round(Number(state.weather.windspeed)) : null;
    const windDir = state.weather.winddirection != null ? Math.round(Number(state.weather.winddirection)) : null;
    const parts = [state.weather.desc, state.location.city].filter(Boolean);
    if (wind != null) parts.push((I18N.lang === 'ar' ? 'ريح ' : 'wind ') + wind + ' km/h' + (windDir != null ? ' · ' + windDir + '°' : ''));
    wSubText = parts.join(' · ');
  } else if (state.weatherStatus === 'custom:notfound') {
    wSubText = t('city_not_found');
  } else if (state.weatherError === 'no_location' || state.weatherStatus === 'unavailable') {
    wSubText = t('weather_unavailable');
  } else if (state.weatherError) {
    wSubText = t('weather_unavailable');
  } else {
    wSubText = t('loading');
  }
  const wSub = el('div', 'wc-sub', wSubText);
  wSub.id = 'homeWeatherDesc';
  wSub.title = state.weatherError || state.weatherStatus || '';
  wCol.appendChild(wSub);
  wRow.appendChild(wCol);
  weather.appendChild(wRow);
  if (s.widgetWeather === false) weather.classList.add('hidden-ui');

  /* ---------- Prayer card ---------- */
  const prayer = el('section', 'wc-card wc-prayer');
  prayer.id = 'wcPrayerCard';
  prayer.appendChild(premiumTag(t('widget_prayer') || 'Prayer times', 'wc-prayer-dot'));
  prayer.appendChild(widgetRefreshButton());
  const pRow = el('div', 'wc-row');
  const pGlyph = el('div', 'wc-glyph wc-glyph-svg');
  pGlyph.innerHTML = mosqueSVG();
  pRow.appendChild(pGlyph);
  const pCol = el('div', 'wc-col');
  const pValue = el('div', 'wc-value');
  pValue.id = 'homePrayerName';
  pCol.appendChild(pValue);
  const pSub = el('div', 'wc-sub');
  pSub.id = 'homePrayerDetail';
  if (state.prayer) {
    // handled by updatePrayerCountdown() every second
  } else if (state.weatherError || state.weatherStatus === 'unavailable') {
    pSub.textContent = t('weather_unavailable');
  } else {
    pSub.textContent = t('loading');
  }
  pCol.appendChild(pSub);
  pRow.appendChild(pCol);
  prayer.appendChild(pRow);
  if (state.prayer) {
    const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const labels = { Fajr: t('fajr') || 'Fajr', Dhuhr: t('dhuhr') || 'Dhuhr', Asr: t('asr') || 'Asr', Maghrib: t('maghrib') || 'Maghrib', Isha: t('isha') || 'Isha' };
    prayer.title = prayers.map((p) => (labels[p] || p) + ' ' + (state.prayer[p] || '')).join('  ·  ');
  }
  if (s.widgetPrayer === false) prayer.classList.add('hidden-ui');

  wrap.appendChild(clock);
  wrap.appendChild(weather);
  wrap.appendChild(prayer);
  setTimeout(updateWidgetBackgrounds, 0);
  return wrap;
}

function premiumTag(text, dotClass) {
  const chip = el('div', 'wc-tag');
  chip.appendChild(el('span', 'wc-tag-dot ' + (dotClass || '')));
  chip.appendChild(el('span', 'wc-tag-text', text));
  return chip;
}

function pickHeroSet(n = HERO_COUNT) {
  const withLogo = state.items.filter((x) => x.logo);
  const featured = withLogo.filter((x) => isMovieKind(x) || isSeriesKind(x));
  const vodOnly = state.items.filter((x) => isMovieKind(x) || isSeriesKind(x));
  const pool = featured.length ? featured : vodOnly.length ? vodOnly : state.items;
  if (!pool.length) return [];
  // Show the LATEST items first (playlist order is assumed newest-last).
  const ordered = pool.slice().reverse();
  const out = [];
  const step = Math.max(1, Math.floor(ordered.length / n));
  for (let i = 0; i < ordered.length && out.length < n; i += step) out.push(ordered[i]);
  let k = 0;
  while (out.length < n && k < ordered.length) {
    const cand = ordered[k++];
    if (!out.includes(cand)) out.push(cand);
  }
  return out.slice(0, n);
}

function renderHome() {
  if (!state.sources.length) {
    renderWelcome();
    return;
  }
  if (!state.items.length) {
    view.appendChild(pageHead(t('nav_home'), t('tagline')));
    view.appendChild(emptyBlock(t('empty'), t('empty_hint'), makeButton(t('add_source'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: () => openSourceModal()
    })));
    return;
  }

  const layout = homeLayout();
  const limit = layout.rowLimit;

  // ---- Weather / time / prayer widget (top, before hero) ----
  view.appendChild(homeWidget());

  const heroSet = pickHeroSet(HERO_COUNT);
  const _split = splitKinds(state.items);
  const live = _split.live;
  const moviesAll = _split.movies;
  const seriesAll = _split.series;

  for (const id of layout.order) {
    if (layout.hidden.includes(id)) continue;

    if (id === 'hero') {
      const carousel = renderHomeCarousel(heroSet);
      if (carousel) view.appendChild(carousel);
      continue;
    }

    if (id === 'live') {
      if (!live.length) continue;
      view.appendChild(section(t('nav_live'), I18N.number(live.length), t('view_all'), () => navigate('live')));
      view.appendChild(cardsRow(live, live, { limit }));
      continue;
    }

    if (id === 'movies') {
      if (!moviesAll.length) continue;
      view.appendChild(section(t('nav_movies'), I18N.number(moviesAll.length), t('view_all'), () => navigate('movies')));
      view.appendChild(cardsRow(moviesAll, moviesAll, { limit }));
      continue;
    }

    if (id === 'series') {
      if (!seriesAll.length) continue;
      view.appendChild(section(t('nav_series'), I18N.number(seriesAll.length), t('view_all'), () => navigate('series')));
      view.appendChild(cardsRow(seriesAll, seriesAll, { limit }));
      continue;
    }
  }
}

function renderHomeCarousel(items) {
  if (!items || !items.length) return null;
  const total = Math.min(items.length, HERO_COUNT);
  const wrap = el('div', 'hero hero-carousel');
  const viewport = el('div', 'hero-viewport');

  for (let s = 0; s < total; s++) {
    const item = items[s];
    const slide = el('section', 'hero-slide');
    slide.setAttribute('aria-label', String(item.name || ''));

    const bg = el('div', 'hero-bg');
    if (item.logo) {
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = item.logo;
      img.addEventListener('error', () => { img.remove(); slide.classList.add('hero-plain'); });
      bg.appendChild(img);
    } else {
      slide.classList.add('hero-plain');
    }
    slide.appendChild(bg);

    const content = el('div', 'hero-content');
    const kicker = el('div', 'hero-kicker');
    kicker.appendChild(el('span', null, item.kind === 'live' ? t('live') : item.kind === 'series' ? t('nav_series') : t('nav_movies')));
    content.appendChild(kicker);
    content.appendChild(el('h2', 'hero-title', item.name));

    const count = state.items.filter((x) => x.group === item.group).length;
    const meta = el('p', 'hero-desc');
    const parts = [];
    if (item.group) parts.push(item.group);
    parts.push(I18N.count(count, item.kind === 'live' ? 'channels' : 'items'));
    if (item.sourceName) parts.push(item.sourceName);
    parts.forEach((text) => meta.appendChild(el('span', 'hero-desc-part', text)));
    content.appendChild(meta);

    const actions = el('div', 'hero-actions');
    actions.appendChild(makeButton(t('play'), {
      cls: 'btn btn-primary',
      icon: 'play',
      onClick: () => (item.kind === 'live' ? playItem(item, state.items.filter((x) => x.kind === 'live')) : playItem(item, state.items))
    }));
    if (item.kind !== 'live') {
      actions.appendChild(makeButton(t('details'), { cls: 'btn btn-ghost', icon: 'info', onClick: () => showDetail(item, state.items) }));
    }
    const fav = isFavorite(item.key);
    actions.appendChild(makeButton(fav ? t('unfavorite') : t('favorite'), {
      cls: 'btn btn-ghost',
      icon: 'heart',
      onClick: () => toggleFavorite(item)
    }));
    content.appendChild(actions);
    slide.appendChild(content);
    viewport.appendChild(slide);
  }
  wrap.appendChild(viewport);

  let idx = 0;
  let timer = null;
  const stopAuto = () => { if (timer) { clearInterval(timer); timer = null; } };
  const go = (i) => {
    idx = (i + total) % total;
    viewport.style.transform = 'translateX(' + (-idx * 100) + '%)';
    const dots = wrap.querySelectorAll('.hero-dot');
    dots.forEach((d, di) => d.classList.toggle('on', di === idx));
  };
  const startAuto = () => {
    stopAuto();
    if (total <= 1) return;
    timer = setInterval(() => {
      if (!wrap.isConnected) { stopAuto(); return; }
      go(idx + 1);
    }, 3000);
  };

  if (total > 1) {
    const prev = makeButton('', { cls: 'hero-arrow prev', icon: 'prev', onClick: () => { go(idx - 1); stopAuto(); } });
    prev.setAttribute('aria-label', 'Previous');
    const next = makeButton('', { cls: 'hero-arrow next', icon: 'next', onClick: () => { go(idx + 1); stopAuto(); } });
    next.setAttribute('aria-label', 'Next');
    wrap.appendChild(prev);
    wrap.appendChild(next);
    const side = el('div', 'hero-side');
    for (let d = 0; d < total; d++) {
      const dot = el('button', 'hero-dot');
      dot.setAttribute('aria-label', 'Slide ' + (d + 1));
      dot.addEventListener('click', () => { go(d); stopAuto(); });
      side.appendChild(dot);
    }
    wrap.appendChild(side);
  }

  wrap.addEventListener('mouseenter', stopAuto);
  wrap.addEventListener('mouseleave', startAuto);
  go(0);
  startAuto();
  return wrap;
}

function updatePrayerCountdown() {
  const big = document.getElementById('homePrayerName');
  const detail = document.getElementById('homePrayerDetail');
  const info = getNextPrayerInfo(state.prayer, new Date());
  if (big && detail) {
    if (info) {
      big.textContent = info.time || '--:--';
      detail.textContent = t('next_prayer') + ': ' + (info.label || '') + ' · ' + formatCountdown(info.remaining);
      big.dataset.ready = '1';
    } else {
      big.textContent = '—';
      detail.textContent = t('loading');
      delete big.dataset.ready;
    }
  }
  const pBig = document.getElementById('playerPrayerName');
  const pDetail = document.getElementById('playerPrayerDetail');
  if (pBig && pDetail && info) { /* player handles its own */ }
}

function updateWidgetBackgrounds() {
  const now = new Date();
  const tod = timeOfDayKey(now);
  const setBg = (id, bg) => { const n = document.getElementById(id); if (n && n.dataset.bg !== bg) n.dataset.bg = bg; };

  // Clock card follows the time of day.
  setBg('wcClockCard', tod);

  // Weather card follows the current condition (and night clear sky).
  const w = state.weather;
  let wb = tod;
  if (w && w.icon !== undefined && w.icon !== null) {
    const b = wmoBucket(Number(w.icon));
    wb = ({ clear: 'clear', partly: 'cloudy', overcast: 'cloudy', fog: 'fog', rain: 'rain', snow: 'snow', thunder: 'thunder' })[b] || tod;
    if (wb === 'clear' && tod === 'night') wb = 'night';
  }
  setBg('wcWeatherCard', wb);

  // Prayer card shifts to a golden glow when the next prayer is close.
  const info = getNextPrayerInfo(state.prayer, now);
  let pb = tod === 'night' ? 'prayer-night' : 'prayer';
  if (info && info.remaining != null && info.remaining <= 1800) pb = 'prayer-near';
  setBg('wcPrayerCard', pb);
}

function startClock() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  const tick = () => {
    const now = new Date();
    const elc = document.getElementById('homeClock');
    if (elc) elc.textContent = formatTime(now);
    const setHand = (id, deg) => { const n = document.getElementById(id); if (n) n.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' 24 24)'); };
    setHand('clkHour', (now.getHours() % 12) * 30 + now.getMinutes() * 0.5);
    setHand('clkMin', now.getMinutes() * 6 + now.getSeconds() * 0.1);
    setHand('clkSec', now.getSeconds() * 6);
    updateWidgetBackgrounds();
    const dateEl = document.getElementById('homeClockDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    updatePrayerCountdown();
  };
  tick();
  state.clockTimer = setInterval(tick, 1000);
  state.prayerCountdownTimer = setInterval(updatePrayerCountdown, 1000);
}

async function resolveWeatherLocation() {
  const s = state.settings || {};
  const customCity = String(s.weatherCity || '').trim();
  if (customCity) {
    let lat = Number(s.weatherLat);
    let lon = Number(s.weatherLon);
    let city = customCity;
    let country = String(s.weatherCountry || '');
    if (!(lat && lon)) {
      try {
        const lang = /^[a-z]/i.test(s.language) ? s.language : 'en';
        const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(customCity) + '&count=1&language=' + lang + '&format=json');
        const gj = await g.json();
        const res = gj && gj.results && gj.results[0];
        if (res) { lat = res.latitude; lon = res.longitude; city = res.name || customCity; country = res.country || ''; }
      } catch (_) {}
    }
    state.location = lat && lon ? { city, country, lat, lon } : null;
    state.weatherStatus = state.location ? ('custom:' + city) : 'custom:notfound';
    if (state.location) await patchSettings({ weatherLat: lat, weatherLon: lon, weatherCountry: country, weatherCity: city });
    return;
  }
  // Auto-detect via ipwho.is (free, HTTPS, CORS-enabled, no key)
  let ok = false;
  try {
    const r = await fetch('https://ipwho.is/');
    const loc = await r.json();
    if (loc && (loc.success !== false) && loc.latitude && loc.longitude) {
      state.location = { city: loc.city || '', country: loc.country || loc.country_code || '', lat: loc.latitude, lon: loc.longitude };
      ok = true;
    }
  } catch (_) { ok = false; }
  state.weatherStatus = ok ? ('auto:' + ((state.location && state.location.city) || '')) : 'unavailable';
  if (!ok) state.location = null;
}

async function loadLocationWeatherPrayer(_report) {
  await resolveWeatherLocation();
  state.weather = null;
  state.prayer = null;
  state.weatherError = '';
  // Weather via Open-Meteo (free, CORS, no key)
  if (state.location && state.location.lat && state.location.lon) {
    try {
      const params = new URLSearchParams({
        latitude: String(state.location.lat),
        longitude: String(state.location.lon),
        current_weather: 'true',
        timezone: 'auto'
      });
      const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString());
      const data = await r.json();
      const cw = data && data.current_weather;
      if (cw) {
        state.weather = {
          tempC: Number(cw.temperature),
          tempF: Math.round(Number(cw.temperature) * 9 / 5 + 32),
          desc: weatherDescription(cw.weathercode),
          icon: String(cw.weathercode == null ? '' : cw.weathercode),
          isDay: cw.is_day === 1 ? true : (cw.is_day === 0 ? false : null),
          windspeed: cw.windspeed,
          winddirection: cw.winddirection,
          time: cw.time || null
        };
      }
    } catch (err) {
      state.weather = null;
      state.weatherError = String((err && err.message) || err || 'weather_error');
      if (typeof console !== 'undefined' && console.warn) console.warn('[weather] fetch failed:', state.weatherError);
    }
    // Prayer
    try {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const method = Number((state.settings || {}).prayerMethod || 2);
      const school = Number((state.settings || {}).prayerSchool || 0);
      const url = 'https://api.aladhan.com/v1/timings/' + dd + '-' + mm + '-' + yyyy + '?latitude=' + state.location.lat + '&longitude=' + state.location.lon + '&method=' + method + '&school=' + school;
      const r = await fetch(url);
      const data = await r.json();
      if (data && data.data && data.data.timings) state.prayer = data.data.timings;
    } catch (err) {
      state.prayer = null;
      if (typeof console !== 'undefined' && console.warn) console.warn('[prayer] fetch failed:', String((err && err.message) || err));
    }
  } else {
    state.weatherError = state.weatherStatus === 'custom:notfound' ? 'city_not_found' : 'no_location';
  }
  if (player && player.updateTopWidget) player.updateTopWidget();
  if (state.route === 'home') render();
  if (state.route === 'settings' && state.settingsTab === 'general') render();
}

function startWeatherAndPrayer() {
  loadLocationWeatherPrayer();
  // refresh weather/prayer every 10 minutes
  setInterval(loadLocationWeatherPrayer, 10 * 60 * 1000);
}

async function pickLocation(city) {
  const clean = String(city || '').trim();
  await patchSettings({ weatherCity: clean, weatherLat: 0, weatherLon: 0, weatherCountry: '' });
  await loadLocationWeatherPrayer();
}

function applyWidgetToggles() {
  const s = state.settings || {};
  const set = (id, key, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = s[key] === undefined ? fallback : !!s[key];
    el.classList.toggle('hidden-ui', !on);
  };
  set('ptwClock', 'widgetClock', true);
  set('ptwWeather', 'widgetWeather', true);
  set('ptwPrayer', 'widgetPrayer', true);
  const homeClock = document.getElementById('homeClock');
  if (homeClock) homeClock.classList.toggle('hidden-ui', !(state.settings && state.settings.widgetClock !== false));
}

