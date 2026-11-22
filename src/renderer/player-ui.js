/* player-ui.js — split from app.js (classic script, shared global scope). */

function playItem(item, list, opts) {
  const playlist = (list || []).filter((x) => x && x.url);
  const p = ensurePlayer();
  const favMode = !!(opts && opts.favoritesMode);
  p.openItem(item, {
    playlist,
    resume: resumeFor(item),
    logo: item.logo,
    epg: item.kind === 'live' ? epgNowNext(item) : null,
    getEpgFor: (channel) => epgNowNext(channel),
    onAddEpg: () => {
      p.close();
      openEpgModal();
    },
    favoritesMode: favMode
  });
  // EPG may not be loaded yet when a channel is opened from Home or search.
  if (isLiveKind(item) && !epgNowNext(item)) {
    loadEpgFor([item]).then(() => {
      if (player && player.item && player.item.key === item.key) player.setEpg(epgNowNext(item));
    }).catch(() => {});
  }
}

function lastLiveChannel(live, mode) {
  const m = mode || null;
  const recent = state.library.liveHistory || [];
  for (const entry of recent) {
    if (!entry) continue;
    if (m && (entry.mode || 'live') !== m) continue;
    const found = live.find((x) => entry.key && x.key === entry.key)
      || live.find((x) => x.url && x.url === entry.url && (x.name || '') === (entry.name || ''));
    if (found) return found;
  }
  return null;
}

function openLiveReceiver(mode) {
  const isFav = mode === 'favorites';
  state.liveEntry = isFav ? 'favorites' : 'live';
  const live = state.items.filter((x) => isLiveKind(x) && x.url);
  if (!live.length) {
    toast(t('empty_hint'), 'err');
    navigate('sources');
    return;
  }
  if (isFav) {
    const favKeys = new Set(state.library.favorites.map((x) => x && x.key));
    const favItems = live.filter((x) => favKeys.has(x.key));
    if (!favItems.length) {
      toast(t('nav_favorites') + ': 0', 'err');
      // Fall back to live playback but keep favorites marked as the entry point
      const item = lastLiveChannel(live, 'live') || live[0];
      if (player && player.open && player.item && isLiveKind(player.item)) {
        player.setPlaylist(live);
      } else {
        playItem(item, live);
      }
      updateChrome();
      return;
    }
    // Player plays the favorites playlist: drawer shows only the user's favorites
    // (user request). All Channels drawer still lists favorites for the My List context.
    playItem(lastLiveChannel(favItems, 'favorites') || favItems[0], favItems, { favoritesMode: true });
    updateChrome();
    return;
  }
  if (player && player.open && player.item && isLiveKind(player.item)) {
    // Already watching a channel: keep it playing but give the drawer the full
    // live playlist (a channel opened from Home only carried itself).
    player.setPlaylist(live);
    updateChrome();
    return;
  }
  const item = lastLiveChannel(live, 'live') || live[0];
  playItem(item, live);
  updateChrome();
}

function ensurePlayer() {
  if (player) return player;
  player = new window.GomizPlayer({
    settings: state.settings,
    toast,
    patchSettings: async (patch) => {
      state.settings = await window.api.settings.patch(patch);
      if (player) player.opts.settings = state.settings;
      return state.settings;
    },
    onOpen: (item) => {
      recordHistory(item);
      updateChrome();
    },
    onProgress: (item, position, duration) => {
      try { window.api.library.progress(item.key, position, duration, activeProfile()); } catch (_) {}
      const target = state.library.history.find((x) => x.key === item.key);
      if (target) {
        target.position = position;
        target.duration = duration;
      }
    },
    onRecordingChanged: () => { refreshRecordingStatus(); refreshRecordings(); },
    onFavorite: (item) => { toggleFavorite(item); if (player) player.updateFavBtn(); },
    isFavorite: (item) => isFavorite(item && item.key),
    onEpg: () => { openGuide(); },
    onClose: (item) => {
      // Live TV / Favorites receiver has no separate page: if the stream was
      // live, return to that list instead of leaving the user on Home.
      const wasLive = !!(item && isLiveKind(item));
      if (wasLive && (state.route === 'home' || state.route === 'favorites')) {
        // Set the route directly: navigate('live') would re-open the receiver.
        state.route = state.liveEntry === 'favorites' ? 'favorites' : 'live';
        render();
        updateChrome();
      } else {
        updateChrome();
        if (state.route === 'home' || state.route === 'favorites') render();
      }
    }
  });
  player.applySettings(state.settings);
  return player;
}

function isRecordingTargetItem(item) {
  const t = state.recordingTarget;
  if (!t || !item) return false;
  if (t.key && item.key) return t.key === item.key;
  return t.url && item.url && t.url === item.url;
}

