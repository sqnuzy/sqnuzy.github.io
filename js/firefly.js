(function () {
  if (document.querySelector('.article-grid')) {
    document.documentElement.classList.add('article-layout-root');
    document.body.classList.add('article-layout');
  }
  var root = document.documentElement;
  var savedTheme = localStorage.getItem('firefly-theme') || 'auto';

  function applyTheme(mode) {
    var resolved = mode === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    localStorage.setItem('firefly-theme', mode);
    document.querySelectorAll('[data-theme-set]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-theme-set') === mode);
    });
  }

  applyTheme(savedTheme);

  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      applyTheme(button.getAttribute('data-theme-set'));
      closePanels();
    });
  });

  function closePanels(except) {
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      if (panel !== except) {
        panel.classList.remove('open');
        panel.hidden = true;
      }
    });
    document.querySelectorAll('[data-panel-toggle]').forEach(function (button) {
      var active = except && button.getAttribute('data-panel-toggle') === except.getAttribute('data-panel');
      button.classList.toggle('active', !!active);
    });
  }

  document.querySelectorAll('[data-panel-toggle]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var panel = document.querySelector('[data-panel="' + button.getAttribute('data-panel-toggle') + '"]');
      if (!panel) return;
      var shouldOpen = !panel.classList.contains('open');
      closePanels();
      if (shouldOpen) {
        panel.hidden = false;
        panel.classList.add('open');
        button.classList.add('active');
      }
    });
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.header-actions') && !event.target.closest('.header-panel')) closePanels();
  });

  var hue = localStorage.getItem('firefly-hue') || '78';
  function applyHue(value) {
    document.documentElement.style.setProperty('--user-hue', value);
    localStorage.setItem('firefly-hue', value);
    document.querySelectorAll('[data-hue-value]').forEach(function (node) {
      node.textContent = value;
    });
  }
  applyHue(hue);
  document.querySelectorAll('[data-hue-range]').forEach(function (range) {
    range.value = hue;
    range.addEventListener('input', function () {
      applyHue(range.value);
    });
  });

  var media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener && media.addEventListener('change', function () {
    if ((localStorage.getItem('firefly-theme') || 'auto') === 'auto') applyTheme('auto');
  });

  var feed = document.querySelector('[data-feed]');
  var layout = localStorage.getItem('firefly-post-layout') || 'list';
  function setPostLayout(next) {
    if (feed) feed.dataset.layout = next;
    localStorage.setItem('firefly-post-layout', next);
    document.querySelectorAll('[data-post-layout]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-post-layout') === next);
    });
  }
  setPostLayout(layout);
  document.querySelectorAll('[data-post-layout]').forEach(function (button) {
    button.addEventListener('click', function () {
      setPostLayout(button.getAttribute('data-post-layout'));
    });
  });

  document.querySelectorAll('.article-body table').forEach(function (table) {
    if (table.closest('figure.highlight')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  document.querySelectorAll('figure.highlight').forEach(function (figure) {
    var lang = Array.prototype.slice.call(figure.classList).filter(function (name) {
      return name !== 'highlight';
    })[0] || 'code';
    figure.setAttribute('data-lang', lang.toLowerCase());
    var button = document.createElement('button');
    button.className = 'copy-code';
    button.type = 'button';
    button.setAttribute('aria-label', '复制代码');
    button.innerHTML = '<svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';
    var tip = document.createElement('span');
    tip.className = 'copy-tip';
    tip.textContent = '已复制';
    figure.appendChild(tip);
    var showCopy = function () {
      figure.classList.add('copy-visible');
    };
    var hideCopy = function () {
      if (!figure.classList.contains('copy-done')) figure.classList.remove('copy-visible');
    };
    figure.addEventListener('mouseenter', showCopy);
    figure.addEventListener('mouseleave', hideCopy);
    figure.addEventListener('focusin', showCopy);
    figure.addEventListener('focusout', hideCopy);
    button.addEventListener('click', function () {
      var code = figure.querySelector('td.code pre');
      var text = code ? code.innerText : figure.innerText;
      navigator.clipboard && navigator.clipboard.writeText(text.replace(/\n复制$/, ''));
      figure.classList.add('copy-visible', 'copy-done');
      clearTimeout(figure._copyTimer);
      figure._copyTimer = setTimeout(function () {
        figure.classList.remove('copy-done');
        if (!figure.matches(':hover')) figure.classList.remove('copy-visible');
      }, 850);
    });
    figure.appendChild(button);
  });

  var toc = document.querySelector('[data-toc]');
  var tocCard = toc ? toc.closest('.toc-card') : null;
  // Hexo does not expand the Markdown `[TOC]` marker by itself. Remove the
  // marker so it cannot appear as stray text, then build the outline from the
  // headings that were rendered in the article body.
  document.querySelectorAll('.article-body p').forEach(function (paragraph) {
    if (paragraph.textContent.trim() === '[TOC]') paragraph.remove();
  });
  var headings = Array.prototype.slice.call(document.querySelectorAll('.article-body h1, .article-body h2, .article-body h3, .article-body h4'));
  if (toc && headings.length) {
    toc.innerHTML = '';
    headings.forEach(function (heading, index) {
      if (!heading.id) heading.id = 'heading-' + index;
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent;
      link.className = heading.tagName.toLowerCase();
      // Jump immediately instead of starting a long smooth-scroll animation;
      // wheel input remains responsive right after selecting an entry.
      link.addEventListener('click', function (event) {
        event.preventDefault();
        heading.scrollIntoView({ behavior: 'auto', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', link.hash);
      });
      toc.appendChild(link);
    });
    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a'));
    var tocFilter = document.querySelector('[data-toc-filter]');
    if (tocFilter) {
      tocFilter.addEventListener('input', function () {
        var terms = tocFilter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        var count = 0;
        tocLinks.forEach(function (link) {
          link.hidden = !terms.every(function (term) { return link.textContent.toLowerCase().indexOf(term) !== -1; });
          if (!link.hidden) count++;
        });
        document.querySelector('[data-toc-empty]').hidden = count !== 0;
      });
    }
    var activeTick = 0;
    var setActiveToc = function () {
      if (activeTick) return;
      activeTick = window.requestAnimationFrame(function () {
        activeTick = 0;
      var activeIndex = 0;
      headings.forEach(function (heading, index) {
        if (heading.getBoundingClientRect().top < 150) activeIndex = index;
      });
      tocLinks.forEach(function (link, index) {
        link.classList.toggle('active', index === activeIndex);
      });
      });
    };
    setActiveToc();
    window.addEventListener('scroll', setActiveToc, { passive: true });
  } else if (tocCard) {
    if (tocCard) tocCard.hidden = true;
  }

  // Keep a compact toggle next to the back-to-top control so the outline can
  // be dismissed whenever it gets in the way, especially on phone screens.
  if (tocCard && headings.length) {
    var postGrid = tocCard.closest('.post-grid');
    var tocToggle = document.createElement('button');
    tocToggle.className = 'toc-toggle';
    tocToggle.type = 'button';
    tocToggle.textContent = '目录';
    tocToggle.setAttribute('aria-label', '收起或展开文章目录');
    tocToggle.setAttribute('aria-expanded', 'true');
    if (window.matchMedia('(max-width: 860px)').matches) {
      tocCard.classList.add('is-collapsed');
      if (postGrid) postGrid.classList.add('toc-collapsed');
      tocToggle.setAttribute('aria-expanded', 'false');
    }
    document.body.appendChild(tocToggle);
    tocToggle.addEventListener('click', function () {
      var collapsed = tocCard.classList.toggle('is-collapsed');
      if (postGrid) postGrid.classList.toggle('toc-collapsed', collapsed);
      tocToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  var backTop = document.createElement('button');
  backTop.className = 'back-top';
  backTop.type = 'button';
  backTop.textContent = '↑';
  backTop.setAttribute('aria-label', '返回顶部');
  document.body.appendChild(backTop);
  backTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', function () {
    backTop.classList.toggle('show', window.scrollY > 500);
  });

})();
