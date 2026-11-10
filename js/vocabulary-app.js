(function () {
  'use strict';
  var app = document.querySelector('[data-vocabulary-app]');
  if (!app) return;
  var install = app.querySelector('[data-app-install]');
  var help = app.querySelector('[data-app-help]');
  var status = app.querySelector('[data-app-status]');
  var standalone = window.matchMedia('(display-mode: standalone)');
  var prompt = null;
  var ready = false;
  var installed = false;
  var cached = !navigator.onLine;
  function paint() {
    install.hidden = installed || standalone.matches || !!navigator.standalone;
    if (install.hidden) help.hidden = true;
    status.textContent = cached || !navigator.onLine ? '当前使用已保存的词库；进度保存在此设备，联网后可更新和同步。' :
      ready ? '已准备好离线背词；进度自动保存在此设备。' : '首次联网打开后，准备离线背词。';
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    prompt = event;
  });
  install.addEventListener('click', async function () {
    if (prompt) {
      var current = prompt;
      prompt = null;
      try {
        await current.prompt();
        var choice = await current.userChoice;
        if (choice.outcome === 'accepted') { installed = true; paint(); }
      } catch (error) { help.hidden = false; }
    } else help.hidden = !help.hidden;
    install.setAttribute('aria-expanded', String(!help.hidden));
  });
  window.addEventListener('appinstalled', function () { prompt = null; installed = true; paint(); });
  if (standalone.addEventListener) standalone.addEventListener('change', paint);
  window.addEventListener('offline', function () { cached = true; paint(); });
  window.addEventListener('online', function () { cached = false; paint(); });
  paint();
  if (!('serviceWorker' in navigator)) {
    status.textContent = '此浏览器暂不支持离线背词；联网时可正常复习。';
    return;
  }
  navigator.serviceWorker.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'vocabulary-cached') { cached = true; paint(); }
    if (event.data && event.data.type === 'vocabulary-online') { cached = false; paint(); }
  });
  navigator.serviceWorker.register('/words/sw.js', { scope: '/words/', updateViaCache: 'none' })
    .then(function (registration) {
      if (registration.active) return;
      return new Promise(function (resolve, reject) {
        var worker = registration.installing || registration.waiting;
        if (!worker) { reject(new Error('Offline preparation unavailable')); return; }
        function changed() {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant') reject(new Error('Offline preparation failed'));
        }
        worker.addEventListener('statechange', changed);
        changed();
      });
    })
    .then(function () { ready = true; paint(); })
    .catch(function () { status.textContent = '离线准备未完成；请保持联网，重新打开本页后重试。'; });
}());
