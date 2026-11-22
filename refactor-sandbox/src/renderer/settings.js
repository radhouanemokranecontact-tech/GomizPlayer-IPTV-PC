/* settings.js — split from app.js (classic script, shared global scope). */

function renderSettings() {
  view.appendChild(pageHead(t('settings'), t('tagline')));

  const layout = el('div', 'settings-layout');
  const menu = el('div', 'settings-menu');
  const tabs = [
    ['general', t('general')],
    ['home', t('home_tab')],
    ['player', t('player')],
    ['subtitles', t('subtitles')],
    ['epg', t('guide')],
    ['storage', t('storage')],
    ['system', t('system')],
    ['about', t('about')]
  ];
  tabs.forEach(([id, label]) => {
    const b = el('button', state.settingsTab === id ? 'on' : '', label);
    b.addEventListener('click', () => { state.settingsTab = id; render(); });
    menu.appendChild(b);
  });

  const panel = el('div', 'settings-panel');
  if (state.settingsTab === 'general') settingsGeneral(panel);
  else if (state.settingsTab === 'home') settingsHome(panel);
  else if (state.settingsTab === 'player') settingsPlayer(panel);
  else if (state.settingsTab === 'subtitles') settingsSubtitles(panel);
  else if (state.settingsTab === 'epg') { void settingsEpg(panel); }
  else if (state.settingsTab === 'storage') settingsStorage(panel);
  else if (state.settingsTab === 'system') settingsSystem(panel);
  else settingsAbout(panel);

  layout.appendChild(menu);
  layout.appendChild(panel);
  view.appendChild(layout);
}

function settingsGeneral(panel) {
  panel.appendChild(el('h3', null, t('general')));
  panel.appendChild(el('p', 'hint', t('language')));

  panel.appendChild(segRow(t('language'), [['en', t('english')], ['ar', t('arabic')]], state.settings.language || 'en', async (value) => {
    await setLanguage(value);
    render();
  }));

  panel.appendChild(segRow(t('theme'), [['dark', t('theme_dark')], ['light', t('theme_light')]], state.settings.theme || 'dark', async (value) => {
    await patchSettings({ theme: value });
    document.documentElement.dataset.theme = value;
    render();
  }));

  panel.appendChild(el('h3', null, t('accent')));
  panel.appendChild(el('p', 'hint', t('accent_hint')));
  const swRow = el('div', 'switch-row');
  const swMain = el('div', 'list-main');
  swMain.appendChild(el('div', 'list-title', t('accent_color')));
  swRow.appendChild(swMain);
  const sw = el('div', 'swatches');
  ACCENT_PRESETS.forEach((preset) => {
    const b = el('button', 'swatch' + (String(preset.c).toLowerCase() === String(state.settings.accent || '').toLowerCase() ? ' on' : ''));
    b.style.background = preset.c;
    b.title = preset.n;
    b.addEventListener('click', () => pickAccent(preset.c));
    sw.appendChild(b);
  });
  const customInput = el('input');
  customInput.type = 'color';
  customInput.className = 'swatch-input';
  customInput.value = state.settings.accent || '#ff3d5a';
  customInput.title = t('accent_custom');
  customInput.addEventListener('input', () => pickAccent(customInput.value));
  sw.appendChild(customInput);
  swRow.appendChild(sw);
  panel.appendChild(swRow);

  panel.appendChild(el('h3', null, t('location')));
  panel.appendChild(el('p', 'hint', t('location_hint')));
  const locStatus = state.weatherStatus === 'unavailable' || state.weatherStatus === 'custom:notfound'
    ? t('location_unavailable')
    : (state.location ? ((state.location.city || '') + (state.location.country ? ', ' + state.location.country : '')) : t('loading'));
  const statusRow = el('div', 'switch-row');
  const statusMain = el('div', 'list-main');
  statusMain.appendChild(el('div', 'list-title', t('location_status')));
  statusMain.appendChild(el('div', 'list-sub', locStatus + (state.weather ? ' · ' + formatTemp(state.weather.tempC) : '') + (state.prayer ? ' · ' + t('prayer_ok') : '')));
  statusRow.appendChild(statusMain);
  statusRow.appendChild(makeButton(t('refresh'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => { await loadLocationWeatherPrayer(); toast(t('updated'), 'ok'); } }));
  panel.appendChild(statusRow);

  const cityField = field(t('city'), inputNode('text', t('auto')));
  cityField.input.value = state.settings.weatherCity || '';
  panel.appendChild(cityField);
  const locBtns = el('div');
  locBtns.style.cssText = 'display:flex;gap:8px;margin-top:10px;margin-bottom:12px';
  locBtns.appendChild(makeButton(t('save'), { cls: 'btn btn-primary btn-sm', onClick: async () => { await pickLocation(cityField.input.value); toast(t('saved'), 'ok'); } }));
  locBtns.appendChild(makeButton(t('use_auto'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { cityField.input.value = ''; await pickLocation(''); toast(t('saved'), 'ok'); } }));
  panel.appendChild(locBtns);

  panel.appendChild(segRow(t('temp_unit'), [['C', '°C'], ['F', '°F']], state.settings.tempUnit || 'C', async (value) => { await patchSettings({ tempUnit: value }); render(); }));
  panel.appendChild(segRow(t('time_format'), [['24', '24h'], ['12', '12h']], state.settings.timeFormat || '24', async (value) => { await patchSettings({ timeFormat: value }); render(); }));

  const methodRow = el('div', 'switch-row');
  const methodMain = el('div', 'list-main');
  methodMain.appendChild(el('div', 'list-title', t('prayer_method')));
  methodRow.appendChild(methodMain);
  const methodSel = makeDarkSelect(
    [[2,'ISNA'],[3,'MWL'],[4,'Umm Al-Qura'],[5,'Egyptian'],[1,'Karachi'],[12,'France'],[13,'Turkey'],[8,'Gulf'],[9,'Kuwait'],[10,'Qatar'],[11,'Singapore']].map(([v,n]) => [String(v), n]),
    String(state.settings.prayerMethod || 2),
    async (v) => { await patchSettings({ prayerMethod: Number(v) }); await loadLocationWeatherPrayer(); },
    { width: '220px' }
  );
  methodRow.appendChild(methodSel);
  panel.appendChild(methodRow);

  panel.appendChild(segRow(t('prayer_school'), [['0', t('school_standard')], ['1', t('school_hanafi')]], String(state.settings.prayerSchool || 0), async (value) => { await patchSettings({ prayerSchool: Number(value) }); await loadLocationWeatherPrayer(); }));

  panel.appendChild(toggleRow(t('top_clock'), '', state.settings.widgetClock !== false, async (on) => {
    await patchSettings({ widgetClock: on }); render();
  }));
  panel.appendChild(toggleRow(t('top_weather'), '', state.settings.widgetWeather !== false, async (on) => {
    await patchSettings({ widgetWeather: on }); render();
  }));
  panel.appendChild(toggleRow(t('top_prayer'), '', state.settings.widgetPrayer !== false, async (on) => {
    await patchSettings({ widgetPrayer: on }); render();
  }));

  panel.appendChild(toggleRow(t('autoplay_next'), '', state.settings.autoNext !== false, async (on) => {
    await patchSettings({ autoNext: on });
  }));

  panel.appendChild(toggleRow(t('hw_decoding'), '', state.settings.hardwareDecoding !== false, async (on) => {
    await patchSettings({ hardwareDecoding: on });
  }));

  panel.appendChild(el('h3', null, t('accessibility')));
  panel.appendChild(rangeField(t('ui_scale'), 80, 140, Number(state.settings.uiScale || 100), 5, async (v) => { await patchSettings({ uiScale: v }); }));
  panel.appendChild(toggleRow(t('reduce_motion'), '', !!state.settings.reduceMotion, async (on) => { await patchSettings({ reduceMotion: on }); }));
  panel.appendChild(toggleRow(t('high_contrast'), '', !!state.settings.highContrast, async (on) => { await patchSettings({ highContrast: on }); }));

  panel.appendChild(el('h3', null, t('privacy_security')));
  panel.appendChild(toggleRow(t('app_lock'), t('app_lock_hint'), !!state.settings.appLockEnabled, async (on) => {
    await patchSettings({ appLockEnabled: on });
    render();
  }));
  if (state.settings.appLockEnabled) {
    const pinField = field(t('app_lock_pin'), inputNode('password', 'PIN'));
    pinField.input.value = '';
    panel.appendChild(pinField);
    const pinSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ appLockPin: pinField.input.value.trim() }); toast(t('saved'), 'ok'); } });
    pinSave.style.marginBottom = '8px';
    panel.appendChild(pinSave);
  }

  const diagnosticsOn = !!state.settings.consentShown && (state.settings.analyticsEnabled !== false || state.settings.crashReportingEnabled !== false);
  panel.appendChild(toggleRow(t('analytics_toggle'), t('analytics_toggle_hint'), !!(state.settings.consentShown && state.settings.analyticsEnabled !== false), async (on) => {
    const patch = { analyticsEnabled: on, telemetryEnabled: on };
    if (!state.settings.consentShown) patch.consentShown = true;
    await patchSettings(patch);
    render();
  }));
  panel.appendChild(toggleRow(t('crash_toggle'), t('crash_toggle_hint'), !!(state.settings.consentShown && state.settings.crashReportingEnabled !== false), async (on) => {
    const patch = { crashReportingEnabled: on };
    if (!state.settings.consentShown) patch.consentShown = true;
    await patchSettings(patch);
    render();
  }));

  const epField = field(t('telemetry_endpoint'), inputNode('text', 'https://...'));
  epField.input.value = state.settings.telemetryEndpoint || '';
  panel.appendChild(epField);
  const epSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => {
    await patchSettings({ telemetryEndpoint: epField.input.value.trim() });
    toast(t('saved'), 'ok');
    render();
  } });
  epSave.style.marginBottom = '8px';
  panel.appendChild(epSave);

  const info = el('div', 'hint');
  const id = state.settings.telemetryInstallId || '—';
  const last = state.settings.telemetryLastPing ? new Date(Number(state.settings.telemetryLastPing)).toLocaleString() : '—';
  info.textContent = t('telemetry_install_id') + ': ' + id + ' • ' + t('telemetry_last_ping') + ': ' + last;
  info.style.marginBottom = '8px';
  panel.appendChild(info);
}

