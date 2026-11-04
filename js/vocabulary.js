(function () {
  'use strict';
  var panel = document.querySelector('[data-vocabulary-review]');
  if (!panel) return;
  var core = window.VocabularyReviewCore;
  var KEY = 'sqnuzy-vocabulary-review-v1';
  var SYNC_KEY = 'kaoyan-study-timer-sync-v1';
  var GIST_FILE = 'vocabulary-review.json';
  var catalog = null;
  var progress = readProgress();
  var queue = [];
  var day = core.reviewDay();
  var rolloverTimer;
  var syncTimer;
  var loading = false;
  var syncing = false;
  var lastLoadedAt = 0;
  var lastSyncedAt = 0;
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
  function save() {
    progress = core.mergeProgress(readProgress(), progress);
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, progress: progress })); return true; }
    catch (error) { find('feedback').textContent = '浏览器未能保存进度，请允许网站存储后重试。'; return false; }
  }
  function config() {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); }
    catch (error) { return {}; }
  }
  function paintSync(message) {
    var connected = !!(config().token && config().gistId);
    find('sync').hidden = !connected;
    find('sync').disabled = syncing;
    find('sync').textContent = syncing ? '同步中…' : '同步进度';
    find('connect').hidden = connected;
    find('sync-status').textContent = message || (connected ? '已连接学习同步，复习结果会自动保存到云端。' : '进度保存在此设备；连接学习同步后可跨设备继续。');
  }
  function rate(word, rating) {
    checkDay();
    progress[word.id] = core.feedback(word, progress, rating, Date.now());
    var saved = save();
    var result = core.state(word, progress);
    queue = queue.filter(function (id) { return id !== word.id; });
    if (result.same_day_retest_pending) queue.push(word.id);
    render();
    if (saved) find('feedback').textContent = word.word + (result.same_day_retest_pending ? '：加入当日巩固，稍后再回忆一次；明天仍会复习。' : '：已记录，下次复习 ' + result.next_review_on + ' 05:00。');
    var nextCard = find('list').querySelector('.vocabulary-card');
    var next = nextCard ? nextCard.querySelector('h3') : find('empty');
    next.focus({ preventScroll: true });
    var scrollTarget = nextCard || next;
    var header = document.querySelector('.site-header');
    scrollTarget.style.scrollMarginTop = ((header ? header.offsetHeight : 0) + 16) + 'px';
    scrollTarget.scrollIntoView({ block: 'nearest' });
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { sync(false); }, 1000);
  }
  function render() {
    find('day').textContent = day;
    find('day').dateTime = day;
    if (!catalog) return;
    var today = core.plan(catalog.words, progress, Date.now());
    find('due').textContent = today.due.length;
    find('completed').textContent = today.completed;
    find('total').textContent = today.total;
    var dueIds = new Set(today.due.map(function (word) { return word.id; }));
    queue = queue.filter(function (id) { return dueIds.has(id); });
    var queued = new Set(queue);
    today.due.forEach(function (word) {
      if (!queued.has(word.id)) { queue.push(word.id); queued.add(word.id); }
    });
    var currentWord = today.due.find(function (word) { return word.id === queue[0]; });
    var list = find('list');
    list.replaceChildren();
    if (currentWord) {
      var word = currentWord;
      var card = element('article', 'vocabulary-card');
      card.dataset.wordId = word.id;
      var heading = element('div', 'vocabulary-word');
      var title = element('h3', '', word.word);
      title.tabIndex = -1;
      heading.appendChild(title);
      heading.appendChild(element('span', 'vocabulary-badge', word.same_day_retest_pending ? '当日巩固' : word.next_review_on < day ? '逾期 · ' + word.next_review_on : '今日到期'));
      card.appendChild(heading);
      card.appendChild(element('p', 'vocabulary-meta', word.last_reviewed_on ? '上次复习 ' + word.last_reviewed_on : '初学 ' + word.first_learned_on));
      var details = element('details', 'vocabulary-answer');
      details.appendChild(element('summary', '', '回忆后查看原句与释义'));
      if (word.meaning || word.sense) details.appendChild(element('p', 'vocabulary-meaning', word.meaning || word.sense));
      (word.examples || []).forEach(function (example) {
        var quote = element('blockquote', 'vocabulary-example');
        var sentence = element('p', '', example.original_sentence);
        sentence.lang = 'en';
        quote.appendChild(sentence);
        if (example.translation) quote.appendChild(element('p', 'vocabulary-translation', example.translation));
        details.appendChild(quote);
      });
      var actions = element('div', 'vocabulary-ratings');
      [['remembered', '记得'], ['hesitant', '模糊'], ['forgotten', '忘了']].forEach(function (choice) {
        var button = element('button', 'study-button' + (choice[0] === 'remembered' ? ' study-button-primary' : ''), choice[1]);
        button.type = 'button';
        button.dataset.rating = choice[0];
        button.addEventListener('click', function () { rate(word, choice[0]); });
        actions.appendChild(button);
      });
      details.appendChild(actions);
      card.appendChild(details);
      list.appendChild(card);
    }
    var empty = find('empty');
    empty.hidden = today.due.length > 0;
    empty.textContent = today.total === 0 ? '词库还没有单词。把学过的单词和原句发给助手录入后，这里会自动安排复习。' :
      (today.completed ? '今天的到期单词已复习完。' : '今天没有到期单词。') + (today.next ? '下次复习：' + today.next + ' 05:00。' : '');
  }
  async function refresh(force) {
    if (loading || (!force && Date.now() - lastLoadedAt < 60000)) return;
    loading = true;
    find('refresh').disabled = true;
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
      if (catalog) find('load-status').textContent = '暂时无法获取新词，当前清单仍可复习；联网后点击“更新清单”。';
      else find('empty').textContent = '暂时无法加载词库，请联网后点击“更新清单”重试。';
    } finally {
      loading = false;
      find('refresh').disabled = false;
    }
  }
  async function sync(manual) {
    var cfg = config();
    if (!cfg.token || !cfg.gistId || syncing) { paintSync(); return; }
    syncing = true;
    paintSync();
    var sent = '';
    try {
      var url = 'https://api.github.com/gists/' + encodeURIComponent(cfg.gistId);
      var headers = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28' };
      var response = await fetch(url, { headers: headers, cache: 'no-store' });
      if (!response.ok) throw new Error('读取同步数据失败');
      var gist = await response.json();
      var file = gist.files && gist.files[GIST_FILE];
      var remote = {};
      if (file) {
        var content = file.content;
        if (file.truncated) {
          if (new URL(file.raw_url).origin !== 'https://gist.githubusercontent.com') throw new Error('同步地址无效');
          var raw = await fetch(file.raw_url);
          if (!raw.ok) throw new Error('读取完整进度失败');
          content = await raw.text();
        }
        remote = JSON.parse(content).progress;
        if (!remote || typeof remote !== 'object' || Array.isArray(remote)) throw new Error('同步数据格式错误');
      }
      var before = JSON.stringify(progress);
      progress = core.mergeProgress(core.mergeProgress(remote, readProgress()), progress);
      save();
      if (JSON.stringify(progress) !== before) render();
      sent = JSON.stringify({ version: 1, progress: progress });
      if (!file || JSON.stringify(remote) !== JSON.stringify(progress)) {
        var files = {};
        files[GIST_FILE] = { content: sent };
        var written = await fetch(url, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify({ files: files }) });
        if (!written.ok) throw new Error('保存同步数据失败');
      }
      lastSyncedAt = Date.now();
      paintSync(manual ? '复习进度已同步。' : undefined);
    } catch (error) {
      paintSync('云同步暂未成功，进度仍保存在此设备，可稍后重试。');
    } finally {
      syncing = false;
      find('sync').disabled = false;
      find('sync').textContent = '同步进度';
      // 同步期间刚提交的反馈要再推送，不能被旧快照覆盖。
      if (sent && sent !== JSON.stringify({ version: 1, progress: progress })) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(function () { sync(false); }, 1000);
      }
    }
  }
  function checkDay() {
    var current = core.reviewDay();
    if (current !== day) {
      day = current;
      queue = [];
      find('feedback').textContent = '';
      render();
      refresh(true);
    }
    clearTimeout(rolloverTimer);
    rolloverTimer = setTimeout(checkDay, Math.max(1, core.nextRollover() - Date.now()));
  }
  function resume() {
    if (document.hidden) return;
    checkDay();
    refresh(false);
    if (Date.now() - lastSyncedAt > 60000) sync(false);
  }
  find('refresh').addEventListener('click', function () { checkDay(); refresh(true); sync(false); });
  find('sync').addEventListener('click', function () { sync(true); });
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  window.addEventListener('storage', function (event) {
    if (event.key === KEY || event.key === null) { progress = core.mergeProgress(progress, readProgress()); render(); }
    if (event.key === SYNC_KEY || event.key === null) { paintSync(); sync(false); }
  });
  paintSync();
  render();
  checkDay();
  refresh(true);
  sync(false);
}());