function showDetail(item, playlist) {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, item.name));

  const meta = el('div', 'detail-meta');
  meta.appendChild(el('span', 'pill accent', item.kind === 'live' ? t('live') : kindLabel(item.kind)));
  if (item.group) meta.appendChild(el('span', 'pill', item.group));
  if (item.sourceName) meta.appendChild(el('span', 'pill', item.sourceName));
  if (item.tvgName) meta.appendChild(el('span', 'pill', item.tvgName));
  wrap.appendChild(meta);

  const poster = el('div', 'detail-poster');
  if (item.logo) {
    const img = el('img');
    img.src = item.logo;
    img.addEventListener('error', () => { img.remove(); poster.appendChild(el('div', 'ph', initials(item.name))); });
    poster.appendChild(img);
  } else {
    const ph = el('div', 'ph');
    ph.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;font-size:34px;font-weight:800;color:rgba(255,255,255,.3)';
    ph.textContent = initials(item.name);
    poster.appendChild(ph);
  }

  const info = el('div');

  const facts = el('div', 'detail-facts');
  const rows = [
    [t('status'), item.kind === 'live' ? t('live') : kindLabel(item.kind)],
    [t('group'), item.group || ''],
    [t('nav_sources'), item.sourceName || ''],
    [t('channel'), item.kind === 'live' ? (item.tvgName || item.tvgId || '') : '']
  ].filter(([, value]) => value);
  rows.forEach(([label, value]) => {
    const row = el('div');
    row.appendChild(el('span', null, label));
    row.appendChild(el('b', null, value));
    facts.appendChild(row);
  });
  info.appendChild(facts);

  const actions = el('div', 'detail-actions');
  actions.appendChild(makeButton(t('play'), {
    cls: 'btn btn-primary', icon: 'play',
    onClick: () => { closeModal(); playItem(item, playlist); }
  }));
  const resume = resumeFor(item);
  if (resume > 5) {
    actions.appendChild(makeButton(t('resume') + ' · ' + Math.floor(resume / 60) + t('minutes_short'), {
      cls: 'btn btn-ghost', icon: 'clock',
      onClick: () => { closeModal(); playItem(item, playlist); }
    }));
  }

  const favBtn = makeButton(isFavorite(item.key) ? t('unfavorite') : t('favorite'), {
    cls: 'btn btn-ghost', icon: 'heart'
  });
  favBtn.addEventListener('click', async () => {
    await toggleFavorite(item);
    const on = isFavorite(item.key);
    favBtn.innerHTML = '';
    favBtn.appendChild(iconSpan('heart'));
    favBtn.appendChild(el('span', null, on ? t('unfavorite') : t('favorite')));
    favBtn.classList.toggle('btn-danger', on);
  });
  actions.appendChild(favBtn);

  if (item.kind !== 'live') {
    actions.appendChild(makeButton(t('download'), {
      cls: 'btn btn-ghost', icon: 'download',
      onClick: async () => {
        try {
          const res = await window.api.downloads.add({
            title: item.name, url: item.url, headers: item.headers, logo: item.logo, group: item.group
          });
          if (res && res.error === 'stream') toast(t('download_stream_error'), 'err');
          else if (res && res.record) {
            toast(t('download_queued'), 'ok');
            try { state.downloads = await window.api.downloads.list(); } catch (_) {}
          } else if (res && res.error) {
            toast(t('download_failed') + ': ' + String(res.error).slice(0, 140), 'err');
          } else toast(t('download_failed'), 'err');
        } catch (e) {
          toast(t('download_failed') + ': ' + String(e && e.message || e).slice(0, 140), 'err');
        }
      }
    }));
  }

  if (/^https?:/i.test(item.url)) {
    actions.appendChild(makeButton(t('open_in_browser'), {
      cls: 'btn btn-ghost', icon: 'external',
      onClick: () => window.api.shell.openExternal(item.url)
    }));
  }
  info.appendChild(actions);

  const grid = el('div', 'detail');
  grid.appendChild(poster);
  grid.appendChild(info);
  wrap.appendChild(grid);

  /* ---- Recommended movies (below the details) ---- */
  const recs = recommendMovies(item, 6);
  const recBox = el('div');
  if (recs.length) {
    // skeleton placeholders for the recommendation row, swapped synchronously for the real cards
    recBox.appendChild(skeletonCards(8));
    while (recBox.firstChild) recBox.removeChild(recBox.firstChild);
    const recHead = el('div', 'section-head');
    recHead.appendChild(el('h2', 'section-title', t('recommended')));
    recBox.appendChild(recHead);
    const recRow = cardsRow(recs, recs);
    const rowEl = recRow.querySelector('.row');
    if (rowEl) {
      rowEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        rowEl.scrollBy({ left: dir * 520, behavior: 'smooth' });
      }, { passive: false });
    }
    recBox.appendChild(recRow);
  } else {
    recBox.appendChild(emptyBlock(t('no_results'), t('empty_hint')));
  }
  wrap.appendChild(recBox);

  openModal(wrap, { wide: true });
}

function formatAccountExpiry(info) {
  if (!info || !info.available) return info && info.error ? 'Unavailable' : '—';
  if (!info.expDate) return 'Unlimited';
  const d = new Date(Number(info.expDate) * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