async function saveHome(patch) {
  const next = { ...homeLayout(), ...patch };
  await patchSettings({ home: next });
  return next;
}

function settingsHome(panel) {
  const layout = homeLayout();

  panel.appendChild(el('h3', null, t('home_layout')));
  panel.appendChild(el('p', 'hint', t('home_layout_hint')));

  panel.appendChild(segRow(t('density'), [
    ['compact', t('density_compact')],
    ['comfortable', t('density_comfortable')],
    ['large', t('density_large')]
  ], layout.density, async (value) => {
    await saveHome({ density: value });
    render();
  }));

  const limitRow = el('div', 'switch-row');
  const limitMain = el('div', 'list-main');
  limitMain.appendChild(el('div', 'list-title', t('row_items')));
  limitMain.appendChild(el('div', 'list-sub', t('row_items_hint')));
  limitRow.appendChild(limitMain);
  const limitSel = makeDarkSelect(
    [8, 12, 16, 20, 30].map((n) => [String(n), I18N.number(n)]),
    String(layout.rowLimit),
    async (v) => { await saveHome({ rowLimit: Number(v) }); render(); },
    { width: '110px' }
  );
  limitRow.appendChild(limitSel);
  panel.appendChild(limitRow);

  panel.appendChild(el('h3', null, t('home_sections')));
  const list = el('div', 'layout-list');

  const persist = async (order, hidden) => {
    await saveHome({ order, hidden });
    render();
  };

  layout.order.forEach((id, index) => {
    const meta = HOME_SECTIONS.find((s) => s.id === id) || { label: id };
    const isOff = layout.hidden.includes(id);
    const row = el('div', 'layout-row' + (isOff ? ' off' : ''));
    row.dataset.section = id;
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      document.querySelectorAll('.layout-row').forEach((r) => r.classList.remove('dragging', 'drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      if (!from || from === id) return;
      const order = layout.order.slice();
      const fi = order.indexOf(from);
      const ti = order.indexOf(id);
      if (fi < 0 || ti < 0) return;
      order.splice(fi, 1);
      order.splice(ti, 0, from);
      persist(order, layout.hidden);
    });

    const grip = el('span', 'layout-grip');
    grip.innerHTML = ICONS.grip;
    grip.title = t('drag_reorder');
    row.appendChild(grip);
    row.appendChild(el('span', 'layout-name', t(meta.label)));

    const ctrls = el('div', 'layout-ctrls');
    const up = el('button', 'icon-btn');
    up.appendChild(iconSpan('up'));
    up.title = t('move_up');
    up.setAttribute('aria-label', up.title);
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      const order = layout.order.slice();
      [order[index - 1], order[index]] = [order[index], order[index - 1]];
      persist(order, layout.hidden);
    });

    const down = el('button', 'icon-btn');
    down.appendChild(iconSpan('down'));
    down.title = t('move_down');
    down.setAttribute('aria-label', down.title);
    down.disabled = index === layout.order.length - 1;
    down.addEventListener('click', () => {
      const order = layout.order.slice();
      [order[index + 1], order[index]] = [order[index], order[index + 1]];
      persist(order, layout.hidden);
    });

    ctrls.appendChild(up);
    ctrls.appendChild(down);
    row.appendChild(ctrls);

    const sw = el('button', 'switch' + (isOff ? '' : ' on'));
    sw.title = isOff ? t('home_sections') : t('home_sections');
    sw.addEventListener('click', () => {
      const hidden = layout.hidden.slice();
      const i = hidden.indexOf(id);
      if (i >= 0) hidden.splice(i, 1);
      else hidden.push(id);
      persist(layout.order, hidden);
    });
    row.appendChild(sw);

    list.appendChild(row);
  });

  panel.appendChild(list);

  const foot = el('div');
  foot.style.marginTop = '16px';
  foot.appendChild(makeButton(t('reset_layout'), {
    cls: 'btn btn-ghost',
    icon: 'refresh',
    onClick: async () => {
      await patchSettings({ home: HOME_DEFAULTS });
      toast(t('layout_reset'), 'ok');
      render();
    }
  }));
  panel.appendChild(foot);
}

