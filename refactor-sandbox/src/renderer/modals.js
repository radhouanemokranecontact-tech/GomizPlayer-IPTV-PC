/* modals.js — split from app.js (classic script, shared global scope). */

function openModalWithActions(wrap, actions) {
  wrap.appendChild(actions);
  openModal(wrap);
}

function promptModal(title, label, def, secret = false) {
  return new Promise((resolve) => {
    const wrap = el('div');
    wrap.appendChild(el('h2', null, title));
    wrap.appendChild(el('p', 'lead', label));
    const input = el('input');
    input.type = secret ? 'password' : 'text';
    input.className = 'input';
    input.autocomplete = 'off';
    if (def) input.value = def;
    wrap.appendChild(input);
    const actions = el('div', 'modal-actions');
    const cancel = makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: () => { closeModal(); resolve(null); } });
    const save = makeButton(t('save'), { cls: 'btn btn-primary', onClick: () => { const v = input.value.trim(); closeModal(); resolve(v || null); } });
    actions.appendChild(cancel);
    actions.appendChild(save);
    openModalWithActions(wrap, actions);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 0);
  });
}

function openModal(content, opts = {}) {
  modalBody.innerHTML = '';
  modalBody.appendChild(content);
  modalRoot.hidden = false;
  const modal = modalRoot.querySelector('.modal');
  modal.classList.toggle('wide', !!opts.wide);
  hydrateIcons(modalBody);
  const focusable = modalBody.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

function closeModal() {
  modalRoot.hidden = true;
  modalBody.innerHTML = '';
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(false);
  }
}

function confirmModal(title, text, okLabel, danger) {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, title));
  wrap.appendChild(el('p', 'lead', text));

  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: () => finishConfirm(false) }));
  actions.appendChild(makeButton(okLabel || t('delete'), {
    cls: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
    onClick: () => finishConfirm(true)
  }));
  openModalWithActions(wrap, actions);

  return new Promise((resolve) => { confirmResolve = resolve; });
}

function finishConfirm(value) {
  if (confirmResolve) {
    confirmResolve(value);
    confirmResolve = null;
  }
  closeModal();
}

function confirmYesNo(title, text, danger) {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, title));
  wrap.appendChild(el('p', 'lead', text));

  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('no'), { cls: 'btn btn-ghost', onClick: () => finishConfirm(false) }));
  actions.appendChild(makeButton(t('yes'), {
    cls: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
    onClick: () => finishConfirm(true)
  }));
  openModalWithActions(wrap, actions);

  return new Promise((resolve) => { confirmResolve = resolve; });
}

function showLockScreen() {
  return new Promise((resolve) => {
    const overlay = el('div');
    overlay.id = 'lockScreen';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);backdrop-filter:blur(8px)';
    const box = el('div');
    box.style.cssText = 'width:min(420px,92vw);padding:22px;border-radius:16px;background:var(--panel);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px';
    box.appendChild(el('h3', null, t('app_lock')));
    box.appendChild(el('p', 'hint', t('enter_pin_hint')));
    const inp = el('input', 'input');
    inp.type = 'password';
    inp.placeholder = 'PIN';
    box.appendChild(inp);
    const err = el('div', 'tiny dim');
    err.style.color = 'var(--danger)';
    box.appendChild(err);
    const btn = makeButton(t('unlock'), { cls: 'btn btn-primary', onClick: async () => {
      btn.disabled = true;
      try {
        const res = await window.api.appLock.verify(String(inp.value || ''));
        if (res && res.ok) { overlay.remove(); resolve(true); return; }
        err.textContent = t('wrong_pin');
        inp.value = '';
        inp.focus();
      } catch (_) {
        err.textContent = t('wrong_pin');
      } finally {
        btn.disabled = false;
      }
    }});
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => inp.focus(), 50);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  });
}

function showConsentDialog() {
  return new Promise((resolve) => {
    const wrap = el('div');
    wrap.appendChild(el('h3', null, t('consent_title')));
    wrap.appendChild(el('p', 'hint', t('consent_body')));
    const note = el('p', 'hint', t('consent_note'));
    note.style.marginTop = '8px';
    wrap.appendChild(note);
    const actions = el('div', 'modal-actions');
    actions.appendChild(makeButton(t('consent_deny'), { cls: 'btn btn-ghost', onClick: async () => {
      await patchSettings({ consentShown: true, analyticsEnabled: false, crashReportingEnabled: false, telemetryEnabled: false });
      closeModal();
      resolve(false);
    }}));
    actions.appendChild(makeButton(t('consent_allow'), { cls: 'btn btn-primary', onClick: async () => {
      await patchSettings({ consentShown: true, analyticsEnabled: true, crashReportingEnabled: true, telemetryEnabled: true });
      closeModal();
      resolve(true);
    }}));
    openModalWithActions(wrap, actions);
  });
}

