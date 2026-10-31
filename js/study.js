(function () {
  'use strict';
  var hub = document.querySelector('[data-study-hub]');
  var note = document.querySelector('[data-study-note]');
  if (!hub && !note) return;
  if (hub) {
    var cards = Array.from(hub.querySelectorAll('[data-study-card]'));
    var subject = '全部';
    var input = hub.querySelector('[data-study-search]');
    function renderFilter() {
      var query = input.value.trim().toLocaleLowerCase();
      var visible = 0;
      cards.forEach(function (card) {
        card.hidden = (subject !== '全部' && card.dataset.subject !== subject) || card.dataset.searchText.toLocaleLowerCase().indexOf(query) === -1;
        if (!card.hidden) visible++;
      });
      hub.querySelector('[data-study-result-count]').textContent = '共 ' + visible + ' 篇笔记';
      var empty = hub.querySelector('[data-study-empty]');
      empty.hidden = visible !== 0;
      empty.textContent = query ? '没有找到相符的笔记，试试其他关键词。' : subject === '全部' ? '暂时还没有复习笔记。' : subject + '还没有笔记。';
      hub.querySelectorAll('[data-study-subject]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.studySubject === subject));
      });
    }
    hub.querySelectorAll('[data-study-subject]').forEach(function (button) {
      button.addEventListener('click', function () {
        subject = button.dataset.studySubject;
        renderFilter();
      });
    });
    input.addEventListener('input', renderFilter);
    renderFilter();
  }

  if (note) {
    var tocButton = document.querySelector('.toc-toggle');
    function closeMobileToc() {
      if (window.matchMedia('(max-width: 860px)').matches && tocButton && tocButton.getAttribute('aria-expanded') === 'true') tocButton.click();
    }
    closeMobileToc();
    document.querySelectorAll('[data-toc] a').forEach(function (link) {
      link.addEventListener('click', closeMobileToc);
    });
    var toggle = note.querySelector('[data-review-toggle]');
    if (toggle) {
      var groups = [];
      var quiz = false;
      var quizStatus = note.querySelector('[data-quiz-status]');
      document.querySelectorAll('.article-body table').forEach(function (table) {
        var heading = table.querySelector('thead th');
        if (!heading || !table.tBodies.length) return;
        var title = heading.textContent.trim();
        var answerColumn = title === '中文' ? 1 : title === '单词' ? 0 : -1;
        if (answerColumn === -1) return;
        Array.from(table.tBodies[0].rows).forEach(function (row) {
          if (row.cells.length < 2) return;
          var group = { answers: [], revealed: false };
          Array.from(row.cells).forEach(function (cell, index) {
            if (index !== answerColumn && index !== 2) return;
            var content = document.createElement('div');
            content.setAttribute('data-study-answer', '');
            while (cell.firstChild) content.appendChild(cell.firstChild);
            cell.appendChild(content);
            group.answers.push(content);
          });
          var button = document.createElement('button');
          button.type = 'button';
          button.hidden = true;
          button.setAttribute('data-answer-toggle', '');
          button.setAttribute('aria-expanded', 'false');
          button.addEventListener('click', function () {
            group.revealed = !group.revealed;
            renderAnswers();
          });
          row.cells[answerColumn].prepend(button);
          group.button = button;
          groups.push(group);
        });
      });
      function renderAnswers() {
        groups.forEach(function (group) {
          group.answers.forEach(function (answer) { answer.hidden = quiz && !group.revealed; });
          group.button.hidden = !quiz;
          group.button.textContent = group.revealed ? '收起答案' : '查看答案';
          group.button.setAttribute('aria-expanded', String(group.revealed));
        });
        quizStatus.hidden = !quiz;
        quizStatus.textContent = '看中文回忆英文，逐行点击核对：' + groups.filter(function (group) { return group.revealed; }).length + ' / ' + groups.length + '。';
      }
      toggle.hidden = groups.length === 0;
      toggle.addEventListener('click', function () {
        quiz = !quiz;
        groups.forEach(function (group) { group.revealed = false; });
        toggle.setAttribute('aria-pressed', String(quiz));
        toggle.textContent = quiz ? '退出自测，显示全文' : '遮住答案自测';
        renderAnswers();
      });
    }
  }
}());
