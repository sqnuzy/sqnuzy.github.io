/* 复习页只写独立日志，计时页合并后沿用现有统计与云同步，避免覆盖手动计时。 */
(function () {
  'use strict';
  var KEY = 'kaoyan-study-review-v1';
  var SUBJECT = { id: 'note-review', name: '笔记复习', color: '#06B6D4' };

  function readEntries() {
    try {
      var entries = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(entries) ? entries.filter(function (entry) {
        return entry && typeof entry.id === 'string' && entry.id.indexOf('review-') === 0 &&
          Number.isFinite(entry.dur) && entry.dur > 0 && Number.isFinite(entry.ts) && entry.ts > 0;
      }) : [];
    } catch (err) { return []; }
  }

  function merge(data) {
    var changed = false;
    var deleted = new Set(data.deletedSessions || []);
    var subjects = data.subjects;
    var subject = subjects.find(function (item) { return item.id === SUBJECT.id || item.name === SUBJECT.name; });
    function addSubject() {
      var id = SUBJECT.id;
      if ((data.deletedSubjects || []).indexOf(id) !== -1) id += '-' + Date.now().toString(36);
      subject = { id: id, name: SUBJECT.name, color: SUBJECT.color };
      subjects.push(subject);
      changed = true;
    }
    if (!subject && (data.deletedSubjects || []).indexOf(SUBJECT.id) === -1) addSubject();
    var sessions = new Map(data.sessions.map(function (entry) { return [entry.id, entry]; }));
    readEntries().forEach(function (entry) {
      if (deleted.has(entry.id)) return;
      var previous = sessions.get(entry.id);
      if (previous && previous.dur >= entry.dur) return;
      if (!previous && !subject) addSubject();
      sessions.set(entry.id, Object.assign({}, entry, {
        subjectId: previous ? previous.subjectId : subject.id,
        note: '',
        mode: 'focus'
      }));
      changed = true;
    });
    if (changed) {
      data.sessions = Array.from(sessions.values()).sort(function (a, b) { return a.ts - b.ts; }).slice(-6000);
      data.updatedAt = Date.now();
    }
    return changed;
  }

  window.StudyReview = { key: KEY, subject: SUBJECT, merge: merge };
  if (!document.querySelector('[data-study-hub], [data-study-note]')) return;

  var active = null;
  var ticker = 0;
  var suspended = false;
  function persist() {
    if (!active) return;
    var elapsedMs = performance.now() - active.since;
    if (elapsedMs <= 10000) return; // 超过 10 秒才记录，达标后计入整段时间。
    var seconds = Math.floor(elapsedMs / 1000);
    var entry = {
      id: active.id,
      ts: Date.now(),
      dur: seconds,
      beganAt: active.beganAt,
      subjectId: SUBJECT.id,
      note: '',
      mode: 'focus'
    };
    var entries = readEntries().filter(function (item) { return item.id !== entry.id; });
    entries.push(entry);
    try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-6000))); }
    catch (err) { /* 存储不可用时保持静默，不打断复习。 */ }
  }
  function pause() {
    persist();
    active = null;
    clearInterval(ticker);
    ticker = 0;
  }
  function update() {
    if (suspended || document.hidden || !document.hasFocus()) { pause(); return; }
    if (active) return;
    active = {
      id: 'review-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      beganAt: Date.now(),
      since: performance.now()
    };
    ticker = setInterval(persist, 5000);
  }
  document.addEventListener('visibilitychange', update);
  window.addEventListener('focus', update);
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', function () { suspended = true; pause(); });
  window.addEventListener('pageshow', function () { suspended = false; update(); });
  update();
}());
