(function () {
  'use strict';
  var panel = document.querySelector('[data-vocabulary-review]');
  if (!panel) return;
  var core = window.VocabularyReviewCore;
  var gistSync = window.StudyGistSync;
  var KEY = 'sqnuzy-vocabulary-review-v1';
  var REPLAY_KEY = 'sqnuzy-vocabulary-replay-v1';
  var SYNC_KEY = 'kaoyan-study-timer-sync-v1';
  var GIST_FILE = 'vocabulary-review.json';
  var catalog = null;
  var progress = readProgress();
  var dailyBatch = readDailyBatch();
  var replay = readReplay();
  var queue = replay ? replay.ids.slice() : [];
  var day = core.reviewDay();
  var selectionReady = !(config().token && config().gistId) || !!(dailyBatch && dailyBatch.day === day);
  var rolloverTimer;
  var loading = false;
  var syncing = false;
  var syncMessage = '';
  var lastLoadedAt = 0;
  function find(name) { return panel.querySelector('[data-vocabulary-' + name + ']'); }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}').progress || {}; }
    catch (error) { return {}; }
  }
  function readDailyBatch() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}').daily_batch || null; }
    catch (error) { return null; }
  }
  function readReplay() {
    try {
      var saved = JSON.parse(localStorage.getItem(REPLAY_KEY) || 'null');
      return saved && saved.day === core.reviewDay() && Array.isArray(saved.ids) && saved.ids.every(function (id) { return typeof id === 'string'; }) ? saved : null;
    } catch (error) { return null; }
  }
  function saveReplay() {
    try {
      if (replay) localStorage.setItem(REPLAY_KEY, JSON.stringify(replay));
      else localStorage.removeItem(REPLAY_KEY);
    } catch (error) { find('feedback').textContent = '浏览器未能保存本轮重练进度，刷新后可能需要重新开始。'; }
  }
  function payload() { return { version: 2, progress: progress, daily_batch: dailyBatch }; }
  function queueSync() {
    if (!config().token || !config().gistId) return;
    gistSync.schedule('vocabulary', function () { sync(false); });
  }
  function save() {
    progress = core.mergeProgress(readProgress(), progress);
    dailyBatch = core.mergeDailyBatches(dailyBatch, readDailyBatch());
    if (catalog && selectionReady) dailyBatch = core.selectDaily(catalog.words, progress, Date.now(), dailyBatch);
    try { localStorage.setItem(KEY, JSON.stringify(payload())); return true; }
    catch (error) { find('feedback').textContent = '浏览器未能保存进度，请允许网站存储后重试。'; return false; }
  }
  function config() {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); }
    catch (error) { return {}; }
  }
  function paintSync(message) {
    if (message !== undefined) syncMessage = message;
    var connected = !!(config().token && config().gistId);
    find('sync').hidden = !connected;
    find('sync').disabled = syncing;
    find('sync').textContent = syncing ? '同步中…' : '同步进度';
    find('connect').hidden = false;
    find('connect').textContent = connected ? '管理学习同步' : '连接已有的学习同步';
    find('sync-status').textContent = syncing ? '正在同步学习进度…' : syncMessage || (connected ? '已连接学习同步；有新进度时，最多每5分钟自动同步一次。' : '进度保存在此设备；连接学习同步后可跨设备继续。');
  }
  function syncFailure(message) {
    var error = new Error(message);
    error.syncMessage = message;
    return error;
  }
  async function syncRequest(url, options, action) {
    var response;
    try { response = await gistSync.request(url, options); }
    catch (error) {
      if (error.rateLimited || error.name === 'AbortError') throw error;
      throw syncFailure('此设备暂时连不上 GitHub，请检查网络或代理后重试。');
    }
    if (response.ok) return response;
    var status = response.status;
    if (status === 401) throw syncFailure('学习同步授权无效或已过期，请打开“管理学习同步”重新连接。');
    if (status === 403) throw syncFailure('学习同步授权缺少 Gist 读写权限，请打开“管理学习同步”检查授权。');
    if (status === 404) throw syncFailure('找不到已连接的云端数据，或当前授权无权访问，请打开“管理学习同步”检查连接。');
    throw syncFailure(action + '失败（HTTP ' + status + '），' + (status >= 500 ? 'GitHub 暂时无法处理，请稍后重试。' : '请检查学习同步设置。'));
  }
  function rate(word, rating) {
    checkDay();
    progress[word.id] = core.feedback(word, progress, rating, Date.now());
    var saved = save();
    var result = core.state(word, progress);
    queue = queue.filter(function (id) { return id !== word.id; });
    if (result.same_day_retest_pending) queue.push(word.id);
    if (replay) { replay.ids = queue.slice(); saveReplay(); }
    render();
    if (saved) find('feedback').textContent = word.word + (result.same_day_retest_pending ? '：加入当日巩固，稍后再回忆一次；明天仍会复习。' : '：已记录，下次复习 ' + result.next_review_on + ' 05:00。');
    focusCurrent();
    queueSync();
  }
  function focusCurrent() {
    var nextCard = find('list').querySelector('.vocabulary-card');
    var next = nextCard ? nextCard.querySelector('.vocabulary-word-toggle') : find('empty');
    next.focus({ preventScroll: true });
    var scrollTarget = nextCard || next;
    var header = document.querySelector('.site-header');
    scrollTarget.style.scrollMarginTop = ((header ? header.offsetHeight : 0) + 16) + 'px';
    scrollTarget.scrollIntoView({ block: 'nearest' });
  }
  function restart() {
    checkDay();
    if (!catalog || !selectionReady) return;
    var today = core.plan(catalog.words, progress, Date.now(), dailyBatch);
    var ids = new Set(today.daily_batch.ids.concat(today.due.map(function (word) { return word.id; })));
    catalog.words.forEach(function (word) {
      if (core.state(word, progress).last_reviewed_on === day) ids.add(word.id);
    });
    queue = Array.from(ids);
    if (!queue.length) return;
    replay = { day: day, ids: queue.slice() };
    render();
    find('feedback').textContent = '已开始重新复习今日 ' + queue.length + ' 个单词，学习记录已保留。';
    saveReplay();
    focusCurrent();
  }
  function render() {
    find('day').textContent = day;
    find('day').dateTime = day;
    find('restart').disabled = !catalog || !selectionReady;
    if (!catalog) return;
    if (!selectionReady) {
      find('total').textContent = catalog.words.length;
      find('empty').hidden = false;
      find('empty').textContent = '正在同步学习进度，随后安排今日选词…';
      return;
    }
    dailyBatch = core.mergeDailyBatches(dailyBatch, readDailyBatch());
    var today = core.plan(catalog.words, progress, Date.now(), dailyBatch);
    if (JSON.stringify(dailyBatch) !== JSON.stringify(today.daily_batch)) {
      dailyBatch = today.daily_batch;
      save();
      if (!syncing) queueSync();
    }
    var due = today.due;
    if (replay) {
      var replayIds = new Set(replay.ids);
      var scheduledIds = new Set(due.map(function (word) { return word.id; }));
      due = due.concat(catalog.words.map(function (word) { return core.state(word, progress); }).filter(function (word) {
        return replayIds.has(word.id) && !scheduledIds.has(word.id) && word.first_learned_on && word.first_learned_on <= day;
      }));
    }
    find('restart').disabled = !today.rotation_total && !due.length && !today.completed;
    find('due').textContent = due.length;
    find('completed').textContent = today.completed;
    find('total').textContent = today.total;
    find('selected').textContent = today.rotation_total;
    var selectedIds = new Set(today.daily_batch.ids);
    find('extra').textContent = due.filter(function (word) { return !selectedIds.has(word.id); }).length;
    var dueIds = new Set(due.map(function (word) { return word.id; }));
    queue = queue.filter(function (id) { return dueIds.has(id); });
    var queued = new Set(queue);
    due.forEach(function (word) {
      if (!queued.has(word.id)) { queue.push(word.id); queued.add(word.id); }
    });
    var currentWord = due.find(function (word) { return word.id === queue[0]; });
    var list = find('list');
    list.replaceChildren();
    if (currentWord) {
      var word = currentWord;
      var card = element('article', 'vocabulary-card');
      card.dataset.wordId = word.id;
      var heading = element('div', 'vocabulary-word');
      var title = element('h3');
      var toggle = element('button', 'vocabulary-word-toggle', word.word);
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'vocabulary-answer-' + word.id);
      title.appendChild(toggle);
      heading.appendChild(title);
      heading.appendChild(element('span', 'vocabulary-badge', word.same_day_retest_pending ? '当日巩固' : replay ? '今日重练' : !word.last_reviewed_on ? '首次复习' : word.next_review_on < day ? '逾期 · ' + word.next_review_on : word.next_review_on === day ? '今日到期' : '今日轮换'));
      card.appendChild(heading);
      card.appendChild(element('p', 'vocabulary-meta', word.last_reviewed_on ? '上次复习 ' + word.last_reviewed_on : '初学 ' + word.first_learned_on));
      var answer = element('div', 'vocabulary-answer');
      answer.id = 'vocabulary-answer-' + word.id;
      answer.hidden = true;
      toggle.addEventListener('click', function () {
        answer.hidden = !answer.hidden;
        toggle.setAttribute('aria-expanded', String(!answer.hidden));
      });
      if (word.meaning || word.sense) answer.appendChild(element('p', 'vocabulary-meaning', word.meaning || word.sense));
      (word.examples || []).forEach(function (example) {
        var quote = element('blockquote', 'vocabulary-example');
        var sentence = element('p', '', example.original_sentence);
        sentence.lang = 'en';
        quote.appendChild(sentence);
        if (example.translation) quote.appendChild(element('p', 'vocabulary-translation', example.translation));
        answer.appendChild(quote);
      });
      var actions = element('div', 'vocabulary-ratings');
      [['remembered', '记得'], ['hesitant', '模糊'], ['forgotten', '忘了']].forEach(function (choice) {
        var button = element('button', 'study-button' + (choice[0] === 'remembered' ? ' study-button-primary' : ''), choice[1]);
        button.type = 'button';
        button.dataset.rating = choice[0];
        button.addEventListener('click', function () { rate(word, choice[0]); });
        actions.appendChild(button);
      });
      answer.appendChild(actions);
      card.appendChild(answer);
      list.appendChild(card);
    }
    var empty = find('empty');
    empty.hidden = due.length > 0;
    empty.textContent = today.total === 0 ? '词库还没有单词。把学过的单词和原句发给助手录入后，这里会自动安排复习。' :
      (replay ? '本轮重新复习已完成。' : today.completed ? '今天的选词和到期任务已复习完。' : '今天没有待复习单词。') + (today.next ? '下次更新：' + today.next + ' 05:00。' : '');
  }
  async function refresh(force) {
    if (loading || (!force && Date.now() - lastLoadedAt < 60000)) return;
    loading = true;
    try {
      var response = await fetch(panel.dataset.source, { cache: 'no-store' });
      if (!response.ok) throw new Error('词库加载失败');
      var loaded = await response.json();
      if (!Array.isArray(loaded.words)) throw new Error('词库格式错误');
      find('load-status').textContent = '';
      catalog = loaded;
      lastLoadedAt = Date.now();
      render();
    } catch (error) {
      if (catalog) find('load-status').textContent = '暂时无法获取新词，当前清单仍可复习；联网后刷新页面可重试。';
      else find('empty').textContent = '暂时无法加载词库，请联网后刷新页面重试。';
    } finally {
      loading = false;
    }
  }
  async function sync(manual) {
    var cfg = config();
    if (!cfg.token || !cfg.gistId) {
      var waiting = !selectionReady;
      selectionReady = true;
      paintSync('');
      if (waiting) render();
      return;
    }
    if (syncing) { paintSync(); return; }
    if (!manual && !gistSync.automatic('vocabulary', function () { sync(false); })) {
      if (!selectionReady) { selectionReady = true; render(); }
      return;
    }
    if (manual) gistSync.started('vocabulary');
    syncing = true;
    paintSync('');
    var sent = '';
    var controller = new AbortController();
    var syncTimeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var url = 'https://api.github.com/gists/' + encodeURIComponent(cfg.gistId);
      var headers = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28' };
      var response = await syncRequest(url, { headers: headers, cache: 'no-store', signal: controller.signal }, '读取云端进度');
      var gist = await response.json();
      var file = gist.files && gist.files[GIST_FILE];
      var remote = {};
      var remoteBatch = null;
      if (file) {
        var content = file.content;
        if (file.truncated) {
          var rawUrl;
          try { rawUrl = new URL(file.raw_url); } catch (error) { throw syncFailure('云端完整进度的地址无效，请检查学习同步设置。'); }
          if (rawUrl.origin !== 'https://gist.githubusercontent.com') throw syncFailure('云端完整进度的地址无效，请检查学习同步设置。');
          var raw = await syncRequest(file.raw_url, { signal: controller.signal }, '读取完整进度');
          content = await raw.text();
        }
        var parsed = JSON.parse(content);
        remote = parsed && parsed.progress;
        if (!remote || typeof remote !== 'object' || Array.isArray(remote)) throw syncFailure('云端复习进度格式异常，请在“管理学习同步”中检查云端文件。');
        remoteBatch = parsed.daily_batch || null;
      }
      var before = JSON.stringify(payload());
      var wasReady = selectionReady;
      progress = core.mergeProgress(core.mergeProgress(remote, readProgress()), progress);
      dailyBatch = core.mergeDailyBatches(dailyBatch, remoteBatch);
      selectionReady = true;
      save();
      if (!wasReady || JSON.stringify(payload()) !== before) render();
      sent = JSON.stringify(payload());
      if (!file || JSON.stringify({ version: 2, progress: remote, daily_batch: remoteBatch }) !== sent) {
        var files = {};
        files[GIST_FILE] = { content: sent };
        await syncRequest(url, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify({ files: files }), signal: controller.signal }, '保存云端进度');
      }
      gistSync.succeeded();
      paintSync(manual ? '复习进度已同步。' : '');
    } catch (error) {
      var message = error.syncMessage || (error.name === 'AbortError' ? '连接 GitHub 超时，请检查网络后重试。' : error.name === 'SyntaxError' ? '云端复习进度格式异常，请在“管理学习同步”中检查云端文件。' : '同步未完成，请稍后重试。');
      paintSync('云同步失败：' + message + ' 进度仍保存在此设备。');
    } finally {
      clearTimeout(syncTimeout);
      syncing = false;
      if (!selectionReady) { selectionReady = true; render(); }
      paintSync();
      // 同步期间刚提交的反馈要再推送，不能被旧快照覆盖。
      if (sent && sent !== JSON.stringify(payload())) queueSync();
    }
  }
  function checkDay() {
    var current = core.reviewDay();
    if (current !== day) {
      day = current;
      queue = [];
      replay = null;
      saveReplay();
      selectionReady = !(config().token && config().gistId) || !!(dailyBatch && dailyBatch.day === day);
      find('feedback').textContent = '';
      render();
      refresh(true);
      if (!selectionReady) sync(false);
    }
    clearTimeout(rolloverTimer);
    rolloverTimer = setTimeout(checkDay, Math.max(1, core.nextRollover() - Date.now()));
  }
  function resume() {
    if (document.hidden) return;
    checkDay();
    refresh(false);
    queueSync();
  }
  find('restart').addEventListener('click', restart);
  find('sync').addEventListener('click', function () { sync(true); });
  gistSync.onRetry(function () { sync(false); });
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  window.addEventListener('storage', function (event) {
    if (event.key === KEY || event.key === null) { progress = core.mergeProgress(progress, readProgress()); dailyBatch = core.mergeDailyBatches(dailyBatch, readDailyBatch()); render(); }
    if (event.key === REPLAY_KEY || event.key === null) { replay = readReplay(); queue = replay ? replay.ids.slice() : []; render(); }
    if (event.key === SYNC_KEY || event.key === null) { paintSync(); sync(false); }
  });
  paintSync();
  render();
  checkDay();
  refresh(true);
  sync(false);
}());
