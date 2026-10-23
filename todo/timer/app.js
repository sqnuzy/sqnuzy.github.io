/* ==========================================================
   学习时长记录 · app.js
   正向计时（秒表）· 数据存 localStorage · 时间按本机时区
   ========================================================== */
(() => {
  'use strict';

  const STORE_KEY = 'kaoyan-study-timer-v2';
  const OLD_KEYS = ['kaoyan-pomodoro-v1'];
  const PALETTE = ['#FF6B4A', '#2E8BFF', '#22C55E', '#8B5CF6', '#FFB020',
                   '#EC4899', '#06B6D4', '#F97316', '#10B981', '#6366F1',
                   '#EF4444', '#64748B'];
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  const MIN_RECORD_SEC = 10;       // 低于 10 秒直接忽略，10 秒及以上直接记账
  const DEFAULT_MOTTO = '还有多少个明天可以浪费，还有多少个夜晚可以忏悔';
  // 旧版默认配色 → 新版高饱和配色（只在颜色没被用户改过时替换）
  const LEGACY_COLORS = { math: '#E8613C', english: '#3F8FBF', politics: '#7FB069', major: '#8667D8' };
  const FRESH_COLORS = { math: '#FF6B4A', english: '#2E8BFF', politics: '#22C55E', major: '#8B5CF6' };

  /* ---------------- 小工具 ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const dayKey = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => dayKey(a) === dayKey(b);

  /** 时钟样式：1:02:03 / 12:34 / 100:05 */
  function fmtClockSec(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(ss)}`;
    return `${m >= 100 ? m : pad(m)}:${pad(ss)}`;
  }

  /** 中文时长：1 小时 20 分 / 25 分钟 / 40 秒 */
  function fmtHM(seconds) {
    const sec = Math.max(0, Math.round(seconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
    if (m > 0) return `${m} 分钟`;
    return sec > 0 ? `${sec} 秒` : '0 分钟';
  }

  /** 紧凑：1h20m / 25m */
  function fmtShort(seconds) {
    const sec = Math.max(0, Math.round(seconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
    return `${m}m`;
  }

  const fmtClock = ts => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  /** 时间段：09:12–09:37 */
  const fmtRange = s => `${fmtClock(s.beganAt || s.ts - s.dur * 1000)}–${fmtClock(s.ts)}`;

  /* ---------------- 数据层 ---------------- */
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  let demoMode = DEMO;

  const defaultSettings = () => ({
    dailyGoal: 240,
    sound: true,
    theme: 'light',
    range: 'today',
    customFrom: '',
    customTo: '',
    selected: 'math',
    note: '',
    motto: DEFAULT_MOTTO
  });

  function seedData() {
    return {
      version: 2,
      subjects: [
        { id: 'math',    name: '数学',   color: '#FF6B4A' },
        { id: 'english', name: '英语',   color: '#2E8BFF' },
        { id: 'politics',name: '政治',   color: '#22C55E' },
        { id: 'major',   name: '专业课', color: '#8B5CF6' }
      ],
      sessions: [],
      settings: defaultSettings(),
      updatedAt: 0,
      settingsAt: 0,
      deletedSessions: [],
      deletedSubjects: []
    };
  }

  function normalize(raw) {
    const base = seedData();
    if (!raw || typeof raw !== 'object') return base;
    const data = {
      version: 2,
      subjects: Array.isArray(raw.subjects) && raw.subjects.length
        ? raw.subjects.filter(s => s && s.id && s.name).map(s => ({
            id: String(s.id),
            name: String(s.name).slice(0, 16),
            color: /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : PALETTE[0]
          }))
        : base.subjects,
      sessions: Array.isArray(raw.sessions)
        ? raw.sessions.filter(s => s && s.ts && s.dur > 0).map(s => ({
            id: s.id || uid(),
            ts: Number(s.ts),
            dur: Number(s.dur),
            beganAt: Number(s.beganAt) || (Number(s.ts) - Number(s.dur) * 1000),
            subjectId: String(s.subjectId || ''),
            note: typeof s.note === 'string' ? s.note.slice(0, 60) : '',
            mode: 'focus'
          }))
        : [],
      settings: Object.assign(defaultSettings(), raw.settings || {}),
      updatedAt: Number(raw.updatedAt) || 0,
      settingsAt: Number(raw.settingsAt) || 0,
      deletedSessions: Array.isArray(raw.deletedSessions)
        ? raw.deletedSessions.filter(x => typeof x === 'string').slice(-2000)
        : [],
      deletedSubjects: Array.isArray(raw.deletedSubjects)
        ? raw.deletedSubjects.filter(x => typeof x === 'string')
        : []
    };
    const s = data.settings;
    data.subjects.forEach(sub => {
      const old = LEGACY_COLORS[sub.id];
      if (old && String(sub.color).toLowerCase() === old.toLowerCase()) sub.color = FRESH_COLORS[sub.id];
    });
    s.dailyGoal = clamp(Number(s.dailyGoal) || 0, 0, 1440);
    s.sound = s.sound !== false;
    s.motto = typeof s.motto === 'string' ? s.motto.slice(0, 40) : DEFAULT_MOTTO;
    s.theme = s.theme === 'dark' ? 'dark' : 'light';
    if (!['today', 'week', 'month', 'custom'].includes(s.range)) s.range = 'today';
    const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseKey(v).getTime());
    if (!isDate(s.customFrom)) s.customFrom = '';
    if (!isDate(s.customTo)) s.customTo = '';
    if (!data.subjects.some(x => x.id === s.selected)) s.selected = data.subjects[0].id;
    return data;
  }

  function load() {
    if (DEMO) return seedData();
    try {
      for (const key of [STORE_KEY, ...OLD_KEYS]) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        // 旧版番茄钟的数据结构兼容：只取科目 / 记录 / 目标
        if (key !== STORE_KEY) {
          parsed.settings = {
            dailyGoal: parsed.settings && parsed.settings.dailyGoal,
            sound: parsed.settings && parsed.settings.sound,
            theme: parsed.settings && parsed.settings.theme,
            selected: parsed.settings && parsed.settings.selected
          };
        }
        return normalize(parsed);
      }
      return seedData();
    } catch (err) {
      console.warn('读取本地数据失败，使用初始数据', err);
      return seedData();
    }
  }

  let data = load();
  let dirty = false;
  let saveTimer = null;

  function save(immediate = false) {
    if (demoMode) return;
    dirty = true;
    if (immediate) { flushSave(); scheduleSync(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 250);
    scheduleSync();
  }
  function flushSave() {
    if (!dirty || demoMode) return;
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      dirty = false;
    } catch (err) {
      console.warn('保存失败', err);
      toast('本地存储写入失败（可能是隐私模式或空间已满）');
    }
  }
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

  const subjectById = id => data.subjects.find(s => s.id === id) || null;
  const subjectName = id => (subjectById(id) || {}).name || '未分类';
  const subjectColor = id => (subjectById(id) || {}).color || '#8A7A6A';

  /* ---------------- 运行时状态（正向计时） ---------------- */
  const state = {
    running: false,
    elapsedMs: 0,     // 暂停时累计的毫秒
    startedAt: 0,     // 本段开始的时间戳（用于展示与记录）
    runSince: 0,      // 本次「继续」时的 performance.now()
    sessionSubject: null,
    sessionNote: '',
    raf: 0,
    ticker: 0,
    lastPaintSec: -1,
    lastPersist: 0,
    minuteSweep: 0
  };

  const el = {
    topDate: $('#topDate'),
    motto: $('#motto'),
    mottoText: $('#mottoText'),
    timerCard: $('#timerCard'),
    ringWrap: $('#ringWrap'),
    ringProgress: $('#ringProgress'),
    ringPhase: $('#ringPhase'),
    ringTime: $('#ringTime'),
    ringSub: $('#ringSub'),
    ringGradA: $('#ringGradA'),
    ringGradB: $('#ringGradB'),
    liveDot: $('#liveDot'),
    headState: $('#headState'),
    headToday: $('#headToday'),
    subjectPills: $('#subjectPills'),
    lockHint: $('#lockHint'),
    noteInput: $('#noteInput'),
    btnStart: $('#btnStart'),
    startLabel: $('#startLabel'),
    startIcon: $('#startIcon'),
    btnFinish: $('#btnFinish'),

    flowList: $('#flowList'),
    btnFlowHistory: $('#btnFlowHistory'),
    statFocus: $('#statFocus'),
    statLongest: $('#statLongest'),
    statSessions: $('#statSessions'),
    goalText: $('#goalText'),
    goalFill: $('#goalFill'),
    goalSub: $('#goalSub'),
    chartCaption: $('#chartCaption'),
    rangeTabs: $('#rangeTabs'),
    rangeCustom: $('#rangeCustom'),
    rangeFrom: $('#rangeFrom'),
    rangeTo: $('#rangeTo'),
    rangeHint: $('#rangeHint'),
    donut: $('#donut'),
    pieTotal: $('#pieTotal'),
    legend: $('#legend'),
    weekBars: $('#weekBars'),
    weekAvg: $('#weekAvg'),
    historySheet: $('#historySheet'),
    historyBody: $('#historyBody'),
    settingsSheet: $('#settingsSheet'),
    subjectManage: $('#subjectManage'),
    swatches: $('#swatches'),
    newSubjectName: $('#newSubjectName'),
    btnTheme: $('#btnTheme'),
    toast: $('#toast')
  };

  let toastTimer = 0;
  function showToast(node, timeout = 2600) {
    clearTimeout(toastTimer);
    el.toast.innerHTML = '';
    el.toast.appendChild(node);
    el.toast.classList.add('show');
    if (timeout > 0) toastTimer = setTimeout(hideToast, timeout);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    el.toast.classList.remove('show');
  }
  function toast(msg) {
    const span = document.createElement('span');
    span.textContent = msg;
    showToast(span);
  }
  /** 带按钮的提示：不满最短时长时让用户选「丢弃」还是「继续」 */
  function toastAction(msg, buttons, timeout = 12000) {
    const wrap = document.createElement('div');
    wrap.className = 'toast-action';
    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = msg;
    const bar = document.createElement('div');
    bar.className = 'toast-btns';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-btn' + (b.primary ? ' primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        hideToast();
        if (b.onClick) b.onClick();
      });
      bar.appendChild(btn);
    });
    wrap.appendChild(text);
    wrap.appendChild(bar);
    showToast(wrap, timeout);
  }

  /* ---------------- 计时引擎 ---------------- */
  // 用时长的单调时钟，避免系统改时间 / 时区跳变影响
  const nowMs = () => (window.performance && performance.now ? performance.now() : Date.now());
  const elapsedMs = () => state.elapsedMs + (state.running ? nowMs() - state.runSince : 0);
  const elapsedSec = () => elapsedMs() / 1000;

  function start() {
    if (state.running) return;
    if (!state.sessionSubject || !subjectById(state.sessionSubject)) {
      state.sessionSubject = data.settings.selected;
    }
    if (!state.startedAt) state.startedAt = Date.now();
    state.sessionNote = el.noteInput.value.trim();
    state.runSince = nowMs();
    state.running = true;
    paintAll();
    loop();
    persistSession();
    state.lastPersist = Date.now();
    unlockAudio();
  }

  function pause() {
    if (!state.running) return;
    state.elapsedMs = elapsedMs();
    state.running = false;
    cancelAnimationFrame(state.raf);
    clearInterval(state.ticker);
    paintAll();
    persistSession();
  }

  function toggle() {
    if (state.running) pause(); else start();
    unlockAudio();
  }



  /** 结束并记账 */
  function finish() {
    const sec = Math.round(elapsedSec());
    if (sec <= 0 && !state.running) { toast('还没有开始计时'); return; }
    if (sec < MIN_RECORD_SEC) {
      // 不到 10 秒：直接忽略，不弹提示
      cancelAnimationFrame(state.raf);
      clearInterval(state.ticker);
      state.running = false;
      state.elapsedMs = 0;
      state.startedAt = 0;
      state.runSince = 0;
      state.minuteSweep = 0;
      state.lastPaintSec = -1;
      try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
      hideToast();
      paintAll();
      toast('不到 10 秒，已忽略');
      return;
    }

    const subjectId = state.sessionSubject || data.settings.selected;
    // 备注优先取输入框（可能暂停后还在编辑），其次取开始计时时记下的
    const note = el.noteInput.value.trim() || state.sessionNote;
    // 结束时间取真实时刻；持续时间用单调时钟
    const endedAt = Date.now();
    const beganAt = endedAt - sec * 1000;
    recordSession(subjectId, sec, note, endedAt, beganAt);
    cancelAnimationFrame(state.raf);
    clearInterval(state.ticker);
    state.running = false;
    state.elapsedMs = 0;
    state.startedAt = 0;
    state.runSince = 0;
    state.minuteSweep = 0;
    state.lastPaintSec = -1;
    try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
    el.noteInput.value = '';
    data.settings.note = '';
    state.sessionNote = '';
    save();
    paintAll();
    renderStats();
    renderChart();
    renderWeekBars();
    renderFlow();
    if (!el.historySheet.hidden) renderHistory();
    toast(`已记录 ${fmtHM(sec)} · ${subjectName(subjectId)}`);
    playChime();
    flashRing();
  }

  /** 刷新 / 关页面时把“正在计的这一段”存下来，下次打开恢复为暂停状态（不自动记账） */
  const SESSION_KEY = 'kaoyan-study-timer-session-v1';

  function persistSession() {
    try {
      const ms = elapsedMs();
      if (ms < MIN_RECORD_SEC * 1000) { localStorage.removeItem(SESSION_KEY); return; }
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        elapsedMs: ms,
        running: state.running,
        subjectId: state.sessionSubject || data.settings.selected,
        note: el.noteInput.value,
        savedAt: Date.now()
      }));
    } catch (err) { /* ignore */ }
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      localStorage.removeItem(SESSION_KEY);
      if (!s || !(s.elapsedMs >= MIN_RECORD_SEC * 1000)) return;
      if (Date.now() - (s.savedAt || 0) > 12 * 3600 * 1000) return;
      state.elapsedMs = s.elapsedMs;
      state.running = false;
      state.runSince = 0;
      state.sessionSubject = s.subjectId || data.settings.selected;
      if (s.note) {
        el.noteInput.value = s.note;
        state.sessionNote = s.note.trim();
      }
      paintAll();
      setTimeout(() => toast(`已恢复上一段 ${fmtHM(s.elapsedMs / 1000)}，点「继续」接着计`), 700);
    } catch (err) { /* ignore */ }
  }

  window.addEventListener('pagehide', persistSession);
  window.addEventListener('beforeunload', persistSession);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistSession(); });

  function loop() {
    cancelAnimationFrame(state.raf);
    clearInterval(state.ticker);
    const step = () => {
      if (!state.running) return;
      paintTime();
      if (Date.now() - state.lastPersist > 2000) {
        state.lastPersist = Date.now();
        persistSession();
      }
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
    // 兜底：无头浏览器 / 极省电模式下 rAF 可能不触发，用定时器保证秒数照常走
    state.ticker = setInterval(() => {
      if (!state.running) return;
      paintTime();
      if (Date.now() - state.lastPersist > 2000) {
        state.lastPersist = Date.now();
        persistSession();
      }
    }, 250);
  }

  /* 从后台切回时补算 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (state.running) { paintTime(); loop(); }
  });

  /* ---------------- 记录 ---------------- */
  function recordSession(subjectId, seconds, note, endedAt, beganAt) {
    const dur = Math.max(1, Math.round(seconds));
    data.sessions.push({
      id: uid(),
      ts: endedAt || Date.now(),
      dur,
      beganAt: beganAt || (endedAt || Date.now()) - dur * 1000,
      subjectId,
      note: (note || '').slice(0, 60),
      mode: 'focus'
    });
    if (data.sessions.length > 6000) data.sessions = data.sessions.slice(-6000);
    data.updatedAt = Date.now();
    save(true);
  }

  /* ---------------- 渲染：计时器 ---------------- */
  function paintTime() {
    const sec = Math.round(elapsedSec());
    el.ringTime.textContent = fmtClockSec(sec);

    // 进度环：一分钟扫一圈；整分钟时闪一下，表示又过了一分钟
    const frac = (sec % 60) / 60;
    const circ = 2 * Math.PI * 138;
    el.ringProgress.style.strokeDashoffset = String(circ * (1 - frac));
    const minute = Math.floor(sec / 60);
    if (state.running && minute !== state.minuteSweep) {
      if (state.minuteSweep !== 0) flashRing();
      state.minuteSweep = minute;
    }
    if (sec !== state.lastPaintSec) {
      state.lastPaintSec = sec;
      updateTitle(sec);
      // 盘中信息每秒更新（“科目 · 备注”）
      if (state.running) el.ringSub.innerHTML = buildSub();
      paintHeadStat();
    }
  }

  function buildSub() {
    const name = esc(subjectName(state.sessionSubject || data.settings.selected));
    const note = (state.running ? el.noteInput.value.trim() : state.sessionNote);
    return `${name}${note ? ' · ' + esc(note.slice(0, 20)) : ''}`;
  }

  function paintHeadStat() {
    const sec = Math.round(elapsedSec());
    el.headState.textContent = state.running ? '计时中' : (sec > 0 ? '已暂停' : '待开始');
  }

  function updateTitle(sec) {
    const base = '学习时长记录';
    if (state.running) document.title = `${fmtClockSec(sec)} · ${subjectName(state.sessionSubject || data.settings.selected)}`;
    else document.title = base;
  }

  function paintAll() {
    paintTime();
    paintControls();
    paintRingColor();
    paintFocus();
    paintToday();
  }

  function paintControls() {
    const sec = Math.round(elapsedSec());
    const running = state.running;    el.timerCard.classList.toggle('is-running', running);
    el.timerCard.classList.toggle('is-paused', !running && sec > 0);
    el.ringWrap.classList.toggle('running', running);

    if (running) {
      el.startLabel.textContent = '暂停';
      el.startIcon.innerHTML = '<path d="M8 5h3v14H8zM13 5h3v14h-3z"/>';
      el.ringPhase.textContent = '计时中';
    } else if (sec > 0) {
      el.startLabel.textContent = '继续';
      el.startIcon.innerHTML = '<path d="M8 5.5v13l11-6.5z"/>';
      el.ringPhase.textContent = '已暂停';
    } else {
      el.startLabel.textContent = '开始计时';
      el.startIcon.innerHTML = '<path d="M8 5.5v13l11-6.5z"/>';
      el.ringPhase.textContent = '本段计时';
    }

    el.ringSub.innerHTML = sec > 0 ? buildSub() : '选好科目，按下开始';
    el.liveDot.classList.toggle('on', running);
    paintHeadStat();

    const locked = running || sec > 0;
    el.lockHint.hidden = !locked;
    el.lockHint.textContent = running ? '计时中不可切换' : '已暂停，可继续计时';
    $$('.pill', el.subjectPills).forEach(p => { p.disabled = locked; });
    el.btnFinish.disabled = sec <= 0 && !running;

    el.ringWrap.classList.toggle('has-time', sec > 0);
  }

  function paintRingColor() {
    const color = subjectColor(state.sessionSubject || data.settings.selected);
    el.ringGradA.setAttribute('stop-color', color);
    el.ringGradB.setAttribute('stop-color', shade(color, 28));
    el.timerCard.style.setProperty('--subject-color', color);
  }

  function flashRing() {
    el.ringWrap.classList.remove('flash');
    void el.ringWrap.offsetWidth;
    el.ringWrap.classList.add('flash');
    setTimeout(() => el.ringWrap.classList.remove('flash'), 1200);
  }

  function paintMotto() {
    const text = String(data.settings.motto || '').trim();
    if (el.mottoText) el.mottoText.textContent = text;
    if (el.motto) el.motto.hidden = !text;
  }

  function paintFocus() {
    $$('.pill', el.subjectPills).forEach(p => {
      const on = p.dataset.id === data.settings.selected;
      p.setAttribute('aria-pressed', on ? 'true' : 'false');
      p.style.setProperty('--c', subjectColor(p.dataset.id));
    });
  }

  function renderPills() {
    if (!data.subjects.length) {
      el.subjectPills.innerHTML = '<p class="muted small">还没有科目，去「设置」里添加一个。</p>';
      return;
    }
    el.subjectPills.innerHTML = data.subjects.map(s => `
      <button class="pill" type="button" data-id="${esc(s.id)}" aria-pressed="false" style="--c:${esc(s.color)}">
        <span class="dot"></span>${esc(s.name)}
      </button>`).join('');
    paintFocus();
    paintControls();
  }

  /** 顶栏的「今日」与卡片的「今天记录」 */
  function paintToday() {
    const start = dayStart(Date.now());
    const today = sessionsBetween(start, start + 86400000);
    el.headToday.textContent = fmtHM(sumSec(today));
  }

  function renderFlow() {
    const start = dayStart(Date.now());
    const today = sessionsBetween(start, start + 86400000)
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 4);
    if (!today.length) {
      el.flowList.innerHTML = `<li class="flow-empty">今天还没有记录。计时 10 秒以上，点「结束并记录」就会出现在这里。</li>`;
      return;
    }
    el.flowList.innerHTML = today.map(s => `
      <li class="flow-item" data-id="${esc(s.id)}">
        <span class="sw" style="background:${esc(subjectColor(s.subjectId))}"></span>
        <div class="flow-main">
          <div class="flow-r1">
            <b>${esc(subjectName(s.subjectId))}</b>
            <span class="flow-time">${fmtRange(s)}</span>
          </div>
          ${s.note ? `<div class="flow-note">${esc(s.note)}</div>` : ''}
        </div>
        <span class="flow-dur">${fmtHM(s.dur)}</span>
        <button class="session-del" type="button" title="删除这条记录" data-del="${esc(s.id)}">✕</button>
      </li>`).join('');
    $$('[data-del]', el.flowList).forEach(btn => {
      btn.addEventListener('click', () => {
        const item = data.sessions.find(s => s.id === btn.dataset.del);
        const label = item ? `${subjectName(item.subjectId)} ${fmtHM(item.dur)}` : '这条记录';
        if (!window.confirm(`删除 ${label}？删除后无法恢复。`)) return;
        data.sessions = data.sessions.filter(s => s.id !== btn.dataset.del);
        data.deletedSessions = [...(data.deletedSessions || []), btn.dataset.del].slice(-2000);
        data.updatedAt = Date.now();
        save(true);
        renderFlow();
        renderStats();
        renderChart();
        renderWeekBars();
        paintToday();
        if (!el.historySheet.hidden) renderHistory();
        toast('已删除这条记录');
      });
    });
  }

  /* ---------------- 渲染：统计 ---------------- */
  function sessionsBetween(from, to) {
    return data.sessions.filter(s => s.ts >= from && s.ts < to);
  }
  const sumSec = list => list.reduce((a, s) => a + s.dur, 0);

  function renderStats() {
    const start = dayStart(Date.now());
    const today = sessionsBetween(start, start + 86400000);
    const sec = sumSec(today);
    const mins = sec / 60;
    const longest = today.reduce((a, s) => Math.max(a, s.dur), 0);

    el.statFocus.innerHTML = `${Math.floor(mins)}<small>分钟</small>`;
    el.statLongest.innerHTML = `${Math.floor(longest / 60)}<small>分钟</small>`;
    el.statSessions.innerHTML = `${today.length}<small>条</small>`;

    const goal = data.settings.dailyGoal;
    const pct = goal > 0 ? clamp(mins / goal * 100, 0, 100) : 0;
    el.goalFill.style.width = pct.toFixed(1) + '%';
    el.goalText.textContent = `${Math.floor(mins)} / ${goal} 分钟`;
    if (goal <= 0) el.goalSub.textContent = '未设置目标，可在「设置」中填写';
    else if (mins >= goal) el.goalSub.textContent = `已达成今日目标，超出 ${fmtHM((mins - goal) * 60)} 🎉`;
    else el.goalSub.textContent = `还差 ${fmtHM((goal - mins) * 60)}，继续加油`;
    paintToday();
  }

  /* ---------------- 渲染：饼图 ---------------- */
  function rangeData(range) {
    const now = Date.now();
    let from, to, label;
    if (range === 'month') {
      from = dayStart(addDays(now, -29));
      to = dayStart(addDays(now, 1));
      label = '最近 30 天各科目投入占比';
    } else if (range === 'week') {
      from = dayStart(addDays(now, -6));
      to = dayStart(addDays(now, 1));
      label = '最近 7 天各科目投入占比';
    } else if (range === 'custom') {
      const fromK = data.settings.customFrom || dayKey(addDays(now, -6));
      const toK = data.settings.customTo || dayKey(now);
      let a = parseKey(fromK);
      let b = parseKey(toK);
      if (a.getTime() > b.getTime()) { const t = a; a = b; b = t; }
      from = a.getTime();
      to = dayStart(addDays(b, 1));
      const sameDay = a.getTime() === b.getTime();
      label = sameDay
        ? `${a.getMonth() + 1} 月 ${a.getDate()} 日 各科目投入占比`
        : `${a.getMonth() + 1} 月 ${a.getDate()} 日 – ${b.getMonth() + 1} 月 ${b.getDate()} 日 各科目投入占比`;
    } else {
      from = dayStart(now);
      to = from + 86400000;
      label = '今天各科目投入占比';
    }
    return { list: sessionsBetween(from, to), label };
  }

  function paintRange() {
    const custom = data.settings.range === 'custom';
    el.rangeCustom.hidden = !custom;
    if (!custom) return;
    if (!data.settings.customFrom || !data.settings.customTo) {
      data.settings.customFrom = data.settings.customFrom || dayKey(addDays(Date.now(), -6));
      data.settings.customTo = data.settings.customTo || dayKey(Date.now());
      save();
    }
    const fromK = data.settings.customFrom;
    const toK = data.settings.customTo;
    el.rangeFrom.value = fromK;
    el.rangeTo.value = toK;
    const days = Math.round((parseKey(toK).getTime() - parseKey(fromK).getTime()) / 86400000) + 1;
    el.rangeHint.textContent = `共 ${Math.max(1, days)} 天`;
  }

  /** 自选日期：起止颠倒时自动交换，改完立即重算饼图 */
  function applyCustomRange() {
    let from = el.rangeFrom.value;
    let to = el.rangeTo.value;
    if (!from || !to) return;
    if (from > to) { const t = from; from = to; to = t; }
    data.settings.customFrom = from;
    data.settings.customTo = to;
    data.settings.range = 'custom';
    save();
    el.rangeFrom.value = from;
    el.rangeTo.value = to;
    $$('.seg', el.rangeTabs).forEach(b => b.setAttribute('aria-selected', b.dataset.range === 'custom' ? 'true' : 'false'));
    paintRange();
    renderChart();
  }

  const RING_R = 78;
  const RING_C = 2 * Math.PI * RING_R;

  function polar(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arcPath(cx, cy, r, a0, a1) {
    const s = polar(cx, cy, r, a0);
    const e = polar(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  function renderChart() {
    const { list, label } = rangeData(data.settings.range);
    el.chartCaption.textContent = label;
    const total = sumSec(list);

    const map = new Map();
    data.subjects.forEach(s => map.set(s.id, { id: s.id, name: s.name, color: s.color, sec: 0 }));
    list.forEach(s => {
      if (!map.has(s.subjectId)) map.set(s.subjectId, { id: s.subjectId, name: subjectName(s.subjectId), color: subjectColor(s.subjectId), sec: 0 });
      map.get(s.subjectId).sec += s.dur;
    });
    const rows = Array.from(map.values()).filter(v => v.sec > 0).sort((a, b) => b.sec - a.sec);

    const W = 380, H = 320, cx = 190, cy = 158, R = 104;
    let svg = '';
    let hoverTitle = '';

    if (!rows.length) {
      svg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--surface-3)"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" fill="var(--muted)">这段时间还没有记录</text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="12" fill="var(--muted)">开始计时后这里会显示占比</text>`;
      el.pieTotal.textContent = '总计 0 分钟';
    } else {
      let acc = 0;
      rows.forEach((row, i) => {
        const span = row.sec / total * 360;
        const a0 = acc;
        const a1 = acc + span;
        acc = a1;
        if (span <= 0) return;
        // 只有一个科目时整圆，用 path 画会退化成一个点
        const full = span >= 359.9;
        let mid;
        if (full) {
          svg += `<circle class="pie-seg" data-id="${esc(row.id)}" cx="${cx}" cy="${cy}" r="${R}"
            fill="${esc(row.color)}" stroke="#fff" stroke-width="1.5"/>`;
          mid = 32;
        } else {
          const s = polar(cx, cy, R, a0);
          const e = polar(cx, cy, R, a1);
          const large = span > 180 ? 1 : 0;
          svg += `<path class="pie-seg" data-id="${esc(row.id)}" d="M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z"
            fill="${esc(row.color)}" stroke="#fff" stroke-width="1.5"/>`;
          mid = a0 + span / 2;
        }
        const p1 = polar(cx, cy, R + 4, mid);
        const p2 = polar(cx, cy, R + 16, mid);
        const p3 = polar(cx, cy, R + 30, mid);
        const right = Math.cos((mid - 90) * Math.PI / 180) >= 0;
        const anchor = right ? 'start' : 'end';
        const dx = right ? 6 : -6;
        if (span >= 8) {
          svg += `<polyline points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}"
            fill="none" stroke="${esc(row.color)}" stroke-width="1.4" stroke-linecap="round"/>`;
          svg += `<text x="${(p3.x + dx).toFixed(1)}" y="${(p3.y - 3).toFixed(1)}" text-anchor="${anchor}" font-size="12.5" font-weight="600" fill="var(--ink-2)">${esc(row.name)}</text>`;
          svg += `<text x="${(p3.x + dx).toFixed(1)}" y="${(p3.y + 13).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="var(--muted)">${fmtHM(row.sec)}</text>`;
        }
      });
      el.pieTotal.textContent = `总计 ${fmtHM(total)}`;
    }

    el.donut.innerHTML = svg;
    el.donut.setAttribute('aria-label', rows.length
      ? `总专注 ${fmtHM(total)}：` + rows.map(rr => `${rr.name} ${fmtHM(rr.sec)}`).join('，')
      : '这段时间还没有学习记录');

    el.donut.classList.remove('hovering');
    $$('.pie-seg', el.donut).forEach(seg => {
      seg.addEventListener('mouseenter', () => {
        el.donut.classList.add('hovering');
        $$('.pie-seg', el.donut).forEach(s => s.classList.toggle('on', s === seg));
      });
      seg.addEventListener('mouseleave', () => {
        el.donut.classList.remove('hovering');
        $$('.pie-seg', el.donut).forEach(s => s.classList.remove('on'));
      });
    });

    if (!rows.length) {
      el.legend.innerHTML = "";
    } else {
      el.legend.innerHTML = rows.map(row => `
        <li>
          <span class="sw" style="background:${esc(row.color)}"></span>
          <span class="name">${esc(row.name)}</span>
          <span class="lg-time">${fmtHM(row.sec)}</span>
          <span class="lg-pct">${((row.sec / total) * 100).toFixed(1)}%</span>
        </li>`).join('');
    }
  }

  function shade(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = clamp(((n >> 16) & 255) + amount, 0, 255);
    const g = clamp(((n >> 8) & 255) + amount, 0, 255);
    const b = clamp((n & 255) + amount, 0, 255);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ---------------- 渲染：近 7 天柱状 ---------------- */
  function renderWeekBars() {
    const today = dayStart(Date.now());
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    const dayTotals = days.map(d => {
      const list = sessionsBetween(d.getTime(), d.getTime() + 86400000);
      const bySub = new Map();
      list.forEach(s => bySub.set(s.subjectId, (bySub.get(s.subjectId) || 0) + s.dur));
      return { date: d, sec: sumSec(list), bySub };
    });
    const max = Math.max(60 * 60, ...dayTotals.map(d => d.sec));
    const sum = dayTotals.reduce((a, d) => a + d.sec, 0);
    el.weekAvg.textContent = `日均 ${fmtShort(sum / 7)}`;

    el.weekBars.innerHTML = dayTotals.map((d, i) => {
      const isToday = i === dayTotals.length - 1;
      const parts = Array.from(d.bySub.entries()).map(([sid, sec]) =>
        `<i style="--c:${esc(subjectColor(sid))};height:${(sec / max * 100).toFixed(2)}%" title="${esc(subjectName(sid))} ${fmtHM(sec)}"></i>`
      ).join('');
      const weekLabel = isToday ? '今天' : '周' + WEEK_CN[d.date.getDay()];
      return `<div class="bar-col${isToday ? ' today' : ''}" title="${d.date.getMonth() + 1}/${d.date.getDate()} 共 ${fmtHM(d.sec)}">
        <span class="bar-total">${d.sec >= 60 ? Math.round(d.sec / 60) : ''}</span>
        <div class="bar-stack">${parts}</div>
        <span class="bar-day">${weekLabel}</span>
      </div>`;
    }).join('');
  }

  /* ---------------- 渲染：历史 ---------------- */
  let histMonth = new Date();
  let histSelected = null;

  function openHistory() {
    histMonth = new Date();
    histSelected = null;
    el.historySheet.hidden = false;
    renderHistory();
    document.body.style.overflow = 'hidden';
  }

  function renderHistory() {
    const now = new Date();
    const monthStart = new Date(histMonth.getFullYear(), histMonth.getMonth(), 1);
    const nextMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() + 1, 1);
    const monthSessions = sessionsBetween(monthStart.getTime(), nextMonth.getTime());
    const monthSec = sumSec(monthSessions);
    const activeDays = new Set(monthSessions.map(s => dayKey(s.ts))).size;

    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() + 1, 0).getDate();
    const byDay = new Map();
    monthSessions.forEach(s => {
      const k = dayKey(s.ts);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(s);
    });

    let cells = '';
    for (let i = 0; i < firstWeekday; i++) cells += '<span class="cal-cell empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(histMonth.getFullYear(), histMonth.getMonth(), d);
      const k = dayKey(dt.getTime());
      const list = byDay.get(k) || [];
      const sec = sumSec(list);
      const isToday = sameDay(dt, now);
      const isSel = histSelected === k;
      const intensity = sec > 0 ? Math.min(1, 0.3 + (sec / (4 * 3600)) * 0.7) : 0;
      cells += `<button type="button" class="cal-cell${sec > 0 ? ' has' : ''}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}"
        data-key="${k}" style="--i:${intensity.toFixed(2)}">
        <span class="d">${d}</span>
        <span class="m">${sec > 0 ? Math.round(sec / 60) + 'm' : ''}</span>
      </button>`;
    }

    if (!histSelected) {
      const todayKey = dayKey(now.getTime());
      const monthKeys = Array.from(byDay.keys()).sort();
      if (byDay.has(todayKey)) histSelected = todayKey;
      else if (monthKeys.length) histSelected = monthKeys[monthKeys.length - 1];
      else histSelected = todayKey;
    }

    const selKey = histSelected;
    const selDate = parseKey(selKey);
    const selList = (byDay.get(selKey) || []).slice().sort((a, b) => b.ts - a.ts);
    let detail;
    if (!selList.length) {
      detail = `<div class="empty-state">${fmtDateCN(selDate)} 没有学习记录。</div>`;
    } else {
      detail = `<div class="session-list">${selList.map(s => `
        <div class="session-row" data-sid="${esc(s.id)}">
          <span class="sw" style="background:${esc(subjectColor(s.subjectId))}"></span>
          <div class="session-main">
            <div class="r1"><b>${esc(subjectName(s.subjectId))}</b>
              <span class="tm">${fmtRange(s)}</span></div>
            ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
          </div>
          <span class="session-dur">${fmtHM(s.dur)}</span>
          <button class="session-del" type="button" title="删除这条记录" data-del="${esc(s.id)}">✕</button>
        </div>`).join('')}</div>`;
    }

    el.historyBody.innerHTML = `
      <div class="hist-summary">
        <div><strong>${fmtHM(monthSec)}</strong><span>${histMonth.getMonth() + 1} 月累计专注</span></div>
        <div><strong>${activeDays} 天</strong><span>本月学习天数</span></div>
      </div>
      <div class="cal-head-row">
        <button class="cal-nav" type="button" id="calPrev" aria-label="上个月">‹</button>
        <span class="cal-title">${histMonth.getFullYear()} 年 ${histMonth.getMonth() + 1} 月</span>
        <button class="cal-nav" type="button" id="calNext" aria-label="下个月">›</button>
      </div>
      <div class="cal">
        ${['一', '二', '三', '四', '五', '六', '日'].map(w => `<span class="cal-head">${w}</span>`).join('')}
        ${cells}
      </div>
      <div class="day-title">
        <strong>${fmtDateCN(selDate)}</strong>
        <span>${selList.length ? `共 ${fmtHM(sumSec(selList))}` : '无记录'}</span>
      </div>
      ${detail}
    `;

    $('#calPrev').addEventListener('click', () => {
      histMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() - 1, 1);
      histSelected = null;
      renderHistory();
    });
    $('#calNext').addEventListener('click', () => {
      histMonth = new Date(histMonth.getFullYear(), histMonth.getMonth() + 1, 1);
      histSelected = null;
      renderHistory();
    });
    $$('.cal-cell[data-key]', el.historyBody).forEach(cell => {
      cell.addEventListener('click', () => {
        histSelected = cell.dataset.key;
        renderHistory();
      });
    });
    $$('[data-del]', el.historyBody).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.del;
        const item = data.sessions.find(s => s.id === id);
        const label = item ? `${subjectName(item.subjectId)} ${fmtHM(item.dur)}` : '这条记录';
        if (!window.confirm(`删除 ${label}？删除后无法恢复。`)) return;
        data.sessions = data.sessions.filter(s => s.id !== id);
        data.deletedSessions = [...(data.deletedSessions || []), id].slice(-2000);
        data.updatedAt = Date.now();
        save(true);
        renderHistory();
        renderStats();
        renderChart();
        renderWeekBars();
        renderFlow();
        toast('已删除这条记录');
      });
    });
  }

  function fmtDateCN(d) {
    const today = new Date();
    const diff = Math.round((dayStart(d) - dayStart(today)) / 86400000);
    if (diff === 0) return '今天';
    if (diff === -1) return '昨天';
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 周${WEEK_CN[d.getDay()]}`;
  }

  /* ---------------- 设置 ---------------- */
  let draftColor = PALETTE[0];

  function openSettings() {
    $('#setGoal').value = data.settings.dailyGoal;
    $('#setSound').checked = !!data.settings.sound;
    $('#setMotto').value = data.settings.motto || '';
    el.newSubjectName.value = '';
    draftColor = PALETTE[data.subjects.length % PALETTE.length];
    renderSwatches();
    renderSubjectManage();
    paintSync();
    el.settingsSheet.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function renderSwatches() {
    el.swatches.innerHTML = PALETTE.map(c => `
      <button class="swatch" type="button" data-color="${c}" aria-pressed="${c === draftColor}" style="background:${c}" title="${c}"></button>`).join('');
    $$('.swatch', el.swatches).forEach(b => b.addEventListener('click', () => {
      draftColor = b.dataset.color;
      renderSwatches();
    }));
  }

  function renderSubjectManage() {
    el.subjectManage.innerHTML = data.subjects.map(s => `
      <li data-id="${esc(s.id)}">
        <span class="sw" style="background:${esc(s.color)}"></span>
        <input type="text" value="${esc(s.name)}" maxlength="12" aria-label="科目名称">
        <button class="del" type="button" title="删除科目">删除</button>
      </li>`).join('');
    $$('li', el.subjectManage).forEach(li => {
      const id = li.dataset.id;
      const input = $('input', li);
      input.addEventListener('change', () => {
        const name = input.value.trim();
        if (!name) { input.value = subjectName(id); return; }
        const sub = subjectById(id);
        if (sub) {
          sub.name = name.slice(0, 12);
          data.updatedAt = Date.now();
          save();
          renderPills();
          renderChart();
          renderWeekBars();
          renderStats();
          renderFlow();
          paintAll();
          if (!el.historySheet.hidden) renderHistory();
        }
      });
      $('.del', li).addEventListener('click', () => {
        if (data.subjects.length <= 1) { toast('至少保留一个科目'); return; }
        if (!window.confirm(`删除科目「${subjectName(id)}」？已有记录会保留但不再按科目显示。`)) return;
        data.subjects = data.subjects.filter(s => s.id !== id);
        data.deletedSubjects = [...(data.deletedSubjects || []), id];
        data.updatedAt = Date.now();
        if (data.settings.selected === id) data.settings.selected = data.subjects[0].id;
        save(true);
        renderSubjectManage();
        renderPills();
        paintAll();
        renderChart();
        renderWeekBars();
        renderStats();
        renderFlow();
        if (!el.historySheet.hidden) renderHistory();
      });
    });
  }

  function applySettings() {
    data.settings.dailyGoal = clamp(Number($('#setGoal').value) || 0, 0, 1440);
    data.settings.sound = $('#setSound').checked;
    data.settings.motto = String($('#setMotto').value || '').trim().slice(0, 40);
    data.settingsAt = Date.now();
    save(true);
    paintMotto();
    renderStats();
    paintAll();
  }

  /* ---------------- 声音 / 提示 ---------------- */
  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* 不支持音频就静默 */ }
  }
  function playChime() {
    if (!data.settings.sound) return;
    try {
      unlockAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [880, 1174.7].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.28);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.14);
        osc.stop(now + i * 0.14 + 0.32);
      });
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(theme) {
    data.settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#16130f' : '#f5f1e9');
    save();
  }

  /* ---------------- 导出 ---------------- */
  function exportCSV() {
    const list = data.sessions.slice().sort((a, b) => a.ts - b.ts);
    if (!list.length) { toast('还没有记录可以导出'); return; }
    const rows = [['日期', '开始', '结束', '科目', '时长(分钟)', '时长(秒)', '备注']];
    list.forEach(s => {
      rows.push([dayKey(s.ts), fmtClock(s.beganAt || s.ts - s.dur * 1000), fmtClock(s.ts), subjectName(s.subjectId), (s.dur / 60).toFixed(1), s.dur, s.note || '']);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(v => {
      const str = String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `学习记录_${dayKey(Date.now())}.csv`);
    toast(`已导出 ${list.length} 条记录`);
  }

  /** 把当前饼图 + 图例 + 标题画成一张 PNG */
  function exportChartPng() {
    const { list, label } = rangeData(data.settings.range);
    if (!list.length) { toast('图表还是空的，先记录一点时间吧'); return; }
    const total = sumSec(list);
    const map = new Map();
    data.subjects.forEach(s => map.set(s.id, { id: s.id, name: s.name, color: s.color, sec: 0 }));
    list.forEach(s => {
      if (!map.has(s.subjectId)) map.set(s.subjectId, { id: s.subjectId, name: subjectName(s.subjectId), color: subjectColor(s.subjectId), sec: 0 });
      map.get(s.subjectId).sec += s.dur;
    });
    const rows = Array.from(map.values()).filter(v => v.sec > 0).sort((a, b) => b.sec - a.sec);
    if (!rows.length) { toast('图表还是空的，先记录一点时间吧'); return; }

    const dark = document.documentElement.dataset.theme === 'dark';
    const ink = dark ? '#f2f2ef' : '#1f1f1d';
    const muted = dark ? '#9a9a92' : '#91918a';
    const bg = dark ? '#1b1b19' : '#ffffff';
    const line = dark ? '#33332e' : '#e9e8e4';
    const W = 760, H = 520, CX = 240, CY = 248, R = 150;
    const fonts = `font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"`;

    let arcs = '';
    let acc = 0;
    rows.forEach(row => {
      const span = row.sec / total * 360;
      const a0 = acc;
      const a1 = acc + span;
      acc = a1;
      if (span <= 0) return;
      const s = polar(CX, CY, R, a0);
      const e = polar(CX, CY, R, a1);
      const large = span > 180 ? 1 : 0;
      arcs += `<path d="M ${CX} ${CY} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z" fill="${row.color}" stroke="${bg}" stroke-width="2"/>`;
      const mid = a0 + span / 2;
      if (span >= 8) {
        const p1 = polar(CX, CY, R + 6, mid);
        const p2 = polar(CX, CY, R + 22, mid);
        const p3 = polar(CX, CY, R + 42, mid);
        const right = Math.cos((mid - 90) * Math.PI / 180) >= 0;
        const anchor = right ? 'start' : 'end';
        const dx = right ? 8 : -8;
        arcs += `<polyline points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}" fill="none" stroke="${row.color}" stroke-width="1.6" stroke-linecap="round"/>`;
        arcs += `<text x="${(p3.x + dx).toFixed(1)}" y="${(p3.y - 2).toFixed(1)}" text-anchor="${anchor}" font-size="15" font-weight="600" fill="${ink}" ${fonts}>${esc(row.name)}</text>`;
        arcs += `<text x="${(p3.x + dx).toFixed(1)}" y="${(p3.y + 18).toFixed(1)}" text-anchor="${anchor}" font-size="12.5" fill="${muted}" ${fonts}>${fmtHM(row.sec)}</text>`;
      }
    });

    let legend = '';
    rows.forEach((row, i) => {
      const y = 176 + i * 62;
      legend += `
        <rect x="470" y="${y - 11}" width="11" height="11" rx="3" fill="${row.color}"/>
        <text x="490" y="${y}" font-size="15" fill="${ink}" ${fonts}>${esc(row.name)}</text>
        <text x="700" y="${y}" text-anchor="end" font-size="14" font-weight="700" fill="${ink}" ${fonts}>${((row.sec / total) * 100).toFixed(1)}%</text>
        <text x="490" y="${y + 19}" font-size="12" fill="${muted}" ${fonts}>${fmtHM(row.sec)}</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="${bg}"/>
      <text x="36" y="46" font-size="19" font-weight="700" fill="${ink}" ${fonts}>时间分布</text>
      <text x="36" y="70" font-size="12.5" fill="${muted}" ${fonts}>${esc(label)}</text>
      <line x1="36" y1="88" x2="${W - 36}" y2="88" stroke="${line}"/>
      ${arcs}
      <text x="${CX}" y="${CY + R + 42}" text-anchor="middle" font-size="16" font-weight="600" fill="${ink}" ${fonts}>总计 ${fmtHM(total)}</text>
      ${legend}
      <text x="36" y="${H - 24}" font-size="11" fill="${muted}" ${fonts}>学习时长记录 · ${dayKey(Date.now())}</text>
    </svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        if (b) download(b, `学习时间分布_${dayKey(Date.now())}.png`);
        toast('饼图已保存');
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('保存图片失败了，可以直接截图'); };
    img.src = url;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- 整页截屏 ----------------
     思路：把整页内容装进 SVG 的 <foreignObject> 里，让浏览器自己重新排版渲染，
     再画到 canvas 上导出 PNG。纯前端，不依赖任何外部库，也不需要系统截图权限。
     ---------------------------------------------------------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';
  const SHOT_EXTRA_CSS = `
html, body { margin: 0 !important; padding: 0 !important; background: none !important; }
.shot-root *, .shot-root *::before, .shot-root *::after {
  animation: none !important;
  transition: none !important;
}
.shot-root .topbar { position: static !important; }
.shot-root .icon-btn, .shot-root .btn { cursor: default; }
`;

  function shotStylesheet() {
    const jobs = [];
    $$('link[rel="stylesheet"]').forEach(link => {
      jobs.push(fetch(link.href).then(r => (r.ok ? r.text() : '')).catch(() => ''));
    });
    $$('style').forEach(node => jobs.push(Promise.resolve(node.textContent || '')));
    return Promise.all(jobs).then(list => list.filter(css => css && css.trim()).join('\n'));
  }

  function shotBuild(css) {
    const W = Math.max(320, document.documentElement.clientWidth);
    const H = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 480);
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const bodyStyle = getComputedStyle(document.body);
    const glowStyle = getComputedStyle(document.body, '::before');

    const clone = document.body.cloneNode(true);
    $$('.sheet, .toast, script, noscript', clone).forEach(node => node.remove());
    $$('input', clone).forEach(input => {
      if (input.type === 'checkbox' || input.type === 'radio') {
        if (input.checked) input.setAttribute('checked', 'checked');
        else input.removeAttribute('checked');
        return;
      }
      if (input.value) input.setAttribute('value', input.value);
      else input.removeAttribute('value');
    });

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', String(W));
    fo.setAttribute('height', String(H));

    const root = document.createElementNS(XHTML_NS, 'div');
    root.setAttribute('class', 'shot-root');
    root.setAttribute('data-theme', theme);
    root.setAttribute('style', [
      'position:relative', 'margin:0', 'padding:0', 'overflow:hidden',
      `width:${W}px`, `min-height:${H}px`,
      `color:${bodyStyle.color}`,
      `font-family:${bodyStyle.fontFamily}`,
      `font-size:${bodyStyle.fontSize}`,
      `line-height:${bodyStyle.lineHeight}`,
      `background-color:${bodyStyle.backgroundColor}`,
      `background-image:${bodyStyle.backgroundImage}`,
      `background-size:${bodyStyle.backgroundSize}`,
      `background-position:${bodyStyle.backgroundPosition}`
    ].join(';'));

    const styleNode = document.createElementNS(XHTML_NS, 'style');
    styleNode.textContent = css + '\n' + SHOT_EXTRA_CSS;
    root.appendChild(styleNode);

    // 页面背景那层柔光（body::before 的替身）
    const glow = document.createElementNS(XHTML_NS, 'div');
    glow.setAttribute('style', [
      'position:absolute', 'inset:-10%', 'z-index:0', 'pointer-events:none',
      `background-image:${glowStyle.backgroundImage || 'none'}`,
      `filter:${glowStyle.filter || 'none'}`,
      `opacity:${glowStyle.opacity || '1'}`
    ].join(';'));
    root.appendChild(glow);

    const content = document.createElementNS(XHTML_NS, 'div');
    content.setAttribute('style', 'position:relative;z-index:1');
    while (clone.firstChild) content.appendChild(clone.firstChild);
    root.appendChild(content);

    fo.appendChild(root);
    svg.appendChild(fo);
    return { svg, W, H };
  }

  function shotLoadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('svg-render-failed'));
      img.src = src;
    });
  }

  /** 有些浏览器（老 Safari / Firefox）不允许在 <img> 里渲染 foreignObject，会得到一张空白图 */
  function shotLooksEmpty(img) {
    try {
      const probe = document.createElement('canvas');
      probe.width = 48;
      probe.height = 48;
      const ctx = probe.getContext('2d');
      ctx.drawImage(img, 0, 0, 48, 48);
      const px = ctx.getImageData(0, 0, 48, 48).data;
      const seen = new Set();
      for (let i = 0; i < px.length; i += 4) seen.add(`${px[i]},${px[i + 1]},${px[i + 2]},${px[i + 3]}`);
      return seen.size <= 2;
    } catch (err) {
      return true;
    }
  }

  async function shotCanvas() {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (err) { /* 字体加载失败也不影响 */ }

    const css = await shotStylesheet();
    if (!css.trim()) throw new Error('stylesheet-missing');

    const { svg, W, H } = shotBuild(css);
    const markup = new XMLSerializer().serializeToString(svg);
    const img = await shotLoadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup));
    if (shotLooksEmpty(img)) throw new Error('empty-render');

    let scale = 2;
    while (scale > 1 && (W * scale > 4000 || H * scale > 16000 || W * scale * H * scale > 18e6)) scale -= 0.25;
    const cw = Math.max(1, Math.round(W * scale));
    const ch = Math.max(1, Math.round(H * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return { canvas, W, H };
  }

  async function capturePage() {
    const btn = $('#btnShot');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    toast('正在把整页拼成图片…');
    try {
      const { canvas } = await shotCanvas();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('encode-failed');
      const now = new Date();
      download(blob, `学习计时_${dayKey(Date.now())}_${pad(now.getHours())}${pad(now.getMinutes())}.png`);
      toast('整页截图已保存到下载文件夹');
    } catch (err) {
      console.warn('截屏失败', err);
      toast('截屏没成功，先用系统截图吧（Win + Shift + S）');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- 跨设备同步（GitHub Gist） ----------------
     - token 只存在本机 localStorage，用来读写用户自己的私有 Gist
     - 合并策略：记录按 id 取并集，删除用「墓碑」id 记录，设置按时间戳取新
     ---------------------------------------------------------- */
  const SYNC_KEY = 'kaoyan-study-timer-sync-v1';
  const GIST_FILE = 'study-time.json';
  const GIST_DESC = '学习时长记录 · 同步数据';
  const GIST_API = 'https://api.github.com';

  function loadSyncCfg() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      const c = raw ? JSON.parse(raw) : {};
      return {
        token: typeof c.token === 'string' ? c.token : '',
        gistId: typeof c.gistId === 'string' ? c.gistId : '',
        lastSyncAt: Number(c.lastSyncAt) || 0
      };
    } catch (err) {
      return { token: '', gistId: '', lastSyncAt: 0 };
    }
  }
  let syncCfg = loadSyncCfg();
  let syncing = false;
  let syncTimer = 0;
  let syncError = '';

  function saveSyncCfg() {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify({
        token: syncCfg.token, gistId: syncCfg.gistId, lastSyncAt: syncCfg.lastSyncAt
      }));
    } catch (err) { /* 隐私模式下忽略 */ }
  }

  /** 只同步「共享型」设置；主题、当前科目、统计范围是每台设备自己的偏好 */
  function syncPayload(d = data) {
    const st = d.settings || {};
    return {
      version: 2,
      updatedAt: d.updatedAt || 0,
      settingsAt: d.settingsAt || 0,
      settings: { dailyGoal: st.dailyGoal, sound: st.sound, motto: st.motto },
      subjects: d.subjects || [],
      sessions: d.sessions || [],
      deletedSessions: d.deletedSessions || [],
      deletedSubjects: d.deletedSubjects || []
    };
  }

  async function gh(path, opts = {}) {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + syncCfg.token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(GIST_API + path, { method: opts.method || 'GET', headers, body: opts.body });
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
    if (syncCfg.gistId) {
      const g = await gh('/gists/' + syncCfg.gistId);
      if (g) return g;
      syncCfg.gistId = '';
      saveSyncCfg();
    }
    const list = await gh('/gists?per_page=100');
    const found = Array.isArray(list) ? list.find(g => g.files && (g.files[GIST_FILE] || g.files['todo.json'])) : null;
    if (found) {
      syncCfg.gistId = found.id;
      saveSyncCfg();
      return found;
    }
    const created = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: GIST_DESC,
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(syncPayload(), null, 1) } }
      })
    });
    syncCfg.gistId = created.id;
    saveSyncCfg();
    return created;
  }

  async function readGist(gist) {
    const f = gist && gist.files && gist.files[GIST_FILE];
    if (!f) return null;
    let content = f.content;
    if (f.truncated && f.raw_url) {
      try {
        const r = await fetch(f.raw_url, { headers: { Authorization: 'Bearer ' + syncCfg.token } });
        content = await r.text();
      } catch (err) { throw new Error('读取 Gist 内容失败'); }
    }
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  /** 把远端数据并进本地，返回是否有变化 */
  function mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return false;
    const before = JSON.stringify(syncPayload());
    const sessions = new Map();
    (Array.isArray(remote.sessions) ? remote.sessions : []).forEach(s => {
      if (s && s.id) sessions.set(String(s.id), s);
    });
    data.sessions.forEach(s => sessions.set(s.id, s));   // 同 id 以本地为准
    const delS = new Set([...(data.deletedSessions || []), ...(remote.deletedSessions || [])]);
    delS.forEach(id => sessions.delete(id));

    const subs = new Map();
    (Array.isArray(remote.subjects) ? remote.subjects : []).forEach(s => {
      if (s && s.id && s.name) subs.set(String(s.id), s);
    });
    data.subjects.forEach(s => subs.set(s.id, s));
    const delSub = new Set([...(data.deletedSubjects || []), ...(remote.deletedSubjects || [])]);
    delSub.forEach(id => subs.delete(id));

    const next = {
      ...data,
      updatedAt: Math.max(data.updatedAt || 0, remote.updatedAt || 0),
      settingsAt: Math.max(data.settingsAt || 0, remote.settingsAt || 0),
      deletedSessions: Array.from(delS).slice(-2000),
      deletedSubjects: Array.from(delSub),
      sessions: Array.from(sessions.values()).sort((a, b) => a.ts - b.ts),
      subjects: Array.from(subs.values())
    };
    const remoteSettings = remote.settings || {};
    if ((remote.settingsAt || 0) > (data.settingsAt || 0)) {
      next.settings = {
        ...next.settings,
        dailyGoal: Number.isFinite(Number(remoteSettings.dailyGoal)) ? Number(remoteSettings.dailyGoal) : next.settings.dailyGoal,
        sound: remoteSettings.sound !== false,
        motto: typeof remoteSettings.motto === 'string' ? remoteSettings.motto.slice(0, 40) : next.settings.motto,
        // 以下为设备本地偏好，保持本机
        theme: data.settings.theme,
        range: data.settings.range,
        selected: data.settings.selected,
        note: data.settings.note
      };
    }
    if (!next.subjects.some(s => s.id === next.settings.selected)) {
      next.settings.selected = next.subjects[0] ? next.subjects[0].id : '';
    }
    Object.assign(data, next);
    return before !== JSON.stringify(syncPayload());
  }

  function persistLocal() {
    if (demoMode) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      dirty = false;
    } catch (err) { /* ignore */ }
  }

  function refreshAfterSync() {
    renderPills();
    paintAll();
    renderStats();
    renderChart();
    renderWeekBars();
    renderFlow();
    if (!el.historySheet.hidden) renderHistory();
    paintSync();
  }

  async function syncNow(opts = {}) {
    if (demoMode) { if (!opts.silent) toast('预览模式不参与同步'); return false; }
    if (!syncCfg.token) { if (!opts.silent) toast('先连接 GitHub 账号'); return false; }
    if (syncing) return false;
    syncing = true;
    syncError = '';
    paintSync();
    try {
      const gist = await ensureGist();
      const remote = await readGist(gist);
      const changed = remote ? mergeRemote(remote) : false;
      if (changed) {
        persistLocal();
        refreshAfterSync();
      }
      const localJson = JSON.stringify(syncPayload(), null, 1);
      const remoteJson = remote ? JSON.stringify(syncPayload(remote), null, 1) : '';
      if (localJson !== remoteJson) {
        await gh('/gists/' + syncCfg.gistId, {
          method: 'PATCH',
          body: JSON.stringify({ files: { [GIST_FILE]: { content: localJson } } })
        });
      }
      syncCfg.lastSyncAt = Date.now();
      saveSyncCfg();
      if (!opts.silent) toast('已同步');
      return true;
    } catch (err) {
      syncError = String((err && err.message) || err);
      if (!opts.silent) toast('同步失败：' + syncError);
      return false;
    } finally {
      syncing = false;
      paintSync();
    }
  }

  function scheduleSync(delay = 4000) {
    if (!syncCfg.token || demoMode) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow({ silent: true }), delay);
  }

  /** 账号里可能有多个 Gist（不同设备各建了一个），全部合并回来 */
  async function recoverFromAllGists() {
    if (!syncCfg.token || syncing) return;
    syncing = true;
    syncError = '';
    paintSync();
    try {
      const list = await gh('/gists?per_page=100');
      const cands = (Array.isArray(list) ? list : []).filter(g => g.files && g.files[GIST_FILE]);
      let found = 0;
      for (const g of cands) {
        if (syncCfg.gistId && g.id === syncCfg.gistId) continue;
        const r = await readGist(g);
        if (r && Array.isArray(r.sessions) && r.sessions.length) {
          mergeRemote(r);
          found++;
        }
      }
      syncing = false;
      if (found) {
        await syncNow({ silent: true });
        toast(`已从其他 ${found} 个 Gist 合并记录`);
      } else {
        toast('没有找到其他带记录的 Gist');
      }
    } catch (err) {
      syncError = String((err && err.message) || err);
      toast('找回失败：' + syncError);
    } finally {
      syncing = false;
      paintSync();
    }
  }

  function paintSync() {
    const on = !!syncCfg.token;
    const stateEl = $('#syncState');
    const setup = $('#syncSetup');
    const live = $('#syncLive');
    if (setup) setup.hidden = on;
    if (live) live.hidden = !on;

    let label = '未开启';
    let cls = '';
    if (on) {
      if (syncing) { label = '同步中…'; cls = 'syncing'; }
      else if (syncError) { label = '同步失败'; cls = 'err'; }
      else { label = '已连接'; cls = 'on'; }
    }
    if (stateEl) {
      stateEl.textContent = label + (on && syncCfg.lastSyncAt && !syncing && !syncError ? ' · ' + fmtClock(syncCfg.lastSyncAt) : '');
      stateEl.className = 'sync-state ' + cls;
    }
    const foot = $('#btnSync');
    if (foot) {
      foot.textContent = '云同步：' + (on ? (syncing ? '同步中…' : (syncError ? '同步失败，点此查看' : '已开启')) : '未开启');
      foot.className = 'link-btn ' + cls;
    }
    const info = $('#syncInfo');
    if (info) {
      const gistTag = syncCfg.gistId ? ` · Gist ${syncCfg.gistId.slice(0, 10)}` : '';
      if (syncError) info.textContent = '上次同步失败：' + syncError;
      else if (syncCfg.lastSyncAt) info.textContent = `已连接 · 上次同步 ${fmtClock(syncCfg.lastSyncAt)}（${dayKey(syncCfg.lastSyncAt)}）${gistTag} · 本机记录 ${data.sessions.length} 条`;
      else info.textContent = '已连接，正在等待第一次同步';
    }
    const link = $('#syncGist');
    if (link) {
      if (syncCfg.gistId) { link.href = 'https://gist.github.com/' + syncCfg.gistId; link.hidden = false; }
      else link.hidden = true;
    }
    const tokenInput = $('#syncToken');
    if (tokenInput && !on) tokenInput.value = '';
  }

  async function connectSync() {
    const input = $('#syncToken');
    const token = (input ? input.value : '').trim();
    if (!token) { toast('先粘贴 GitHub token'); if (input) input.focus(); return; }
    if (!/^(ghp_|github_pat_)/.test(token)) {
      if (!window.confirm('这个 token 看起来不是 GitHub 的格式（通常以 ghp_ 开头），仍然尝试连接吗？')) return;
    }
    syncCfg.token = token;
    syncCfg.gistId = '';
    syncCfg.lastSyncAt = 0;
    saveSyncCfg();
    paintSync();
    const ok = await syncNow();
    if (ok) {
      if (input) input.value = '';
      toast('已连接，之后会自动同步');
    } else {
      // 保留 token，网络恢复后还能继续重试；按钮提示失败原因
      toast('连接失败：' + (syncError || '未知错误'));
    }
  }

  function disconnectSync() {
    if (!window.confirm('断开云同步？本机数据会保留，但不再与其他设备同步。')) return;
    clearTimeout(syncTimer);
    syncCfg = { token: '', gistId: '', lastSyncAt: 0 };
    saveSyncCfg();
    paintSync();
    toast('已断开云同步');
  }

  /* ---------------- 示例数据 ---------------- */
  function generateSampleSessions() {
    const notes = {
      math: ['高数 中值定理', '线代 特征值', '概率 大数定律', '真题 2019'],
      english: ['阅读 2 篇', '单词 100 个', '作文模板', '长难句'],
      politics: ['马原 辩证法', '毛中特', '史纲 时间线', '肖秀荣 1000 题'],
      major: ['408 数据结构', '408 组成原理', '专题整理', '真题复盘']
    };
    const now = Date.now();
    const out = [];
    for (let d = 6; d >= 0; d--) {
      const day = dayStart(addDays(now, -d));
      const count = d === 0 ? 2 : 2 + ((d * 7) % 3);
      for (let i = 0; i < count; i++) {
        const sub = data.subjects[(d + i) % data.subjects.length];
        if (!sub) continue;
        const hours = 9 + i * 2 + ((d * 3) % 2);
        const ts = day + hours * 3600000 + 12 * 60000;
        if (ts > now) continue;
        const dur = (25 + ((d * 13 + i * 7) % 2) * 25) * 60;
        const pool = notes[sub.id] || ['学习'];
        out.push({
          id: 'demo-' + d + '-' + i,
          ts,
          dur,
          beganAt: ts - dur * 1000,
          subjectId: sub.id,
          note: pool[(d + i) % pool.length],
          mode: 'focus'
        });
      }
    }
    return out;
  }

  function loadSample() {
    if (data.sessions.length && !window.confirm('将追加最近 7 天的示例记录，原来的记录会保留。继续？')) return;
    data.sessions = data.sessions.concat(generateSampleSessions());
    save(true);
    renderStats();
    renderChart();
    renderWeekBars();
    renderFlow();
    renderHistoryIfOpen();
    toast('已载入示例数据，看看图表效果');
  }

  function renderHistoryIfOpen() {
    if (!el.historySheet.hidden) renderHistory();
  }

  /** ?demo=1 预览模式：只展示示例数据，不写入本地存储 */
  function setupDemo() {
    data.sessions = generateSampleSessions();
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.innerHTML = `<span><b>预览模式</b>：正在展示示例数据，不会被保存。</span>
      <button type="button" id="exitDemo">开始记录我自己的</button>`;
    document.querySelector('.page').insertBefore(banner, document.querySelector('.layout'));
    $('#exitDemo').addEventListener('click', () => {
      demoMode = false;
      data.sessions = [];
      banner.remove();
      save(true);
      renderStats();
      renderChart();
      renderWeekBars();
      renderFlow();
      toast('已就绪，按下开始就能记录啦');
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    el.btnStart.addEventListener('click', toggle);
    el.btnFinish.addEventListener('click', finish);
    el.btnFlowHistory.addEventListener('click', openHistory);


    el.subjectPills.addEventListener('click', e => {
      const pill = e.target.closest('.pill');
      if (!pill || pill.disabled) return;
      data.settings.selected = pill.dataset.id;
      save();
      paintFocus();
      paintRingColor();
      paintAll();
    });

    el.rangeTabs.addEventListener('click', e => {
      const btn = e.target.closest('.seg');
      if (!btn) return;
      data.settings.range = btn.dataset.range;
      save();
      $$('.seg', el.rangeTabs).forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      paintRange();
      renderChart();
    });

    el.rangeFrom.addEventListener('change', applyCustomRange);
    el.rangeTo.addEventListener('change', applyCustomRange);

    el.noteInput.addEventListener('input', () => {
      state.sessionNote = el.noteInput.value.trim();
      if (state.running) el.ringSub.innerHTML = buildSub();
    });

    el.btnTheme.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    $('#btnHistory').addEventListener('click', openHistory);
    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnExport').addEventListener('click', exportCSV);
    $('#btnExportPng').addEventListener('click', exportChartPng);
    $('#btnShot').addEventListener('click', capturePage);

    $$('.sheet').forEach(sheet => {
      $$('[data-close]', sheet).forEach(b => b.addEventListener('click', closeSheets));
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSheets();
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === ' ' || e.code === 'Space') {
        if (el.historySheet.hidden && el.settingsSheet.hidden) { e.preventDefault(); toggle(); }
      }
    });

    $('#btnSample').addEventListener('click', loadSample);
    $('#btnClear').addEventListener('click', () => {
      if (!window.confirm('清空全部学习记录？科目与设置会保留，此操作不可撤销（同步后其他设备也会清空）。')) return;
      const ids = data.sessions.map(s => s.id);
      data.deletedSessions = [...(data.deletedSessions || []), ...ids].slice(-2000);
      data.sessions = [];
      data.updatedAt = Date.now();
      save(true);
      renderStats();
      renderChart();
      renderWeekBars();
      renderFlow();
      renderHistoryIfOpen();
      toast('记录已清空');
    });

    $('#btnSync').addEventListener('click', openSettings);
    $('#btnSyncConnect').addEventListener('click', connectSync);
    $('#btnSyncNow').addEventListener('click', () => syncNow());
    $('#btnSyncRecover').addEventListener('click', () => recoverFromAllGists());
    $('#btnSyncDisconnect').addEventListener('click', disconnectSync);

    $('#setGoal').addEventListener('change', applySettings);
    $('#setSound').addEventListener('change', applySettings);
    $('#setMotto').addEventListener('input', () => {
      // 边打边预览，不必等失焦
      data.settings.motto = String($('#setMotto').value || '').trim().slice(0, 40);
      data.settingsAt = Date.now();
      paintMotto();
      save();
    });

    $('#addSubjectForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = el.newSubjectName.value.trim();
      if (!name) { el.newSubjectName.focus(); return; }
      if (data.subjects.some(s => s.name === name)) { toast('已经有同名科目了'); return; }
      data.subjects.push({ id: 'sub-' + uid(), name: name.slice(0, 12), color: draftColor });
      data.updatedAt = Date.now();
      el.newSubjectName.value = '';
      draftColor = PALETTE[data.subjects.length % PALETTE.length];
      renderSwatches();
      save(true);
      renderSubjectManage();
      renderPills();
      renderChart();
      renderStats();
      paintAll();
    });
  }

  function closeSheets() {
    el.historySheet.hidden = true;
    el.settingsSheet.hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    document.documentElement.dataset.theme = data.settings.theme === 'dark' ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').setAttribute('content',
      data.settings.theme === 'dark' ? '#16130f' : '#f5f1e9');

    const now = new Date();
    el.topDate.textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 周${WEEK_CN[now.getDay()]}`;
    paintMotto();

    $$('.seg', el.rangeTabs).forEach(b => b.setAttribute('aria-selected', b.dataset.range === data.settings.range ? 'true' : 'false'));
    renderPills();
    // 备注只属于「当前这一段」，不跨刷新保留，避免每次打开都残留上次的内容
    el.noteInput.value = '';
    if (data.settings.note) { data.settings.note = ''; save(); }
    el.ringProgress.style.strokeDasharray = String(2 * Math.PI * 138);
    if (DEMO) setupDemo();
    paintAll();
    renderStats();
    renderChart();
    paintRange();
    renderWeekBars();
    renderFlow();
    paintSync();
    bind();
    // 刷新 / 重新打开后，把没结束的那一段恢复成「已暂停」
    restoreSession();

    // 云同步：启动时拉一次；恢复网络 / 回到页面时再拉
    if (syncCfg.token && !DEMO) setTimeout(() => syncNow({ silent: true }), 1200);
    window.addEventListener('online', () => { if (syncCfg.token && !DEMO) syncNow({ silent: true }); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && syncCfg.token && !DEMO) syncNow({ silent: true });
    });

    // 到零点自动刷新“今日”数据
    let dayMark = dayKey(Date.now());
    setInterval(() => {
      const k = dayKey(Date.now());
      if (k !== dayMark) {
        dayMark = k;
        renderStats();
        renderChart();
        renderWeekBars();
        renderFlow();
        const d = new Date();
        el.topDate.textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 周${WEEK_CN[d.getDay()]}`;
      }
    }, 30000);
  }

  init();

  // 调试入口：控制台可用 __timer.debugElapsed(分钟) 模拟已经学了一段时间，方便验证记录逻辑
  window.__timer = {
    state,
    get data() { return data; },
    sync: {
      cfg: () => syncCfg,
      now: opts => syncNow(opts),
      merge: mergeRemote,
      payload: syncPayload,
      recover: recoverFromAllGists,
      setToken(token, gistId) {
        syncCfg.token = token || '';
        syncCfg.gistId = gistId || '';
        saveSyncCfg();
        paintSync();
      }
    },
    debugElapsed(minutes) {
      state.elapsedMs = Math.max(0, minutes) * 60000;
      if (!state.running) state.runSince = nowMs();
      paintAll();
    },
    shot: async () => (await shotCanvas()).canvas.toDataURL('image/png')
  };
})();
