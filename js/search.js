(function () {
  var script = document.currentScript;
  var indexUrl = script.dataset.index;
  var searchPage = script.dataset.searchPage;
  var catalogPromise;

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(indexUrl).then(function (response) {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      }).then(function (posts) {
        if (!Array.isArray(posts)) throw new Error('Invalid search index');
        return posts;
      }).catch(function (error) {
        catalogPromise = null;
        throw error;
      });
    }
    return catalogPromise;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function highlight(value, terms) {
    var text = String(value || '');
    var lower = text.toLowerCase();
    var output = '';
    var cursor = 0;
    while (cursor < text.length) {
      var next = text.length;
      var length = 0;
      terms.forEach(function (term) {
        var index = lower.indexOf(term, cursor);
        if (index !== -1 && (index < next || (index === next && term.length > length))) {
          next = index;
          length = term.length;
        }
      });
      output += escapeHtml(text.slice(cursor, next));
      if (!length) break;
      output += '<mark>' + escapeHtml(text.slice(next, next + length)) + '</mark>';
      cursor = next + length;
    }
    return output;
  }

  function snippet(text, terms) {
    text = text || '';
    var positions = terms.map(function (term) { return text.toLowerCase().indexOf(term); }).filter(function (index) { return index >= 0; });
    var start = Math.max(0, (positions.length ? Math.min.apply(null, positions) : 0) - 40);
    return (start ? '…' : '') + text.slice(start, start + 160) + (text.length > start + 160 ? '…' : '');
  }

  function matches(text, terms) {
    text = text.toLowerCase();
    return terms.every(function (term) { return text.includes(term); });
  }

  function search(posts, terms) {
    var results = [];
    posts.forEach(function (post) {
      var metadata = [post.title, post.description, post.categories.join(' '), post.tags.join(' ')].join(' ');
      if (matches(metadata, terms)) {
        results.push({ title: post.title, url: post.url, context: post.categories.join(' / '), text: post.description || post.intro, score: matches(post.title, terms) ? 100 : 80 });
      }
      if (post.intro && !matches(metadata, terms) && matches(metadata + ' ' + post.intro, terms)) {
        results.push({ title: post.title, url: post.url, context: post.categories.join(' / '), text: post.intro, score: 20 });
      }
      post.sections.forEach(function (section) {
        if (!matches(metadata + ' ' + section.title + ' ' + section.text, terms)) return;
        results.push({ title: section.title, url: post.url + '#' + encodeURIComponent(section.id), context: post.title, text: section.text, score: matches(section.title, terms) ? 90 : 30 });
      });
    });
    var perPost = {};
    return results.sort(function (a, b) { return b.score - a.score; }).filter(function (result) {
      var key = result.url.split('#')[0];
      perPost[key] = (perPost[key] || 0) + 1;
      return perPost[key] <= 3;
    });
  }

  function connect(input, output, limit, navbar) {
    if (!input || !output) return;
    var version = 0;
    var timer;

    function render() {
      var current = ++version;
      var query = input.value.trim();
      var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!navbar) {
        var url = new URL(window.location.href);
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        window.history.replaceState(null, '', url);
      }
      if (!terms.length) {
        output.innerHTML = '<p class="search-empty">输入关键词开始搜索。</p>';
        return;
      }
      output.innerHTML = '<p class="search-empty">正在加载搜索索引…</p>';
      loadCatalog().then(function (posts) {
        if (current !== version) return;
        var results = search(posts, terms);
        var shown = results.slice(0, limit);
        output.innerHTML = shown.length ? shown.map(function (result) {
          return '<a class="search-result" href="' + escapeHtml(result.url) + '"><strong>' + highlight(result.title, terms) + '</strong><small class="search-context">' + highlight(result.context, terms) + '</small><span>' + highlight(snippet(result.text, terms), terms) + '</span></a>';
        }).join('') : '<p class="search-empty">没有找到匹配结果。试试更短的关键词。</p>';
        if (shown.length && !navbar) {
          output.insertAdjacentHTML('afterbegin', '<p class="search-status">显示 ' + shown.length + ' 条结果，每篇最多显示 3 条。可进入文章后筛选目录。</p>');
        }
        if (navbar) {
          output.insertAdjacentHTML('beforeend', '<a class="search-more" href="' + escapeHtml(searchPage + '?q=' + encodeURIComponent(query)) + '">打开完整搜索 →</a>');
        }
      }).catch(function () {
        if (current === version) output.innerHTML = '<p class="search-empty">搜索索引暂不可用，请稍后重试。</p>';
      });
    }

    input.addEventListener('input', function () {
      version++;
      clearTimeout(timer);
      timer = setTimeout(render, 120);
    });
    if (navbar) {
      var panel = document.querySelector('[data-panel="search"]');
      function open() {
        document.querySelectorAll('[data-panel]').forEach(function (other) {
          other.hidden = other !== panel;
          other.classList.toggle('open', other === panel);
        });
        document.querySelectorAll('[data-panel-toggle]').forEach(function (button) { button.classList.remove('active'); });
      }
      input.addEventListener('focus', function () { open(); render(); });
      input.addEventListener('input', open);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { panel.hidden = true; panel.classList.remove('open'); input.blur(); }
      });
    } else {
      input.value = new URLSearchParams(window.location.search).get('q') || '';
      render();
    }
  }

  connect(document.querySelector('[data-navbar-search-input]'), document.querySelector('[data-navbar-search-results]'), 5, true);
  connect(document.getElementById('search-input'), document.getElementById('search-results'), 12, false);
})();
