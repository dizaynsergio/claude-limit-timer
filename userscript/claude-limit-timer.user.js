// ==UserScript==
// @name         Claude Limit Timer
// @namespace    sergiodesign.online
// @version      1.0
// @description  Показывает расход 5-часового лимита Claude, время до сброса, напоминает за час и сообщает о сбросе
// @match        https://claude.ai/*
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== Настройки =====
  const POLL_MS = 2 * 60 * 1000;   // как часто спрашивать лимит у claude.ai
  const TICK_MS = 30 * 1000;       // как часто обновлять обратный отсчёт
  const WARN_MIN = 60;             // напомнить за N минут до сброса
  const WARN_PCT = 80;             // предупредить, когда использовано ≥ N%
  const SOUND = true;              // короткий сигнал при уведомлениях

  let orgId = null;
  let data = null;                 // { pct, resetsAt (ms), weekPct, weekResetsAt }
  const store = {
    get: (k, d) => { try { return GM_getValue(k, d); } catch { return d; } },
    set: (k, v) => { try { GM_setValue(k, v); } catch {} },
  };

  // ===== Виджет =====
  const css = `
    #clt-badge{position:fixed;right:16px;bottom:16px;z-index:99999;font:600 12px/1.3 system-ui,sans-serif;
      background:#1f1e1d;color:#f5f4ef;border-radius:12px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,.25);
      cursor:pointer;user-select:none;min-width:150px;opacity:.92;transition:opacity .2s}
    #clt-badge:hover{opacity:1}
    #clt-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.15);margin-top:6px;overflow:hidden}
    #clt-fill{height:100%;width:0;transition:width .4s,background .4s}
    #clt-toast{position:fixed;right:16px;bottom:84px;z-index:99999;max-width:300px;font:500 13px/1.4 system-ui,sans-serif;
      background:#d97757;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.3);
      opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none}
    #clt-toast.show{opacity:1;transform:none}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const badge = document.createElement('div');
  badge.id = 'clt-badge';
  badge.innerHTML = `<div id="clt-text">⏳ Лимит: загрузка…</div><div id="clt-bar"><div id="clt-fill"></div></div>`;
  badge.title = 'Клик — обновить · Двойной клик — открыть страницу лимитов';
  document.body.appendChild(badge);

  const toast = document.createElement('div');
  toast.id = 'clt-toast';
  document.body.appendChild(toast);

  badge.addEventListener('click', () => refresh(true));
  badge.addEventListener('dblclick', () => { location.href = '/settings/usage'; });

  // ===== Данные =====
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function getOrgId() {
    if (orgId) return orgId;
    orgId = getCookie('lastActiveOrg');
    if (orgId) return orgId;
    const r = await fetch('/api/organizations', { credentials: 'include' });
    if (!r.ok) throw new Error('orgs ' + r.status);
    const orgs = await r.json();
    const chat = orgs.find(o => (o.capabilities || []).includes('chat')) || orgs[0];
    orgId = chat && chat.uuid;
    return orgId;
  }

  async function fetchUsage() {
    const id = await getOrgId();
    if (!id) throw new Error('no org');
    const r = await fetch(`/api/organizations/${id}/usage`, { credentials: 'include' });
    if (!r.ok) throw new Error('usage ' + r.status);
    const j = await r.json();
    const fh = j.five_hour || {};
    const sd = j.seven_day || {};
    return {
      pct: Math.round(fh.utilization ?? 0),
      resetsAt: fh.resets_at ? Date.parse(fh.resets_at) : null,
      weekPct: sd.utilization != null ? Math.round(sd.utilization) : null,
      weekResetsAt: sd.resets_at ? Date.parse(sd.resets_at) : null,
    };
  }

  // ===== Формат =====
  function fmtLeft(ms) {
    if (ms <= 0) return 'сейчас';
    const m = Math.ceil(ms / 60000);
    const h = Math.floor(m / 60), mm = m % 60;
    return h ? `${h}ч ${mm}м` : `${mm}м`;
  }
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function color(p) {
    return p >= WARN_PCT ? '#e5484d' : p >= 50 ? '#f5a524' : '#46a758';
  }

  // ===== Уведомления =====
  function beep() {
    if (!SOUND) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.05;
      o.start(); o.stop(ctx.currentTime + 0.18);
    } catch {}
  }
  function notify(title, text) {
    toast.textContent = `${title} — ${text}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 8000);
    beep();
    try { GM_notification({ title, text, timeout: 10000 }); } catch {}
  }

  function checkAlerts(d) {
    const now = Date.now();
    const winKey = d.resetsAt ? String(d.resetsAt) : 'none';
    const prevWin = store.get('clt_window', null);
    const prevPct = store.get('clt_pct', null);

    // Сброс: окно сменилось, а раньше лимит был потрачен
    if (prevWin && prevWin !== winKey && prevPct != null && prevPct > 0 && d.pct < prevPct) {
      notify('✅ Лимит сброшен', 'Можно снова работать на полную');
    }
    // Окно истекло, а новых сообщений ещё не было
    const prevReset = Number(prevWin);
    if (prevReset && now >= prevReset && !store.get('clt_reset_' + prevWin) && prevPct > 0) {
      store.set('clt_reset_' + prevWin, 1);
      if (prevWin === winKey) notify('✅ Лимит сброшен', 'Новое 5-часовое окно начнётся со следующего сообщения');
    }

    if (d.resetsAt) {
      const left = d.resetsAt - now;
      if (left > 0 && left <= WARN_MIN * 60000 && !store.get('clt_warn_' + winKey)) {
        store.set('clt_warn_' + winKey, 1);
        notify('⏰ Час до сброса', `Окно обновится в ${fmtTime(d.resetsAt)}, использовано ${d.pct}%`);
      }
    }
    if (d.pct >= WARN_PCT && !store.get('clt_pctwarn_' + winKey)) {
      store.set('clt_pctwarn_' + winKey, 1);
      notify('⚠️ Лимит почти исчерпан', `Использовано ${d.pct}%` + (d.resetsAt ? `, сброс в ${fmtTime(d.resetsAt)}` : ''));
    }

    store.set('clt_window', winKey);
    store.set('clt_pct', d.pct);
  }

  // ===== Отрисовка =====
  function render() {
    const text = document.getElementById('clt-text');
    const fill = document.getElementById('clt-fill');
    if (!data) return;
    const now = Date.now();
    let line;
    if (!data.resetsAt || data.resetsAt <= now) {
      line = data.resetsAt && data.resetsAt <= now ? `✅ Лимит сброшен · 0%` : `🟢 Лимит свободен · ${data.pct}%`;
      fill.style.width = (data.resetsAt <= now ? 0 : data.pct) + '%';
    } else {
      line = `⏳ ${data.pct}% · сброс через ${fmtLeft(data.resetsAt - now)}`;
      fill.style.width = Math.min(100, data.pct) + '%';
    }
    text.textContent = line;
    fill.style.background = color(data.pct);
    badge.title =
      (data.resetsAt ? `Сброс 5-часового окна: ${fmtTime(data.resetsAt)}\n` : '') +
      (data.weekPct != null ? `Недельный лимит: ${data.weekPct}%` +
        (data.weekResetsAt ? ` (сброс ${new Date(data.weekResetsAt).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : '') + '\n' : '') +
      'Клик — обновить · Двойной клик — страница лимитов';
  }

  async function refresh(manual) {
    try {
      data = await fetchUsage();
      checkAlerts(data);
      render();
    } catch (e) {
      document.getElementById('clt-text').textContent = '⚠️ Нет данных о лимите';
      badge.title = 'Не удалось получить лимит: ' + e.message + '\nДвойной клик — страница лимитов';
      if (manual) console.warn('[Claude Limit Timer]', e);
    }
  }

  function tick() {
    if (!data) return;
    // Окно истекло между опросами — сразу перепроверяем
    if (data.resetsAt && Date.now() >= data.resetsAt) refresh();
    else { checkAlerts(data); render(); }
  }

  refresh();
  setInterval(refresh, POLL_MS);
  setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
