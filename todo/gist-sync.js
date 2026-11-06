(function () {
  'use strict';
  var KEY = 'kaoyan-study-sync-cooldown-v1';
  var state = { retryAt: 0, attempts: 0 };
  var callbacks = [];
  var timer;
  function read() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && Number.isFinite(saved.retryAt) && Number.isInteger(saved.attempts) && saved.attempts >= 0) state = saved;
    } catch (error) { /* 存储不可用时仍在当前页面退避。 */ }
    return state;
  }
  function retryAt() { return Math.max(0, read().retryAt > Date.now() ? state.retryAt : 0); }
  function write(value) {
    state = value;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { /* 保留内存中的等待时间。 */ }
  }
  function failure() {
    var current = read();
    var time = new Date(current.retryAt + 8 * 3600000).toISOString().slice(5, 19).replace('T', ' ');
    var error = new Error('GitHub 请求过于频繁，' + (current.attempts <= 3 ? '将于北京时间 ' + time + ' 自动重试。' : '可于北京时间 ' + time + ' 后手动重试。'));
    error.rateLimited = true;
    error.syncMessage = error.message;
    error.retryAt = current.retryAt;
    return error;
  }
  function arm() {
    clearTimeout(timer);
    var until = retryAt();
    if (!until || read().attempts > 3 || !callbacks.length) return;
    timer = setTimeout(function () {
      if (retryAt()) { arm(); return; }
      callbacks.forEach(function (callback) { callback(); });
    }, Math.min(2147483647, until - Date.now()));
  }
  async function request(url, options) {
    if (retryAt()) { arm(); throw failure(); }
    var response = await fetch(url, options);
    if (response.status !== 403 && response.status !== 429) return response;
    var detail = {};
    try { detail = await response.clone().json(); } catch (error) { /* 限流也可能返回非 JSON 内容。 */ }
    var after = Number(response.headers.get('retry-after'));
    var remaining = response.headers.get('x-ratelimit-remaining');
    if (response.status !== 429 && remaining !== '0' && !(Number.isFinite(after) && after > 0) && !/rate limit|abuse/i.test(detail && detail.message || '')) return response;
    var previous = read();
    var attempts = previous.retryAt > Date.now() ? previous.attempts : previous.attempts + 1;
    var wait = Math.min(15 * 60000, 60000 * Math.pow(2, Math.min(attempts - 1, 4)));
    var until = Date.now() + wait;
    if (Number.isFinite(after) && after > 0) until = Date.now() + after * 1000;
    else if (remaining === '0') {
      var reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      if (Number.isFinite(reset) && reset > Date.now()) until = reset;
    }
    write({ retryAt: Math.max(previous.retryAt, until + 1000), attempts: attempts });
    arm();
    throw failure();
  }
  window.StudyGistSync = {
    request: request,
    retryAt: retryAt,
    onRetry: function (callback) { callbacks.push(callback); arm(); },
    succeeded: function () { if (!retryAt()) write({ retryAt: 0, attempts: 0 }); }
  };
  window.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) arm(); });
}());
