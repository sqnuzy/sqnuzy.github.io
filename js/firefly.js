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
  var headings = Array.prototype.slice.call(document.querySelectorAll('.article-body h2, .article-body h3'));
  if (toc && headings.length) {
    toc.innerHTML = '';
    headings.forEach(function (heading, index) {
      if (!heading.id) heading.id = 'heading-' + index;
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent;
      link.className = heading.tagName.toLowerCase();
      toc.appendChild(link);
    });
    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a'));
    var setActiveToc = function () {
      var activeIndex = 0;
      headings.forEach(function (heading, index) {
        if (heading.getBoundingClientRect().top < 150) activeIndex = index;
      });
      tocLinks.forEach(function (link, index) {
        link.classList.toggle('active', index === activeIndex);
      });
    };
    setActiveToc();
    window.addEventListener('scroll', setActiveToc, { passive: true });
  } else if (toc) {
    var tocCard = toc.closest('.toc-card');
    if (tocCard) tocCard.hidden = true;
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

  var navbarSearchInput = document.querySelector('[data-navbar-search-input]');
  var navbarSearchOutput = document.querySelector('[data-navbar-search-results]');
  var navbarSearchPanel = document.querySelector('[data-panel="search"]');
  var navbarPosts = [];
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char];
    });
  }

  function openNavbarSearch() {
    if (!navbarSearchPanel) return;
    closePanels(navbarSearchPanel);
    navbarSearchPanel.hidden = false;
    navbarSearchPanel.classList.add('open');
  }

  function renderNavbarSearch(keyword) {
    if (!navbarSearchOutput) return;
    var query = keyword.trim().toLowerCase();
    if (!query) {
      navbarSearchOutput.innerHTML = '<p class="search-empty">输入关键词开始搜索。</p>';
      return;
    }

    var results = navbarPosts.filter(function (post) {
      return [post.title, post.content, post.tags, post.categories].join(' ').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 5);

    navbarSearchOutput.innerHTML = results.length ? results.map(function (post) {
      var title = escapeHtml(post.title || 'Untitled');
      var url = escapeHtml(post.url || '#');
      var text = escapeHtml((post.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 92));
      return '<a class="search-result" href="' + url + '"><strong>' + title + '</strong><span>' + text + '</span></a>';
    }).join('') : '<p class="search-empty">没有找到匹配结果。</p>';
  }

  if (navbarSearchInput && navbarSearchOutput) {
    fetch('/search.json')
      .then(function (res) { return res.json(); })
      .then(function (data) { navbarPosts = Array.isArray(data) ? data : []; })
      .catch(function () {
        navbarSearchOutput.innerHTML = '<p class="search-empty">搜索索引暂不可用。</p>';
      });

    navbarSearchInput.addEventListener('focus', function () {
      openNavbarSearch();
      renderNavbarSearch(navbarSearchInput.value);
    });
    navbarSearchInput.addEventListener('input', function () {
      openNavbarSearch();
      renderNavbarSearch(navbarSearchInput.value);
    });
  }

  var input = document.getElementById('search-input');
  var output = document.getElementById('search-results');
  if (!input || !output) return;

  var posts = [];
  fetch('/search.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      posts = Array.isArray(data) ? data : [];
      var initialQuery = new URLSearchParams(window.location.search).get('q') || '';
      if (initialQuery) {
        input.value = initialQuery;
        input.dispatchEvent(new Event('input'));
      }
    })
    .catch(function () {
      output.innerHTML = '<p class="search-empty">搜索索引暂不可用。</p>';
    });

  input.addEventListener('input', function () {
    var keyword = input.value.trim().toLowerCase();
    if (!keyword) {
      output.innerHTML = '';
      return;
    }

    var results = posts.filter(function (post) {
      return [post.title, post.content, post.tags, post.categories].join(' ').toLowerCase().indexOf(keyword) !== -1;
    }).slice(0, 12);

    output.innerHTML = results.length ? results.map(function (post) {
      var title = escapeHtml(post.title || '未命名文章');
      var url = escapeHtml(post.url || '#');
      var text = escapeHtml((post.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 120));
      return '<a class="search-result" href="' + url + '"><strong>' + title + '</strong><span>' + text + '</span></a>';
    }).join('') : '<p class="search-empty">没有找到匹配结果。</p>';
  });
})();
