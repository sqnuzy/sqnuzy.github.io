(function () {
  var library = document.querySelector('[data-library]');
  if (!library) return;
  var input = library.querySelector('[data-library-search]');
  var cards = Array.from(library.querySelectorAll('[data-library-card]'));
  var buttons = Array.from(library.querySelectorAll('[data-library-category]'));
  var category = '';

  function filter() {
    var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var count = 0;
    cards.forEach(function (card) {
      var metadata = card.dataset.keywords.toLowerCase();
      var headings = Array.from(card.querySelectorAll('[data-library-heading]'));
      var matching = headings.filter(function (heading) {
        var text = metadata + ' ' + heading.dataset.keywords.toLowerCase();
        heading.hidden = !terms.every(function (term) { return text.includes(term); });
        return !heading.hidden;
      });
      var matchesTitle = terms.every(function (term) { return metadata.includes(term); });
      card.hidden = (category && card.dataset.category !== category) || !(matchesTitle || matching.length);
      if (!card.hidden) count++;
      var outline = card.querySelector('details');
      if (outline && terms.length) outline.open = matching.length > 0;
      if (outline && !terms.length) outline.open = false;
    });
    library.querySelector('[data-library-count]').textContent = '显示 ' + count + ' / ' + cards.length + ' 篇文章';
    library.querySelector('[data-library-empty]').hidden = count !== 0;
  }

  input.addEventListener('input', filter);
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      category = button.dataset.libraryCategory;
      buttons.forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      filter();
    });
  });
})();