function settingsPlayer(panel) {
  panel.appendChild(el('h3', null, t('player')));
  panel.appendChild(el('p', 'hint', t('playback')));
  const pHead = el('div'); pHead.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px';
  pHead.appendChild(makeButton(t('reset_section'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
    await patchSettings({ aspect: 'contain', volume: 100, rate: 1, quality: 0, preferredAudioLang: '', preferredSubtitleLang: '', retryCount: 2, networkTimeout: 30, networkUserAgent: '' });
    toast(t('settings_reset_done'), 'ok'); render();
  }}));
  panel.appendChild(pHead);

  panel.appendChild(segRow(t('aspect'), [['contain', t('fit')], ['cover', t('fill')]], state.settings.aspect === 'cover' ? 'cover' : 'contain', async (value) => {
    await patchSettings({ aspect: value });
    if (player) player.applySettings(state.settings);
    render();
  }));

  const vol = el('div');
  vol.style.marginBottom = '14px';
  vol.appendChild(el('label', 'tiny dim', t('volume') + ': ' + (state.settings.volume ?? 100) + '%'));
  const range = el('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = String(state.settings.volume ?? 100);
  range.style.width = '100%';
  range.addEventListener('change', async () => {
    await patchSettings({ volume: Number(range.value) });
    if (player) player.applySettings(state.settings);
  });
  range.addEventListener('input', () => {
    vol.querySelector('label').textContent = t('volume') + ': ' + range.value + '%';
  });
  vol.appendChild(range);
  panel.appendChild(vol);

  const speedRow = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', t('speed')));
  speedRow.appendChild(main);
  const speed = makeDarkSelect(
    [0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => [String(v), v + '\u00D7']),
    String(state.settings.rate || 1),
    async (v) => { await patchSettings({ rate: Number(v) }); if (player) player.applySettings(state.settings); },
    { width: '110px' }
  );
  speedRow.appendChild(speed);
  panel.appendChild(speedRow);

  panel.appendChild(el('h3', null, t('defaults')));
  const qRow = el('div', 'switch-row');
  const qm = el('div', 'list-main');
  qm.appendChild(el('div', 'list-title', t('default_quality')));
  qm.appendChild(el('div', 'list-sub', t('default_quality_hint')));
  qRow.appendChild(qm);
  const qSel = makeDarkSelect(
    [[0, t('auto')],[2160,'2160p'],[1080,'1080p'],[720,'720p'],[480,'480p'],[360,'360p']],
    String(state.settings.quality || 0),
    async (v) => { await patchSettings({ quality: Number(v) }); },
    { width: '140px' }
  );
  qRow.appendChild(qSel);
  panel.appendChild(qRow);

  const audioField = field(t('preferred_audio_lang'), inputNode('text', 'ar, en'));
  audioField.input.value = state.settings.preferredAudioLang || '';
  audioField.input.addEventListener('change', async () => { await patchSettings({ preferredAudioLang: audioField.input.value.trim() }); });
  panel.appendChild(audioField);

  const subField = field(t('preferred_subtitle_lang'), inputNode('text', 'ar, en'));
  subField.input.value = state.settings.preferredSubtitleLang || '';
  subField.input.addEventListener('change', async () => { await patchSettings({ preferredSubtitleLang: subField.input.value.trim() }); });
  panel.appendChild(subField);

  panel.appendChild(el('h3', null, t('network_playback')));
  panel.appendChild(rangeField(t('retry_count'), 0, 5, Number(state.settings.retryCount ?? 2), 1, async (v) => { await patchSettings({ retryCount: v }); }));
  panel.appendChild(rangeField(t('network_timeout'), 10, 120, Number(state.settings.networkTimeout ?? 30), 5, async (v) => { await patchSettings({ networkTimeout: v }); }));
  const uaField = field(t('network_user_agent'), inputNode('text', t('optional')));
  uaField.input.value = state.settings.networkUserAgent || '';
  uaField.input.addEventListener('change', async () => { await patchSettings({ networkUserAgent: uaField.input.value.trim() }); });
  panel.appendChild(uaField);

  panel.appendChild(segRow(t('proxy_mode'), [['system', t('proxy_system')], ['direct', t('proxy_direct')], ['fixed', t('proxy_fixed')]], state.settings.proxyMode || 'system', async (value) => {
    await patchSettings({ proxyMode: value });
    render();
  }));
  if ((state.settings.proxyMode || 'system') === 'fixed') {
    const proxyField = field(t('proxy_url'), inputNode('text', 'http://127.0.0.1:8080'));
    proxyField.input.value = state.settings.proxyUrl || '';
    const saveProxy = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ proxyUrl: proxyField.input.value.trim() }); toast(t('saved'), 'ok'); } });
    proxyField.appendChild(saveProxy);
    saveProxy.style.marginTop = '8px';
    panel.appendChild(proxyField);
  }
}

