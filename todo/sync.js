/* ==========================================================
   待办清单 · 跨设备同步（GitHub Gist）
   与 /todo/timer/ 共用同一个 token 和同一个 Gist，
   数据写在 Gist 的 todo.json 里。
   ========================================================== */
(function () {
  'use strict';

  const CFG_KEY = 'kaoyan-study-timer-sync-v1';   // 与计时页共用
  const FILE = 'todo.json';
  const API = 'https://api.github.com';
  const DELETED_KEY = 'sqnuzy_blog_todo_deleted';
  const TIMERS_UPDATED_KEY = 'sqnuzy_blog_timers_updated';
  const store = window.todoStore;

  let cfg = readCfg();
  let syncing = false;
  let scheduleTimer = 0;
  let syncError = '';
  let lastSyncAt = cfg.lastSyncAt || 0;
  let lastSnap = new Map();
  let deleted = readDeleted();
  let timersUpdatedAt = Number(localStorage.getItem(TIMERS_UPDATED_KEY)) || 0;

  function readCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return { token: typeof c.token === 'string' ? c.token : '', gistId: typeof c.gistId === 'string' ? c.gistId : '', lastSyncAt: Number(c.lastSyncAt) || 0 };
    } catch (err) {
      return { token: '', gistId: '', lastSyncAt: 0 };
    }
  }
  function writeCfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (err) { c = {}; }
    c.token = cfg.token;
    c.gistId = cfg.gistId;
    c.lastSyncAt = lastSyncAt;
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (err) { /* ignore */ }
  }
  function readDeleted() {
    try {
      const v = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (err) { return []; }
  }
  function writeDeleted() {
    deleted = deleted.slice(-2000);
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(deleted)); } catch (err) { /* ignore */ }
  }

  /* ---------- 数据快照 ---------- */
  // 用来判断“本地是否有新变化”，避免每次同步都多推一次
  let dataUpdatedAt = Number(localStorage.getItem('sqnuzy_blog_todo_updated')) || 0;

  function bumpUpdatedAt() {
    dataUpdatedAt = Date.now();
    try { localStorage.setItem('sqnuzy_blog_todo_updated', String(dataUpdatedAt)); } catch (err) { /* ignore */ }
  }

  function payload() {
    return {
      version: 1,
      updatedAt: dataUpdatedAt,
      tasks: store.getTasks(),
      deletedTasks: deleted,
      timers: store.getTimers() || {},
      timersUpdatedAt: timersUpdatedAt
    };
  }

  /** 给发生变化的任务打上 updated_at，便于多端合并时判断新旧 */
  function stampChangedTasks() {
    const now = Date.now();
    const snap = new Map();
    let changed = false;
    (store.getTasks() || []).forEach(t => {
      const copy = Object.assign({}, t);
      delete copy.updated_at;
      const json = JSON.stringify(copy);
      snap.set(t.id, json);
      if (lastSnap.get(t.id) !== json) { t.updated_at = now; changed = true; }
    });
    if (snap.size !== lastSnap.size) changed = true;
    lastSnap = snap;
    if (changed) bumpUpdatedAt();
    return now;
  }

  /* ---------- 包装原有的保存函数 ---------- */
  const origSaveTasks = window.saveTasks;
  window.saveTasks = function () {
    stampChangedTasks();
    origSaveTasks();
    scheduleSync();
  };

  const origSaveTimer = window.saveTimer;
  window.saveTimer = function (type) {
    timersUpdatedAt = Date.now();
    bumpUpdatedAt();
    try { localStorage.setItem(TIMERS_UPDATED_KEY, String(timersUpdatedAt)); } catch (err) { /* ignore */ }
    origSaveTimer(type);
    scheduleSync();
  };

  const origDeleteTask = window.deleteTask;
  window.deleteTask = function (id) {
    deleted.push(id);
    writeDeleted();
    origDeleteTask(id);
    scheduleSync();
  };

  /* ---------- GitHub API ---------- */
  async function gh(path, opts = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + cfg.token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, { method: opts.method || 'GET', headers, body: opts.body });
    } catch (err) {
      throw new Error('网络连不上 GitHub');
    }
    if (res.status === 401) throw new Error('token 无效或没有 gist 权限');
    if (res.status === 403) throw new Error('GitHub 触发频率限制，稍后再试');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('GitHub 返回 ' + res.status);
    return res.status === 204 ? null : res.json();
  }

  async function ensureGist() {
    if (cfg.gistId) {
      const g = await gh('/gists/' + cfg.gistId);
      if (g) return g;
      cfg.gistId = '';
      writeCfg();
    }
    const list = await gh('/gists?per_page=100');
    const found = Array.isArray(list)
      ? list.find(g => g.files && (g.files[FILE] || g.files['study-time.json']))
      : null;
    if (found) {
      cfg.gistId = found.id;
      writeCfg();
      return found;
    }
    const created = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: '学习时长记录 · 同步数据',
        public: false,
        files: { [FILE]: { content: JSON.stringify(payload(), null, 1) } }
      })
    });
    cfg.gistId = created.id;
    writeCfg();
    return created;
  }

  async function readRemote(gist) {
    const f = gist && gist.files && gist.files[FILE];
    if (!f) return null;
    let content = f.content;
    if (f.truncated && f.raw_url) {
      const r = await fetch(f.raw_url, { headers: { Authorization: 'Bearer ' + cfg.token } });
      content = await r.text();
    }
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) { return null; }
  }

  /* ---------- 合并 ---------- */
  function mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return false;
    const before = JSON.stringify({ t: store.getTasks(), d: deleted, i: store.getTimers(), u: timersUpdatedAt });
    const byId = new Map();
    (Array.isArray(remote.tasks) ? remote.tasks : []).forEach(t => {
      if (t && t.id) byId.set(String(t.id), t);
    });
    (store.getTasks() || []).forEach(t => {
      const r = byId.get(t.id);
      if (!r || (t.updated_at || 0) >= (r.updated_at || 0)) byId.set(t.id, t);
    });
    const del = new Set([...deleted, ...(Array.isArray(remote.deletedTasks) ? remote.deletedTasks : [])]);
    del.forEach(id => byId.delete(String(id)));
    deleted = Array.from(del).slice(-2000);
    writeDeleted();

    const remoteTimers = remote.timers || {};
    const localTimers = store.getTimers() || {};
    const localEmpty = ['elapsed', 'countdown', 'countdown2'].every(k => !(localTimers[k] && localTimers[k].time));
    const remoteHas = ['elapsed', 'countdown', 'countdown2'].some(k => remoteTimers[k] && remoteTimers[k].time);
    if (remoteHas && (Number(remote.timersUpdatedAt || 0) > timersUpdatedAt || localEmpty)) {
      timersUpdatedAt = Math.max(timersUpdatedAt, Number(remote.timersUpdatedAt) || 0);
      try { localStorage.setItem(TIMERS_UPDATED_KEY, String(timersUpdatedAt)); } catch (err) { /* ignore */ }
      store.setTimers(Object.assign({}, store.getTimers(), remoteTimers));
    }
    dataUpdatedAt = Math.max(dataUpdatedAt, Number(remote.updatedAt) || 0);
    try { localStorage.setItem('sqnuzy_blog_todo_updated', String(dataUpdatedAt)); } catch (err) { /* ignore */ }

    store.setTasks(Array.from(byId.values()));
    try { localStorage.setItem('sqnuzy_blog_todo_tasks', JSON.stringify(store.getTasks())); } catch (err) { /* ignore */ }
    try { localStorage.setItem('sqnuzy_blog_timers', JSON.stringify(store.getTimers())); } catch (err) { /* ignore */ }
    if (typeof window.render === 'function') window.render();
    if (typeof window.loadTimers === 'function') window.loadTimers();

    const after = JSON.stringify({ t: store.getTasks(), d: deleted, i: store.getTimers(), u: timersUpdatedAt });
    return before !== after;
  }

  async function syncNow(opts = {}) {
    if (!cfg.token) {
      if (!opts.silent) showPanel();
      return false;
    }
    if (syncing) return false;
    syncing = true;
    syncError = '';
    renderChip();
    try {
      const gist = await ensureGist();
      const remote = await readRemote(gist);
      if (remote) mergeRemote(remote);
      const localJson = JSON.stringify(payload(), null, 1);
      const remoteJson = remote ? JSON.stringify(remote, null, 1) : '';
      if (localJson !== remoteJson) {
        await gh('/gists/' + cfg.gistId, {
          method: 'PATCH',
          body: JSON.stringify({ files: { [FILE]: { content: localJson } } })
        });
      }
      lastSyncAt = Date.now();
      writeCfg();
      if (!opts.silent) toastBox('已同步');
    } catch (err) {
      syncError = String((err && err.message) || err);
      if (!opts.silent) toastBox('同步失败：' + syncError);
    } finally {
      syncing = false;
      renderChip();
      if (panelEl && !panelEl.hidden) renderPanel();
    }
    return !syncError;
  }

  function scheduleSync(delay = 4000) {
    if (!cfg.token) return;
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(() => syncNow({ silent: true }), delay);
  }

  /** 账号里可能有多个 Gist（例如两台设备各自建了一个），把它们全部合并回来 */
  async function recoverFromAllGists() {
    if (!cfg.token || syncing) return;
    syncing = true;
    syncError = '';
    renderChip();
    try {
      const list = await gh('/gists?per_page=100');
      const cands = (Array.isArray(list) ? list : []).filter(g => g.files && g.files[FILE]);
      let found = 0;
      for (const g of cands) {
        if (cfg.gistId && g.id === cfg.gistId) continue;
        const r = await readRemote(g);
        if (r && Array.isArray(r.tasks) && r.tasks.length) {
          mergeRemote(r);
          found++;
        }
      }
      syncing = false;
      if (found) {
        await syncNow({ silent: true });
        toastBox(`已从其他 ${found} 个 Gist 合并数据`);
      } else {
        toastBox('没有找到其他带任务的 Gist');
      }
    } catch (err) {
      syncError = String((err && err.message) || err);
      toastBox('找回失败：' + syncError);
    } finally {
      syncing = false;
      renderChip();
      if (panelEl && !panelEl.hidden) renderPanel();
    }
  }

  /* ---------- UI ---------- */
  let panelEl = null;

  function injectStyles() {
    const css = `
      .sort-bar{flex-wrap:wrap;row-gap:8px}
      @media (max-width:700px){
        .sort-bar>a{margin-left:0!important}
        .todo-sync-banner{font-size:12.5px;padding:9px 12px}
      }
      .todo-sync-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#555;font-size:13px;font-family:inherit;cursor:pointer;line-height:1.2;white-space:nowrap}
      .todo-sync-btn:hover{border-color:#bbb;color:#222}
      .todo-sync-btn .dot{width:7px;height:7px;border-radius:50%;background:#ccc;flex:none}
      .todo-sync-btn.on .dot{background:#2f9e8f}
      .todo-sync-btn.err .dot{background:#d94f3d}
      .todo-sync-btn.off{border-color:#e8613c;color:#e8613c;font-weight:600}
      .todo-sync-btn.off .dot{background:#e8613c}
      .todo-sync-btn.syncing .dot{background:#e8a13c;animation:todoSyncPulse 1s infinite}
      .todo-sync-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:1200px;margin:0 auto 14px;padding:10px 14px;border-radius:10px;border:1px solid #f0c9b8;background:#fff7f2;color:#7a4a33;font-size:13px;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
      .todo-sync-banner[hidden]{display:none}
      .todo-sync-banner.err{border-color:#eccac2;background:#fdf3f0;color:#a33a26}
      .todo-sync-banner button{border:1px solid #e8613c;background:#e8613c;color:#fff;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
      .todo-sync-banner button:hover{opacity:.9}
      @keyframes todoSyncPulse{50%{opacity:.35}}
      .todo-sync-mask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(25,20,12,.42);backdrop-filter:blur(3px)}
      .todo-sync-mask[hidden]{display:none}
      .todo-sync-box{width:min(440px,100%);max-height:86vh;overflow:auto;background:#fffdf9;color:#24201c;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);padding:20px 22px 22px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
      .todo-sync-box h3{margin:0 0 4px;font-size:17px}
      .todo-sync-box .sub{font-size:12px;color:#8b8173;line-height:1.6;margin:0 0 12px}
      .todo-sync-box ol{font-size:12.5px;line-height:1.8;color:#5c5349;padding-left:20px;margin:10px 0}
      .todo-sync-box code{font-size:11.5px;background:#f3ebdd;border-radius:5px;padding:1px 5px}
      .todo-sync-row{display:flex;gap:8px;margin:10px 0}
      .todo-sync-row input{flex:1;min-width:0;height:36px;border-radius:9px;border:1px solid #e2d8c8;background:#faf6ee;padding:0 10px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;outline:0}
      .todo-sync-box button{border:1px solid #e2d8c8;background:#faf6ee;color:#3d362e;border-radius:9px;padding:8px 12px;font-size:13px;font-family:inherit;cursor:pointer}
      .todo-sync-box button.primary{background:#e8613c;border-color:#e8613c;color:#fff}
      .todo-sync-box button.danger{color:#c8442f;border-color:#eccac2;background:#fdf3f0}
      .todo-sync-box .close{position:absolute;top:10px;right:12px;border:0;background:transparent;font-size:16px;color:#8b8173}
      .todo-sync-box{position:relative}
      .todo-sync-box .status{font-size:12px;color:#2f9e8f;font-weight:600}
      .todo-sync-box .status.err{color:#c8442f}
      .todo-sync-box .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .todo-sync-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#24201c;color:#f4f0e8;font-size:13px;padding:10px 16px;border-radius:10px;z-index:10000;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
      .todo-sync-toast.show{opacity:1}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function toastBox(msg) {
    let t = document.querySelector('.todo-sync-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'todo-sync-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastBox._t);
    toastBox._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function chip() {
    let btn = document.getElementById('todoSyncBtn');
    if (btn) return btn;
    const container = document.querySelector('.sort-bar');
    if (!container) return null;
    btn = document.createElement('button');
    btn.id = 'todoSyncBtn';
    btn.type = 'button';
    btn.className = 'todo-sync-btn';
    btn.addEventListener('click', () => showPanel());
    const link = container.querySelector('a[href="/todo/timer/"]');
    if (link) link.parentNode.insertBefore(btn, link);
    else container.appendChild(btn);
    return btn;
  }

  function renderChip() {
    const btn = chip();
    if (!btn) return;
    btn.classList.toggle('on', !!cfg.token && !syncError);
    btn.classList.toggle('err', !!(cfg.token && syncError));
    btn.classList.toggle('off', !cfg.token);
    btn.classList.toggle('syncing', syncing);
    let text = '开启云同步';
    if (cfg.token) {
      if (syncing) text = '同步中…';
      else if (syncError) text = '同步失败';
      else text = '云同步：已开启';
    }
    btn.innerHTML = '<span class="dot"></span>' + text;
    btn.title = syncError || (cfg.token ? '点击查看同步状态' : '点击开启跨设备同步');
    renderBanner();
  }

  function banner() {
    let b = document.getElementById('todoSyncBanner');
    if (b) return b;
    const anchor = document.querySelector('.todo-layout');
    if (!anchor || !anchor.parentNode) return null;
    b = document.createElement('div');
    b.id = 'todoSyncBanner';
    b.className = 'todo-sync-banner';
    b.hidden = true;
    b.innerHTML = '<span></span><button type="button">开启</button>';
    b.querySelector('button').addEventListener('click', () => {
      if (syncError && cfg.token) syncNow();
      else showPanel();
    });
    anchor.parentNode.insertBefore(b, anchor);
    return b;
  }

  function renderBanner() {
    const b = banner();
    if (!b) return;
    const txt = b.querySelector('span');
    const act = b.querySelector('button');
    if (!cfg.token) {
      b.hidden = false;
      b.className = 'todo-sync-banner';
      txt.textContent = '云同步还没开启：手机和电脑各连一次，才能看到同一份待办';
      act.textContent = '去开启';
    } else if (syncError) {
      b.hidden = false;
      b.className = 'todo-sync-banner err';
      txt.textContent = '同步失败：' + syncError;
      act.textContent = '重试';
    } else {
      b.hidden = true;
    }
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.className = 'todo-sync-mask';
    panelEl.hidden = true;
    panelEl.innerHTML = '<div class="todo-sync-box" role="dialog" aria-modal="true" aria-label="跨设备同步"><button class="close" type="button" aria-label="关闭">✕</button><div class="body"></div></div>';
    document.body.appendChild(panelEl);
    panelEl.addEventListener('click', e => {
      if (e.target === panelEl) hidePanel();
    });
    panelEl.querySelector('.close').addEventListener('click', hidePanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panelEl.hidden) hidePanel(); });
    return panelEl;
  }

  function showPanel() {
    ensurePanel();
    panelEl.hidden = false;
    renderPanel();
  }
  function hidePanel() {
    if (panelEl) panelEl.hidden = true;
  }

  function renderPanel() {
    const body = panelEl.querySelector('.body');
    const connected = !!cfg.token;
    const statusText = syncError ? '同步失败：' + syncError
      : (connected ? (syncing ? '同步中…' : '已连接' + (lastSyncAt ? ' · 上次同步 ' + timeText(lastSyncAt) : '')) : '未开启');
    const gistLine = connected
      ? `<p class="sub">Gist：<code>${cfg.gistId ? cfg.gistId.slice(0, 10) : '尚未创建'}</code> · 本机任务 <b>${store.getTasks().length}</b> 条</p>`
      : '';
    let html = `<h3>跨设备同步</h3>
      <p class="sub">和计时页共用同一个 Gist：手机、电脑打开 ${location.origin} 下的页面，看到的是同一份待办。数据存在你私有的 GitHub Gist（<code>todo.json</code>）。</p>
      <p class="status${syncError ? ' err' : ''}">${statusText}</p>
      ${gistLine}`;
    if (!connected) {
      html += `<ol>
        <li>打开 <a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=study-timer" target="_blank" rel="noopener">github.com/settings/tokens</a>，勾选 <b>gist</b>，生成 token</li>
        <li>粘贴到下面（在计时页连过的话，这里会自动是已连接）</li>
      </ol>
      <div class="todo-sync-row"><input id="todoSyncToken" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="primary" id="todoSyncConnect" type="button">连接并同步</button></div>`;
    } else {
      html += `<div class="actions">
        <button class="primary" id="todoSyncNow" type="button">立即同步</button>
        <button id="todoSyncOpenGist" type="button">查看 Gist</button>
        <button id="todoSyncRecover" type="button">从其他 Gist 找回</button>
        <button class="danger" id="todoSyncDisconnect" type="button">断开</button>
      </div>
      <p class="sub" style="margin-top:8px">如果另一台设备上有任务、这里却是空的，先点「立即同步」；还不行就点「从其他 Gist 找回」，会把账号里所有带 todo.json 的 Gist 合并进来。</p>`;
    }
    body.innerHTML = html;
    if (!connected) {
      body.querySelector('#todoSyncConnect').addEventListener('click', async () => {
        const v = body.querySelector('#todoSyncToken').value.trim();
        if (!v) { toastBox('先粘贴 GitHub token'); return; }
        cfg.token = v;
        cfg.gistId = '';
        writeCfg();
        renderChip();
        await syncNow();
        if (cfg.token) renderPanel();
      });
    } else {
      body.querySelector('#todoSyncNow').addEventListener('click', () => syncNow());
      body.querySelector('#todoSyncRecover').addEventListener('click', () => recoverFromAllGists());
      body.querySelector('#todoSyncOpenGist').addEventListener('click', () => {
        if (!cfg.gistId) { toastBox('还没有同步过，先点「立即同步」'); return; }
        window.open('https://gist.github.com/' + cfg.gistId, '_blank', 'noopener');
      });
      body.querySelector('#todoSyncDisconnect').addEventListener('click', () => {
        if (!confirm('断开云同步？本机数据会保留，但不再与其他设备同步。')) return;
        cfg.token = '';
        cfg.gistId = '';
        writeCfg();
        syncError = '';
        renderChip();
        renderPanel();
        toastBox('已断开云同步');
      });
    }
  }

  function timeText(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- 启动 ---------- */
  function boot() {
    injectStyles();
    chip();
    renderChip();
    // 建立初始快照，避免把旧任务全部当成“刚改过”
    (store.getTasks() || []).forEach(t => {
      const copy = Object.assign({}, t);
      delete copy.updated_at;
      lastSnap.set(t.id, JSON.stringify(copy));
    });
    if (cfg.token) {
      setTimeout(() => syncNow({ silent: true }), 900);
      window.addEventListener('online', () => scheduleSync(300));
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) syncNow({ silent: true });
      });
    }
    // 暴露给调试 / 其它脚本
    window.__todoSync = {
      now: syncNow,
      merge: mergeRemote,
      payload,
      recover: recoverFromAllGists,
      status: () => ({ connected: !!cfg.token, syncing, error: syncError, lastSyncAt })
    };
  }

  if (document.querySelector('.sort-bar')) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