async function loadDemo() {
  try {
    const demoPath = await window.api.demoPath();
    const res = await window.api.sources.add({
      name: t('demo'),
      url: demoPath,
      kind: 'm3u',
      headers: {}
    });
    if (res.error) {
      toast(t('demo_failed') + ': ' + res.error, 'err');
      return;
    }
    await patchSettings({ onboarded: true });
    await loadAllItems();
    await refreshLibrary();
    toast(t('demo_loaded'), 'ok');
    navigate('home', { replace: true });
    render();
  } catch (err) {
    toast(t('demo_failed') + ': ' + err.message, 'err');
  }
}

async function patchSettings(patch) {
  state.settings = await window.api.settings.patch(patch);
  if (player) player.opts.settings = state.settings;
  if (state.settings && state.settings.accent) applyAccent(state.settings.accent, state.settings.accent2);
  applyAccessibility();
  applyWidgetToggles();
  return state.settings;
}

async function setLanguage(lang) {
  I18N.set(lang);
  await patchSettings({ language: lang });
  applyStaticText();
  updateChrome();
}

function bindGlobal() {
  document.querySelectorAll('.nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-route');
      if (route === 'live') openLiveReceiver();
      else if (route === 'favorites') openLiveReceiver('favorites');
      else navigate(route);
    });
  });
  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('quickAddBtn').addEventListener('click', () => openSourceModal());
  document.getElementById('guideBtn').addEventListener('click', openGuide);
  document.getElementById('langBtn').addEventListener('click', async () => {
    const order = ['en', 'ar'];
    const cur = order.includes(state.settings.language) ? state.settings.language : 'en';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    await setLanguage(next);
    render();
  });
  document.getElementById('profileBtn').addEventListener('click', () => navigate('settings', { tab: 'storage' }));

  const contactEmail = 'radhouanemokrane.contact@gmail.com';
  const socialLinks = {
    facebook: 'https://www.facebook.com/profile.php?id=61595630273747',
    mail: 'mailto:' + contactEmail,
    github: 'https://github.com/radhouanemokranecontact-tech/GomizPlayer-IPTV'
  };
  window.__novaOpenEmailComposer = () => openEmailComposer(contactEmail);
  const sidebarSocial = document.getElementById('sidebarSocial');
  if (sidebarSocial) {
    sidebarSocial.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-social]') : null;
      if (!btn) return;
      if (btn.dataset.social === 'mail') {
        openEmailComposer(contactEmail);
        return;
      }
      const url = socialLinks[btn.dataset.social];
      if (!url) return;
      if (window.api && window.api.shell && window.api.shell.openExternal) window.api.shell.openExternal(url);
      else window.open(url, '_blank');
    });
    if (typeof hydrateIcons === 'function') hydrateIcons(sidebarSocial);
  }


  const search = document.getElementById('searchInput');
  search.addEventListener('input', () => {
    state.searchTerm = search.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      if (state.searchTerm.trim()) navigate('search', { replace: state.route === 'search' });
      else if (state.route === 'search') render();
    }, 180);
  });
  search.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && state.searchTerm.trim()) {
      try {
        state.library.search = await window.api.library.search(state.searchTerm.trim(), activeProfile());
      } catch (_) {}
      if (state.route !== 'search') navigate('search');
      else render();
    }
    if (e.key === 'Escape') {
      search.value = '';
      state.searchTerm = '';
      if (state.route === 'search') goBack();
    }
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      search.focus();
      search.select();
    }
    if (e.key === 'Escape') {
      if (!modalRoot.hidden) closeModal();
      else if (state.stack.length) goBack();
    }
  });

  modalRoot.addEventListener('click', (e) => {
    // Use closest() so clicking the SVG icon inside the X button also closes.
    if (e.target && e.target.closest && e.target.closest('[data-close]')) closeModal();
  });

  // Automatically offer an available update (including the startup check).
  if (!window.__novaUpdatePromptBound && window.api.updates && window.api.updates.onAvailable) {
    window.__novaUpdatePromptBound = true;
    window.api.updates.onAvailable((info) => {
      const ver = info && info.version ? (' v' + info.version) : '';
      const wrap = el('div');
      wrap.appendChild(el('h2', null, (t('update_available') || 'Update available') + ver));
      wrap.appendChild(el('p', 'lead', 'A new version is available. Download and install it now? / يتوفر إصدار جديد. هل تريد تنزيله وتثبيته الآن؟'));
      const actions = el('div', 'modal-actions');
      actions.appendChild(makeButton(t('cancel') || 'Later', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
      actions.appendChild(makeButton(t('download') || 'Download', {
        cls: 'btn btn-primary',
        onClick: async () => {
          // Keep the modal open: progress events replace it with a progress view.
          try { await window.api.updates.download(); } catch (_) {}
        }
      }));
      openModalWithActions(wrap, actions);
    });
  }

  // Persistent progress UI — GitHub downloads can take a while, so always show %.
  let updateProgressNode = null;
  function showUpdateProgress(pct) {
    if (!updateProgressNode || !updateProgressNode.isConnected) {
      const wrap = el('div');
      wrap.appendChild(el('h2', null, t('update_downloading') || 'Downloading update'));
      const msg = el('p', 'lead', '');
      wrap.appendChild(msg);
      const actions = el('div', 'modal-actions');
      actions.appendChild(makeButton(t('cancel') || 'Close', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
      openModalWithActions(wrap, actions);
      updateProgressNode = msg;
    }
    updateProgressNode.textContent = (t('update_downloading') || 'Downloading update') + ' — ' + (pct || 0) + '%';
  }

  if (!window.__novaUpdateProgressBound && window.api.updates && window.api.updates.onStatus) {
    window.__novaUpdateProgressBound = true;
    window.api.updates.onStatus((s) => {
      if (!s) return;
      if (s.status === 'downloading') {
        showUpdateProgress(s.progress || 0);
      } else if (s.status === 'downloaded') {
        const wrap = el('div');
        wrap.appendChild(el('h2', null, t('update_ready') || 'Update ready to install'));
        wrap.appendChild(el('p', 'lead', (t('update_ready') || 'Update ready') + (s.version ? (' v' + s.version) : '')));
        const actions = el('div', 'modal-actions');
        actions.appendChild(makeButton(t('install_update') || 'Install & restart', {
          cls: 'btn btn-primary',
          onClick: () => { window.api.updates.install(); }
        }));
        actions.appendChild(makeButton(t('cancel') || 'Close', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
        openModalWithActions(wrap, actions);
      }
    });
  }

  window.api.downloads.onChanged((list) => {
    state.downloads = list;
    if (state.route === 'downloads') render();
  });

  window.addEventListener('error', (e) => {
    window.__novaLastError = e.message || String(e.error || 'script error');
    try {
      window.api.diagnostics.log('renderer-error', {
        message: window.__novaLastError,
        source: e.filename || '',
        line: e.lineno || 0
      });
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    window.__novaLastError = String((e.reason && e.reason.message) || e.reason || 'unhandled rejection');
    try { window.api.diagnostics.log('renderer-rejection', { message: window.__novaLastError }); } catch (_) {}
  });
}

async function boot() {
  try {
    window.api.info().then((info) => { state.info = info; }).catch(() => {});
    state.settings = await window.api.settings.get();
    if (!state.settings || !['en', 'ar'].includes(state.settings.language)) state.settings.language = 'en';
    state.profile = state.settings.profile || 'default';
    try { state.profiles = await window.api.profiles.list(); } catch (_) { state.profiles = ['default']; }
    I18N.init(state.settings.language);
    document.documentElement.dataset.theme = state.settings.theme || 'dark';
    if (state.settings.accent) applyAccent(state.settings.accent, state.settings.accent2);
    applyAccessibility();
    applyWidgetToggles();

    if (state.settings.appLockEnabled && state.settings.appLockSet) {
      await showLockScreen();
    }

    bindGlobal();
    hydrateIcons(document);

    ensurePlayer();
    await Promise.all([refreshLibrary(), refreshDownloads(), refreshRecordings()]);
    await loadAllItems();
    startWeatherAndPrayer();
    startClock();

    render();

    // Detect low-perf (GPU-less / software rendering) AFTER first paint so
    // the initial render never blocks on a WebGL context probe.
    setTimeout(() => { try { detectLowPerf(); } catch (_) {} }, 0);

    if (!state.settings.consentShown) {
      await showConsentDialog();
    }

    state.ready = true;
    window.__novaReady = true;
  } catch (err) {
    window.__novaLastError = err && err.message ? err.message : String(err);
    const message = el('div', 'empty');
    message.appendChild(el('h3', null, 'GomizPlayer IPTV failed to start'));
    message.appendChild(el('p', null, window.__novaLastError));
    view.innerHTML = '';
    view.appendChild(message);
    window.__novaReady = true;
  }
}

