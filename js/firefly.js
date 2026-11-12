(function () {
  if (document.querySelector('.article-grid')) {
    document.documentElement.classList.add('article-layout-root');
    document.body.classList.add('article-layout');
  }
  var root = document.documentElement;
  function readPreference(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (error) { return fallback; }
  }
  function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch (error) {}
  }
  var savedTheme = root.dataset.themeMode || readPreference('firefly-theme', 'auto');

  function applyTheme(mode) {
    if (['light', 'dark', 'auto'].indexOf(mode) === -1) mode = 'auto';
    var resolved = mode === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    savePreference('firefly-theme', mode);
    document.querySelectorAll('[data-theme-set]').forEach(function (button) {
      var selected = button.getAttribute('data-theme-set') === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  applyTheme(savedTheme);

  document.querySelectorAll('[data-theme-set]').forEach(function (button) {
    button.addEventListener('click', function () {
      applyTheme(button.getAttribute('data-theme-set'));
      closePanels();
      document.querySelector('[data-panel-toggle="theme"]').focus();
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
      button.setAttribute('aria-expanded', String(!!active));
    });
    var searchInput = document.querySelector('[data-navbar-search-input]');
    if (searchInput) searchInput.setAttribute('aria-expanded', String(!!except && except.dataset.panel === 'search'));
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
        button.setAttribute('aria-expanded', 'true');
        var firstControl = panel.querySelector('button, input, a');
        if (firstControl) firstControl.focus();
      }
    });
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.header-actions') && !event.target.closest('.header-panel')) closePanels();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.isComposing) return;
    var openPanel = document.querySelector('[data-panel].open');
    if (!openPanel) return;
    event.preventDefault();
    var toggle = document.querySelector('[data-panel-toggle="' + openPanel.dataset.panel + '"]');
    closePanels();
    if (toggle) toggle.focus();
  });

  var header = document.querySelector('.site-header');
  if (header && window.ResizeObserver) {
    new ResizeObserver(function () {
      root.style.setProperty('--header-offset', Math.ceil(header.getBoundingClientRect().height) + 20 + 'px');
    }).observe(header);
  }

  var media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener && media.addEventListener('change', function () {
    if (root.dataset.themeMode === 'auto') applyTheme('auto');
  });

  var feed = document.querySelector('[data-feed]');
  var layout = readPreference('firefly-post-layout', 'list');
  function setPostLayout(next) {
    if (next !== 'grid') next = 'list';
    if (feed) feed.dataset.layout = next;
    savePreference('firefly-post-layout', next);
    document.querySelectorAll('[data-post-layout]').forEach(function (button) {
      var selected = button.getAttribute('data-post-layout') === next;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  setPostLayout(layout);
  document.querySelectorAll('[data-post-layout]').forEach(function (button) {
    button.addEventListener('click', function () {
      setPostLayout(button.getAttribute('data-post-layout'));
    });
  });

  var scrollRegions = [];
  function updateScrollRegions() {
    scrollRegions.forEach(function (item) {
      var overflowing = item.region.scrollWidth > item.region.clientWidth + 1;
      item.hint.hidden = !overflowing;
      item.region.classList.toggle('has-horizontal-overflow', overflowing);
      if (overflowing) {
        item.region.setAttribute('tabindex', '0');
        item.region.setAttribute('role', 'region');
        item.region.setAttribute('aria-label', item.label + '，可左右滚动');
      } else {
        item.region.removeAttribute('tabindex');
        item.region.removeAttribute('role');
        item.region.removeAttribute('aria-label');
      }
    });
  }
  var scrollObserver = window.ResizeObserver ? new ResizeObserver(updateScrollRegions) : null;
  function addScrollRegion(region, block, label) {
    var hint = document.createElement('p');
    hint.className = 'scroll-hint';
    hint.textContent = '左右滑动查看完整' + label;
    hint.hidden = true;
    block.parentNode.insertBefore(hint, block);
    scrollRegions.push({ region: region, hint: hint, label: label });
    if (scrollObserver) {
      scrollObserver.observe(region);
      if (region.firstElementChild) scrollObserver.observe(region.firstElementChild);
    }
  }

  document.querySelectorAll('.article-body table').forEach(function (table) {
    if (table.closest('figure.highlight')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    var maxColumns = Array.prototype.reduce.call(table.rows, function (maximum, row) {
      var columns = Array.prototype.reduce.call(row.cells, function (total, cell) { return total + cell.colSpan; }, 0);
      return Math.max(maximum, columns);
    }, 0);
    wrapper.classList.toggle('has-wide-table', maxColumns >= 3);
    wrapper.style.setProperty('--table-columns', maxColumns);
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    addScrollRegion(wrapper, wrapper, '表格');
  });

  document.querySelectorAll('.article-body figure.highlight').forEach(function (figure) {
    var table = figure.querySelector('table');
    if (table) addScrollRegion(table, figure, '代码');
  });
  document.querySelectorAll('.article-body pre').forEach(function (pre) {
    if (!pre.closest('figure.highlight')) addScrollRegion(pre, pre, '代码');
  });
  updateScrollRegions();
  if (!scrollObserver) window.addEventListener('resize', updateScrollRegions);
  window.addEventListener('load', updateScrollRegions);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateScrollRegions);

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
    tip.setAttribute('role', 'status');
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
      var copying = navigator.clipboard
        ? navigator.clipboard.writeText(text.replace(/\n复制$/, ''))
        : Promise.reject(new Error('Clipboard unavailable'));
      copying.then(function () {
        tip.textContent = '已复制';
      }, function () {
        tip.textContent = '复制失败，请手动选择代码';
      }).then(function () {
        figure.classList.add('copy-visible', 'copy-done');
        clearTimeout(figure._copyTimer);
        figure._copyTimer = setTimeout(function () {
          figure.classList.remove('copy-done');
          if (!figure.matches(':hover')) figure.classList.remove('copy-visible');
        }, 1600);
      });
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
  var tocToggle;
  var setTocCollapsed;
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
        if (tocToggle && window.matchMedia('(max-width: 860px)').matches) {
          setTocCollapsed(true, false);
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
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
    tocToggle = document.createElement('button');
    tocToggle.className = 'toc-toggle';
    tocToggle.type = 'button';
    tocToggle.textContent = '目录';
    tocToggle.setAttribute('aria-label', '收起或展开文章目录');
    tocToggle.setAttribute('aria-expanded', 'true');
    tocCard.id = 'article-toc';
    tocToggle.setAttribute('aria-controls', tocCard.id);
    document.body.appendChild(tocToggle);
    setTocCollapsed = function (collapsed, restoreFocus) {
      tocCard.classList.toggle('is-collapsed', collapsed);
      if (postGrid) postGrid.classList.toggle('toc-collapsed', collapsed);
      tocToggle.setAttribute('aria-expanded', String(!collapsed));
      if (!window.matchMedia('(max-width: 860px)').matches) return;
      if (collapsed) {
        if (restoreFocus) tocToggle.focus({ preventScroll: true });
      } else {
        closePanels();
        var firstControl = tocCard.querySelector('input, a');
        if (firstControl) firstControl.focus({ preventScroll: true });
      }
    };
    setTocCollapsed(window.matchMedia('(max-width: 860px)').matches, false);
    tocToggle.addEventListener('click', function () {
      setTocCollapsed(!tocCard.classList.contains('is-collapsed'), true);
    });
    document.addEventListener('click', function (event) {
      if (window.matchMedia('(max-width: 860px)').matches && !tocCard.classList.contains('is-collapsed') && !tocCard.contains(event.target) && !tocToggle.contains(event.target)) {
        setTocCollapsed(true, tocCard.contains(document.activeElement));
      }
    }, true);
    document.addEventListener('keydown', function (event) {
      if (!event.defaultPrevented && !event.isComposing && event.key === 'Escape' && !tocCard.classList.contains('is-collapsed') && window.matchMedia('(max-width: 860px)').matches) {
        event.preventDefault();
        setTocCollapsed(true, true);
      }
    });
  }

  var backTop = document.createElement('button');
  backTop.className = 'back-top';
  backTop.type = 'button';
  backTop.textContent = '↑';
  backTop.setAttribute('aria-label', '返回顶部');
  document.body.appendChild(backTop);
  backTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  function updateBackTop() {
    backTop.classList.toggle('show', window.scrollY > 500);
    backTop.tabIndex = window.scrollY > 500 ? 0 : -1;
  }
  updateBackTop();
  window.addEventListener('scroll', updateBackTop, { passive: true });

})();