function settingsSubtitles(panel) {
  panel.appendChild(el('h3', null, t('subtitles_settings')));
  panel.appendChild(el('p', 'hint', t('subtitles')));
  const sHead = el('div'); sHead.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px';
  sHead.appendChild(makeButton(t('reset_section'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
    await patchSettings({ subtitle: { size: 100, color: '#ffffff', bgOpacity: 0.55, bottom: 8, bold: false, delay: 0 } });
    toast(t('settings_reset_done'), 'ok'); render();
  }}));
  panel.appendChild(sHead);

  const sub = { ...(state.settings.subtitle || {}) };
  const preview = el('div');
  preview.style.cssText = 'position:relative;height:150px;border-radius:14px;overflow:hidden;margin-bottom:18px;border:1px solid var(--line);background:linear-gradient(140deg,#101623,#090c12);display:flex;align-items:flex-end;justify-content:center;padding-bottom:' + (sub.bottom || 8) + '%';
  const sample = el('div');
  sample.textContent = I18N.lang === 'ar' ? 'مرحبًا بك في GomizPlayer IPTV' : 'Welcome to GomizPlayer IPTV';
  sample.style.cssText = 'padding:4px 10px;border-radius:5px;font-weight:600;transition:all .2s ease';
  preview.appendChild(sample);
  panel.appendChild(preview);

  const applyPreview = () => {
    sample.style.fontSize = Math.round(20 * (Number(sub.size) || 100) / 100) + 'px';
    sample.style.color = sub.color || '#fff';
    sample.style.background = hexToRgba(sub.bgColor || '#000000', Number(sub.bgOpacity ?? 0.55));
    sample.style.fontWeight = sub.bold ? '800' : '600';
    preview.style.paddingBottom = (Number(sub.bottom) || 8) + '%';
  };
  applyPreview();

  const saveSub = async (patch) => {
    Object.assign(sub, patch);
    state.settings = await window.api.settings.patch({ subtitle: sub });
    if (player) player.applySettings(state.settings);
    applyPreview();
  };

  panel.appendChild(rangeField(t('size'), 60, 200, Number(sub.size) || 100, 1, (v) => saveSub({ size: v })));
  panel.appendChild(rangeField(t('opacity'), 0, 100, Math.round((sub.bgOpacity ?? 0.55) * 100), 1, (v) => saveSub({ bgOpacity: v / 100 })));
  panel.appendChild(rangeField(t('bottom_offset'), 2, 35, Number(sub.bottom) || 8, 1, (v) => saveSub({ bottom: v })));
  panel.appendChild(rangeField(t('delay'), -10, 10, Number(sub.delay) || 0, 0.25, (v) => {
    saveSub({ delay: v });
    if (player) player.renderer.setDelay(v);
  }));

  const colorRow = el('div', 'switch-row');
  colorRow.appendChild(el('div', 'list-title', t('color')));
  const swatches = el('div', 'swatches');
  ['#ffffff', '#ffe66d', '#7df9ff', '#ff6b6b', '#7dff9b', '#d0a6ff'].forEach((c) => {
    const s = el('button', 'swatch' + ((sub.color || '#ffffff').toLowerCase() === c ? ' on' : ''));
    s.style.background = c;
    s.addEventListener('click', () => {
      saveSub({ color: c });
      swatches.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
      s.classList.add('on');
    });
    swatches.appendChild(s);
  });
  colorRow.appendChild(swatches);
  panel.appendChild(colorRow);

  panel.appendChild(toggleRow(t('bold'), '', !!sub.bold, async (on) => {
    await saveSub({ bold: on });
  }));
}

async function settingsEpg(panel) {
  panel.appendChild(el('h3', null, t('guide')));
  panel.appendChild(el('p', 'hint', t('epg_hint')));

  const listWrap = el('div', 'list');
  panel.appendChild(listWrap);

  async function refreshList() {
    let entries = [];
    try { entries = await window.api.epg.list(); } catch (_) { entries = state.settings.epgUrls || []; }
    listWrap.innerHTML = '';
    if (!entries.length) {
      listWrap.appendChild(emptyBlock(t('empty'), t('no_epg'), makeButton(t('add_epg'), { cls: 'btn btn-primary btn-sm', icon: 'plus', onClick: () => openEpgModal() })));
      return;
    }
    for (const entry of entries) {
      const row = el('div', 'list-row');
      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', entry.name || safeDisplayUrl(entry.url)));
      main.appendChild(el('div', 'list-sub', entry.url));
      row.appendChild(main);
      const actions = el('div', 'list-actions');
      actions.appendChild(makeButton(t('refresh'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
        try { const res = await window.api.epg.refresh(entry.id); toast(t('updated') + (res && res.count ? ' · ' + I18N.number(res.count) : ''), 'ok'); } catch (e) { toast(e.message || t('epg_failed'), 'err'); }
      }}));
      actions.appendChild(makeButton(t('delete'), { cls: 'btn btn-danger btn-sm', icon: 'trash', onClick: async () => {
        const ok = await confirmModal(t('delete'), t('delete_source_q'), t('delete'), true);
        if (!ok) return;
        try { await window.api.epg.remove(entry.id); state.settings = await window.api.settings.get(); state.epg = {}; state.epgAt = 0; await refreshList(); toast(t('epg_removed'), 'ok'); } catch (e) { toast(e.message || t('error'), 'err'); }
      }}));
      row.appendChild(actions);
      listWrap.appendChild(row);
    }
  }

  const topActions = el('div');
  topActions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
  topActions.appendChild(makeButton(t('add_epg'), { cls: 'btn btn-primary btn-sm', icon: 'plus', onClick: () => { openEpgModal(); setTimeout(refreshList, 800); } }));
  topActions.appendChild(makeButton(t('refresh'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: refreshList }));
  panel.insertBefore(topActions, listWrap);

  await refreshList();
}

async function settingsStorage(panel) {
  panel.appendChild(el('h3', null, t('profiles')));
  panel.appendChild(el('p', 'hint', t('profiles_hint')));
  const profRow = el('div', 'switch-row');
  const profMain = el('div', 'list-main');
  profMain.appendChild(el('div', 'list-title', t('active_profile')));
  profRow.appendChild(profMain);
  const profSel = makeDarkSelect(
    (state.profiles || ['default']).map((p) => [p, p]),
    activeProfile(),
    async (v) => {
      await patchSettings({ profile: v });
      state.profile = v;
      await refreshLibrary();
      toast(t('profile_switched'), 'ok');
      render();
    },
    { width: '180px' }
  );
  profRow.appendChild(profSel);
  panel.appendChild(profRow);
  const profActions = el('div');
  profActions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px';
  profActions.appendChild(makeButton(t('create_profile'), { cls: 'btn btn-ghost btn-sm', icon: 'plus', onClick: async () => {
    const name = await promptModal(t('create_profile'), t('profile_name_prompt'), '');
    if (!name || !String(name).trim()) return;
    try {
      await window.api.profiles.create(String(name).trim());
      state.profiles = await window.api.profiles.list();
      await patchSettings({ profile: String(name).trim() });
      state.profile = String(name).trim();
      await refreshLibrary();
      toast(t('profile_created'), 'ok');
      render();
    } catch (e) { toast(e.message || t('error'), 'err'); }
  }}));
  profActions.appendChild(makeButton(t('delete_profile'), { cls: 'btn btn-danger btn-sm', icon: 'trash', onClick: async () => {
    const cur = activeProfile();
    if (cur === 'default') { toast(t('profile_default_locked'), 'err'); return; }
    const ok = await confirmModal(t('delete_profile'), t('delete_profile_q'), t('delete'), true);
    if (!ok) return;
    try {
      const r = await window.api.profiles.delete(cur);
      state.profiles = r.profiles || await window.api.profiles.list();
      await patchSettings({ profile: r.profile || 'default' });
      state.profile = r.profile || 'default';
      await refreshLibrary();
      toast(t('profile_deleted'), 'ok');
      render();
    } catch (e) { toast(e.message || t('error'), 'err'); }
  }}));
  panel.appendChild(profActions);

  panel.appendChild(el('h3', null, t('storage')));
  panel.appendChild(el('p', 'hint', t('data_folder')));

  const statsBox = el('div', 'list');
  panel.appendChild(statsBox);
  try {
    const st = await window.api.storage.stats();
    [['t_storage_data', st.fmtData], ['t_storage_cache', st.fmtCache], ['t_storage_downloads', st.fmtDownloads], ['t_storage_recordings', st.fmtRecordings]].forEach(([k, v]) => {
      const row = el('div', 'list-row');
      const m = el('div', 'list-main'); m.appendChild(el('div', 'list-title', t(k)));
      row.appendChild(m); row.appendChild(el('span', 'pill', v)); statsBox.appendChild(row);
    });
  } catch (_) {
    statsBox.appendChild(el('p', 'hint', t('error')));
  }

  const folderRow = el('div', 'list-row');
  const fm = el('div', 'list-main');
  fm.appendChild(el('div', 'list-title', t('data_folder')));
  fm.appendChild(el('div', 'list-sub', state.info ? state.info.dataDir : '—'));
  folderRow.appendChild(fm);
  folderRow.appendChild(makeButton(t('open'), { cls: 'btn btn-ghost btn-sm', icon: 'folder', onClick: () => { if (state.info) window.api.shell.showItem(state.info.dataDir + '\\'); } }));
  panel.appendChild(folderRow);

  panel.appendChild(el('h3', null, t('downloads_folder')));
  const dlField = field(t('downloads_folder'), inputNode('text', t('auto')));
  dlField.input.value = state.settings.downloadsDir || '';
  panel.appendChild(dlField);
  const dlSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ downloadsDir: dlField.input.value.trim() }); toast(t('saved'), 'ok'); } });
  dlSave.style.marginBottom = '12px';
  panel.appendChild(dlSave);

  panel.appendChild(el('h3', null, t('recordings_folder')));
  const recField = field(t('recordings_folder'), inputNode('text', t('auto')));
  recField.input.value = state.settings.recordingsDir || '';
  panel.appendChild(recField);
  const recSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ recordingsDir: recField.input.value.trim() }); toast(t('saved'), 'ok'); } });
  recSave.style.marginBottom = '12px';
  panel.appendChild(recSave);

  panel.appendChild(el('h3', null, t('backup')));
  const bBtns = el('div');
  bBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px';
  bBtns.appendChild(makeButton(t('export_backup'), { cls: 'btn btn-primary btn-sm', icon: 'download', onClick: async () => {
    const r = await window.api.backup.export(); if (r && r.ok) toast(t('backup_exported'), 'ok'); else if (r && r.error) toast(r.error, 'err');
  }}));
  bBtns.appendChild(makeButton(t('import_backup'), { cls: 'btn btn-ghost btn-sm', icon: 'plus', onClick: async () => {
    const ok = await confirmModal(t('import_backup'), t('import_backup_q'), t('import_backup'), true);
    if (!ok) return;
    const r = await window.api.backup.import();
    if (r && r.ok) { state.settings = await window.api.settings.get(); await refreshLibrary(); await loadAllItems(); toast(t('backup_imported'), 'ok'); render(); }
    else if (r && r.error) toast(r.error, 'err');
  }}));
  bBtns.appendChild(makeButton('Back up now', { cls: 'btn btn-ghost btn-sm', icon: 'download', onClick: async () => {
    const r = await window.api.backup.now();
    toast(r && r.ok ? ('Backup created: ' + r.name) : 'Backup failed', r && r.ok ? 'ok' : 'err');
  }}));
  panel.appendChild(bBtns);
 
  panel.appendChild(el('h3', null, t('startup_cleanup')));
  panel.appendChild(el('p', 'hint', t('startup_cleanup_hint')));
  panel.appendChild(toggleRow(
    t('clear_source_cache_on_launch'),
    t('clear_source_cache_on_launch_hint'),
    !!state.settings.clearSourceCacheOnLaunch,
    async (on) => { await patchSettings({ clearSourceCacheOnLaunch: on }); }
  ));
  panel.appendChild(toggleRow(
    t('clear_history_on_launch'),
    t('clear_history_on_launch_hint'),
    !!state.settings.clearWatchHistoryOnLaunch,
    async (on) => { await patchSettings({ clearWatchHistoryOnLaunch: on }); }
  ));
  panel.appendChild(toggleRow(
    t('clear_network_cache_on_launch'),
    t('clear_network_cache_on_launch_hint'),
    !!state.settings.clearNetworkCacheOnLaunch,
    async (on) => { await patchSettings({ clearNetworkCacheOnLaunch: on }); }
  ));

  panel.appendChild(el('h3', null, t('clear')));
  const buttons = el('div');
  buttons.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  buttons.appendChild(makeButton(t('clear_cache'), { cls: 'btn btn-ghost btn-sm', icon: 'trash', onClick: async () => {
    const r = await window.api.storage.clearCache(); toast(t('cleared') + (r && r.count ? ' · ' + I18N.number(r.count) : ''), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_history'), { cls: 'btn btn-ghost btn-sm', icon: 'trash', onClick: async () => {
    if (!await confirmModal(t('clear_history'), t('clear_history_q'), t('clear'), true)) return;
    state.library = await window.api.library.clear('history', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_favorites'), { cls: 'btn btn-ghost btn-sm', icon: 'heart', onClick: async () => {
    if (!await confirmModal(t('clear_favorites'), t('clear_history_q'), t('clear'), true)) return;
    state.library = await window.api.library.clear('favorites', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_search'), { cls: 'btn btn-ghost btn-sm', icon: 'search', onClick: async () => {
    state.library = await window.api.library.clear('search', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_all'), { cls: 'btn btn-danger btn-sm', icon: 'trash', onClick: async () => {
    if (!await confirmModal(t('clear_all'), t('clear_history_q'), t('clear'), true)) return;
    state.library = await window.api.library.clear('all', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  panel.appendChild(buttons);

  panel.appendChild(el('h3', null, t('reset')));
  panel.appendChild(makeButton(t('reset_settings'), { cls: 'btn btn-danger btn-sm', icon: 'refresh', onClick: async () => {
    const ok = await confirmModal(t('reset_settings'), t('reset_settings_q'), t('reset'), true);
    if (!ok) return;
    await window.api.storage.resetSettings();
    state.settings = await window.api.settings.get();
    I18N.set(state.settings.language || 'en');
    document.documentElement.dataset.theme = state.settings.theme || 'dark';
    if (state.settings.accent) applyAccent(state.settings.accent, state.settings.accent2);
    toast(t('settings_reset_done'), 'ok');
    render();
  }}));
}

function openExternalUrl(url) {
  if (window.api && window.api.shell && window.api.shell.openExternal) return window.api.shell.openExternal(url);
  window.open(url, '_blank');
}

function openEmailComposer(email) {
  const addr = encodeURIComponent(email || 'radhouanemokrane.contact@gmail.com');
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('compose_email') || 'إرسال بريد'));
  wrap.appendChild(el('p', 'lead', t('compose_email_hint') || 'اختر الطريقة:'));
  const list = el('div', 'list');
  const options = [
    { label: 'Gmail', sub: 'فتح Gmail لكتابة رسالة مباشرة', icon: 'mail', url: `https://mail.google.com/mail/?view=cm&fs=1&to=${addr}` },
    { label: 'Outlook / Hotmail', sub: 'فتح Outlook لكتابة رسالة مباشرة', icon: 'mail', url: `https://outlook.live.com/mail/0/deeplink/compose?to=${addr}` },
    { label: t('default_mail_app') || 'تطبيق البريد الافتراضي', sub: email || '', icon: 'external', url: `mailto:${email || 'radhouanemokrane.contact@gmail.com'}` }
  ];
  options.forEach((opt) => {
    const row = el('div', 'list-row');
    row.style.cursor = 'pointer';
    const ic = el('span', 'contact-icon');
    ic.setAttribute('data-icon', opt.icon);
    ic.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--panel-2,#1a2233);color:var(--text,#fff);flex:0 0 34px;margin-inline-end:10px';
    row.appendChild(ic);
    const m = el('div', 'list-main');
    m.appendChild(el('div', 'list-title', opt.label));
    m.appendChild(el('div', 'list-sub', opt.sub));
    row.appendChild(m);
    row.addEventListener('click', () => { openExternalUrl(opt.url); closeModal(); });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('cancel') || 'إلغاء', { cls: 'btn btn-ghost', onClick: closeModal }));
  openModalWithActions(wrap, actions);
  if (typeof hydrateIcons === 'function') hydrateIcons(wrap);
}

async function runFactoryResetFlow() {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('factory_reset_warning_title')));
  wrap.appendChild(el('p', 'lead', t('factory_reset_warning_intro')));

  const list = document.createElement('ul');
  list.style.cssText = 'margin:8px 0 12px 20px;line-height:1.5';
  [
    t('factory_reset_item_accounts'),
    t('factory_reset_item_playlists'),
    t('factory_reset_item_library'),
    t('factory_reset_item_downloads'),
    t('factory_reset_item_storage'),
    t('factory_reset_item_settings')
  ].forEach((txt) => {
    const li = document.createElement('li');
    li.textContent = txt;
    list.appendChild(li);
  });
  wrap.appendChild(list);

  const note = el('p', 'hint', t('factory_reset_external_note'));
  note.style.marginBottom = '12px';
  wrap.appendChild(note);

  const step2 = el('p', null, t('factory_reset_step2'));
  step2.style.margin = '8px 0 6px';
  step2.style.fontWeight = '600';
  wrap.appendChild(step2);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.placeholder = t('factory_reset_confirm_label');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.marginBottom = '12px';
  wrap.appendChild(input);

  const actions = el('div', 'modal-actions');
  const cancelBtn = makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: () => closeModal() });
  const finalBtn = makeButton(t('factory_reset_final_btn'), {
    cls: 'btn btn-danger',
    onClick: async () => {
      if (String(input.value || '').trim() !== 'RESET') return;
      finalBtn.disabled = true;
      cancelBtn.disabled = true;
      input.disabled = true;
      try {
        toast(t('factory_reset_in_progress'), 'info');
        // Best-effort stop of active playback/recording tasks in renderer
        try { if (player && typeof player.stopRecording === 'function') await player.stopRecording(); } catch (_) {}
        try { if (player && typeof player.close === 'function') player.close(true); } catch (_) {}
        try { if (player && player.video) { player.video.pause(); player.video.removeAttribute('src'); player.video.load(); } } catch (_) {}
        try { await window.api.recording.stop(); } catch (_) {}
        try {
          if (window.api && window.api.app && typeof window.api.app.factoryReset === 'function') {
            const res = await window.api.app.factoryReset({ confirm: 'RESET' });
            if (res && res.ok === false && res.error && res.error !== 'invalid_confirmation') {
              toast(t('factory_reset_failed'), 'err');
              finalBtn.disabled = false;
              cancelBtn.disabled = false;
              input.disabled = false;
              return;
            }
          } else {
            toast(t('factory_reset_failed'), 'err');
            finalBtn.disabled = false;
            cancelBtn.disabled = false;
            input.disabled = false;
            return;
          }
        } catch (_) {
          toast(t('factory_reset_failed'), 'err');
          finalBtn.disabled = false;
          cancelBtn.disabled = false;
          input.disabled = false;
          return;
        }
      } catch (_) {
        toast(t('factory_reset_failed'), 'err');
        finalBtn.disabled = false;
        cancelBtn.disabled = false;
        input.disabled = false;
      }
    }
  });
  finalBtn.disabled = true;
  finalBtn.style.whiteSpace = 'normal';
  input.addEventListener('input', () => {
    finalBtn.disabled = String(input.value || '').trim() !== 'RESET';
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(finalBtn);
  openModalWithActions(wrap, actions);
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 0);
}

function settingsSystem(panel) {
  panel.appendChild(el('h3', null, t('factory_reset_title')));
  panel.appendChild(el('p', 'hint', t('factory_reset_desc')));

  const box = el('div', 'list');
  box.style.marginTop = '8px';
  const row = el('div', 'list-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', t('factory_reset')));
  main.appendChild(el('div', 'list-sub', t('factory_reset_desc')));
  row.appendChild(main);
  const btn = makeButton(t('factory_reset_btn'), {
    cls: 'btn btn-danger btn-sm',
    onClick: () => { void runFactoryResetFlow(); }
  });
  row.appendChild(btn);
  box.appendChild(row);
  panel.appendChild(box);
}

function settingsAbout(panel) {
  panel.appendChild(el('h3', null, t('about')));

  const intro = el('div');
  intro.style.cssText = 'margin:8px 0 14px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--panel)';
  intro.appendChild(el('div', 'list-title', 'GomizPlayer IPTV'));
  intro.appendChild(el('p', 'hint', t('about_desc') || 'GomizPlayer IPTV هو مشغّل وسائط سطح مكتب (IPTV/VOD) لإدارة وتشغيل مصادرك الخاصة، مع دعم دليل البرامج، الترجمة، والتنزيلات، وواجهة عربية/إنجليزية.'));
  intro.appendChild(el('p', 'hint', (t('developer') || 'المبرمج') + ': Radhouane Mokrane'));
  panel.appendChild(intro);

  /* Update safety / rollback status (local only) */
  if (window.api.updates && window.api.updates.guard) {
    const guardBox = el('div');
    guardBox.style.cssText = 'margin:0 0 14px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--panel)';
    const guardTitle = el('div', 'list-title', 'Update safety / أمان التحديث');
    guardBox.appendChild(guardTitle);
    const guardLine = el('p', 'hint', 'Loading...');
    guardBox.appendChild(guardLine);
    const guardBtns = el('div');
    guardBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
    guardBtns.appendChild(makeButton('Snapshot now', { cls: 'btn btn-ghost btn-sm', onClick: async () => {
      const r = await window.api.updates.snapshot();
      toast(r && r.ok ? 'Data snapshot saved before update' : 'Snapshot failed', r && r.ok ? 'ok' : 'err');
    }}));
    guardBox.appendChild(guardBtns);
    panel.appendChild(guardBox);
    const diagBtn = makeButton('View recent errors', { cls: 'btn btn-ghost btn-sm', onClick: async () => {
      const r = await window.api.diagnostics.tail(15);
      const lines = r && r.lines ? r.lines : [];
      const box = el('div');
      box.style.cssText = 'max-height:360px;overflow:auto;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px;font:11px monospace;white-space:pre-wrap;word-break:break-all';
      box.textContent = lines.length ? lines.join('\n') : 'No local errors recorded.';
      const wrap = el('div');
      wrap.appendChild(el('h2', null, 'Local diagnostics / التشخيص المحلي'));
      wrap.appendChild(el('p', 'lead', ' محفوظة على جهازك فقط — لا تُرسل لأي خادم. / Stored on this device only — never sent to a server.'));
      wrap.appendChild(box);
      openModal(wrap);
    }});
    guardBtns.appendChild(diagBtn);
    window.api.updates.guard().then((r) => {
      const st = r && r.state;
      if (!st) { guardLine.textContent = 'Unavailable'; return; }
      const snaps = (st.snapshots || []).length;
      guardLine.textContent = 'Version: ' + (st.lastVersion || '-') +
        '  ·  Last good: ' + (st.lastGoodVersion || '-') +
        '  ·  Crashes: ' + (Number(st.crashes) || 0) +
        '  ·  Snapshots: ' + snaps;
      if (Number(st.crashes) >= 2 && st.previousVersion) {
        guardBtns.appendChild(makeButton('Dismiss rollback warning', { cls: 'btn btn-ghost btn-sm', onClick: async () => {
          await window.api.updates.dismissRollback();
          guardLine.textContent += ' (dismissed)';
        }}));
      }
    }).catch(() => { guardLine.textContent = 'Unavailable'; });
  }

  const contacts = el('div', 'list');
  contacts.style.marginBottom = '14px';
  const contactRows = [
    [t('contact_facebook') || 'Facebook', 'https://www.facebook.com/profile.php?id=61595630273747', null, 'facebook'],
    [t('contact_email') || 'Email', 'mailto:radhouanemokrane.contact@gmail.com', 'radhouanemokrane.contact@gmail.com', 'mail'],
    [t('contact_github') || 'GitHub', 'https://github.com/radhouanemokranecontact-tech/GomizPlayer-IPTV', null, 'github']
  ];
  contactRows.forEach(([label, url, text, icon]) => {
    const row = el('div', 'list-row');
    if (icon) {
      const ic = el('span', 'contact-icon');
      ic.setAttribute('data-icon', icon);
      ic.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--panel-2,#1a2233);color:var(--text,#fff);flex:0 0 34px;margin-inline-end:10px';
      row.appendChild(ic);
    }
    const m = el('div', 'list-main');
    m.appendChild(el('div', 'list-title', label));
    m.appendChild(el('div', 'list-sub', text || url));
    row.appendChild(m);
    const btn = makeButton('', { cls: 'btn btn-ghost btn-sm', icon: icon || 'external', onClick: () => {
      if (icon === 'mail') { openEmailComposer('radhouanemokrane.contact@gmail.com'); return; }
      if (window.api && window.api.shell && window.api.shell.openExternal) window.api.shell.openExternal(url);
      else window.open(url, '_blank');
    }, title: t('open') || 'فتح' });
    row.appendChild(btn);
    contacts.appendChild(row);
  });
  if (typeof hydrateIcons === 'function') hydrateIcons(contacts);
  panel.appendChild(el('h3', null, t('contact') || 'وسائل التواصل'));
  panel.appendChild(contacts);

  panel.appendChild(el('p', 'hint', t('version') + ' ' + (state.info ? state.info.version : '1.0.0')));

  const list = el('div', 'list');
  const rows = [
    ['GomizPlayer IPTV', state.info ? state.info.version : ''],
    ['Electron', state.info ? state.info.electron : ''],
    ['Chromium', state.info ? state.info.chrome : ''],
    [t('nav_sources'), String(state.sources.length)],
    [t('items'), I18N.number(state.items.length)],
    [t('nav_favorites'), I18N.number(state.library.favorites.length)]
  ];
  rows.forEach(([k, v]) => {
    const row = el('div', 'list-row');
    const m = el('div', 'list-main');
    m.appendChild(el('div', 'list-title', k));
    row.appendChild(m);
    row.appendChild(el('span', 'pill', v));
    list.appendChild(row);
  });
  panel.appendChild(list);

  const legal = el('div');
  legal.style.cssText = 'margin-top:16px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--panel)';
  legal.appendChild(el('div', 'list-title', t('legal')));
  legal.appendChild(el('p', 'hint', t('legal_text')));
  panel.appendChild(legal);

  panel.appendChild(el('h3', null, t('shortcuts')));
  panel.appendChild(el('p', 'hint', t('shortcuts_hint')));
  const sc = el('div', 'list');
  [['Space', t('sc_play_pause')], ['F', t('sc_fullscreen')], ['M', t('sc_mute')], ['← / →', t('sc_seek')], ['↑ / ↓', t('sc_volume')], ['Esc', t('sc_back')]].forEach(([k,v]) => {
    const row = el('div', 'list-row');
    const m = el('div', 'list-main'); m.appendChild(el('div', 'list-title', v)); row.appendChild(m);
    row.appendChild(el('span', 'pill', k)); sc.appendChild(row);
  });
  panel.appendChild(sc);

  panel.appendChild(el('h3', null, t('diagnostics_updates')));
  const dBtns = el('div');
  dBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px';
  dBtns.appendChild(makeButton(t('export_diagnostics'), { cls: 'btn btn-ghost btn-sm', icon: 'download', onClick: async () => {
    const r = await window.api.diagnostics.export(); if (r && r.ok) toast(t('diagnostics_exported'), 'ok');
  }}));
  const checkBtn = makeButton(t('check_updates'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
    try {
      await window.api.updates.check();
    } catch (e) {
      toast(e && e.message ? e.message : t('error'), 'err');
    }
  }});
  dBtns.appendChild(checkBtn);
  const downloadBtn = makeButton(t('download') || 'Download', { cls: 'btn btn-primary btn-sm', icon: 'download', onClick: async () => {
    try {
      const r = await window.api.updates.download();
      if (r && r.ok === false) toast(r.error || t('error'), 'err');
    } catch (e) {
      toast(e && e.message ? e.message : t('error'), 'err');
    }
  }});
  downloadBtn.style.display = 'none';
  dBtns.appendChild(downloadBtn);
  const installBtn = makeButton(t('install_update') || 'Install update', { cls: 'btn btn-primary btn-sm', icon: 'download', onClick: async () => {
    await window.api.updates.install();
  }});
  installBtn.style.display = 'none';
  dBtns.appendChild(installBtn);
  panel.appendChild(dBtns);

  const upStatus = el('div', 'hint', '');
  upStatus.style.marginBottom = '12px';
  panel.appendChild(upStatus);

  const renderUpdate = (s) => {
    const st = s || {};
    const ver = st.version ? (' v' + st.version) : '';
    const map = {
      checking: t('checking_updates') || 'Checking for updates...',
      available: (t('update_available') || 'Update available') + ver,
      downloading: (t('update_downloading') || 'Downloading update') + ver + (st.progress ? (' — ' + st.progress + '%') : ''),
      downloaded: (t('update_ready') || 'Update ready to install') + ver,
      none: (state.info ? state.info.version : '') + ' — ' + t('up_to_date'),
      error: '',
      idle: ''
    };
    upStatus.textContent = map[st.status] || '';
    installBtn.style.display = st.status === 'downloaded' ? '' : 'none';
    downloadBtn.style.display = st.status === 'available' ? '' : 'none';
  };
  if (window.api.updates && window.api.updates.status) {
    window.api.updates.status().then(renderUpdate).catch(() => {});
  }
  if (!window.__novaUpdateBound && window.api.updates && window.api.updates.onStatus) {
    window.__novaUpdateBound = true;
    window.api.updates.onStatus((s) => {
      renderUpdate(s);
      if (!s) return;
      if (s.status === 'available') toast((t('update_available') || 'Update available') + (s.version ? (' v' + s.version) : ''), 'ok');
      else if (s.status === 'downloaded') toast((t('update_ready') || 'Update ready to install') + (s.version ? (' v' + s.version) : ''), 'ok');
      // update errors are silent in the UI (details kept in logs only)
      else if (s.status === 'none') toast(t('up_to_date'), 'ok');
    });
  } else if (window.api.updates && window.api.updates.status) {
    window.api.updates.status().then(renderUpdate).catch(() => {});
  }

  const demoBtn = makeButton(t('load_demo'), {
    cls: 'btn btn-ghost btn-sm', icon: 'play', onClick: () => loadDemo()
  });
  demoBtn.style.marginTop = '14px';
  panel.appendChild(demoBtn);
}

function makeDarkSelect(options, value, onChange, opts = {}) {
  const wrap = el('div', 'dark-select');
  if (opts.width) wrap.style.width = opts.width;
  if (opts.minWidth) wrap.style.minWidth = opts.minWidth;
  const btn = el('button', 'dark-select-btn', '');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const labelEl = el('span', 'dark-select-label', '');
  const chev = el('span', 'dark-select-chev', '\u25BE');
  btn.appendChild(labelEl);
  btn.appendChild(chev);
  wrap.appendChild(btn);
  const menu = el('div', 'dark-select-menu');
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  wrap.appendChild(menu);
  let current = String(value == null ? '' : value);
  const optionEls = options.map(([v, n]) => {
    const o = el('button', 'dark-select-option' + (String(v) === current ? ' on' : ''), String(n));
    o.type = 'button';
    o.setAttribute('role', 'option');
    o.addEventListener('click', (e) => {
      e.stopPropagation();
      setValue(v);
      close();
      try { onChange && onChange(v); } catch (_) {}
    });
    menu.appendChild(o);
    return o;
  });
  function setValue(v) {
    current = String(v);
    const match = options.find(([ov]) => String(ov) === current);
    labelEl.textContent = match ? String(match[1]) : String(value == null ? '' : value);
    optionEls.forEach((o, i) => o.classList.toggle('on', String(options[i][0]) === current));
  }
  function open() {
    if (wrap._closeMenu) wrap._closeMenu();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    wrap._closeMenu = close;
    darkOpenSelects.add(wrap);
  }
  function close() {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
    darkOpenSelects.delete(wrap);
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) open(); else close(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); btn.blur(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex(([v]) => String(v) === current);
      const next = e.key === 'ArrowDown'
        ? (i + 1) % options.length
        : (i - 1 + options.length) % options.length;
      setValue(options[next][0]);
      try { onChange && onChange(options[next][0]); } catch (_) {}
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (menu.hidden) open(); else close(); }
  });
  Object.defineProperty(wrap, 'value', { get: () => current, set: (v) => setValue(v) });
  setValue(value);
  return wrap;
}

function segRow(label, options, value, onChange) {
  const row = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', label));
  row.appendChild(main);
  const seg = el('div', 'seg');
  options.forEach(([v, text]) => {
    const b = el('button', v === value ? 'on' : '', text);
    b.addEventListener('click', () => onChange(v));
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}

function toggleRow(label, hint, value, onChange) {
  const row = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', label));
  if (hint) main.appendChild(el('div', 'list-sub', hint));
  row.appendChild(main);
  const sw = el('button', 'switch' + (value ? ' on' : ''));
  sw.addEventListener('click', () => {
    const on = !sw.classList.contains('on');
    sw.classList.toggle('on', on);
    onChange(on);
  });
  row.appendChild(sw);
  return row;
}

function rangeField(label, min, max, value, step, onInput) {
  const row = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', label));
  row.appendChild(main);
  const range = el('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.style.width = '200px';
  const out = el('span', 'tiny dim', String(value));
  out.style.minWidth = '38px';
  out.style.textAlign = 'center';
  range.addEventListener('input', () => {
    out.textContent = range.value;
    onInput(Number(range.value));
  });
  range.addEventListener('change', () => onInput(Number(range.value)));
  row.appendChild(range);
  row.appendChild(out);
  return row;
}

