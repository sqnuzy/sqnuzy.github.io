(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VocabularyReviewCore = factory();
}(typeof window === 'object' ? window : this, function () {
  'use strict';
  var DAY = 86400000;
  var INTERVALS = [1, 3, 7, 14, 30, 60, 90];
  var FIELDS = ['interval_step', 'last_reviewed_on', 'next_review_on', 'last_rating', 'review_count', 'lapse_count', 'same_day_retest_pending', 'updated_at'];

  // 北京时间 UTC+8，复习日从 05:00 起算，与浏览器自身时区无关。
  function reviewDay(at) {
    return new Date((at === undefined ? Date.now() : Number(at)) + 3 * 3600000).toISOString().slice(0, 10);
  }
  function addDays(day, count) {
    return new Date(Date.parse(day + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10);
  }
  function nextRollover(at) {
    return Date.parse(addDays(reviewDay(at), 1) + 'T05:00:00+08:00');
  }
  function state(word, progress) {
    var result = Object.assign({ interval_step: 0, review_count: 0, lapse_count: 0, same_day_retest_pending: false }, word);
    if (!result.next_review_on && word.first_learned_on) result.next_review_on = addDays(word.first_learned_on, 1);
    var saved = progress && progress[word.id];
    if (saved && saved.updated_at > (word.progress_updated_at || 0)) {
      FIELDS.forEach(function (key) { if (saved[key] !== undefined) result[key] = saved[key]; });
    }
    return result;
  }
  function mergeProgress(first, second) {
    var merged = Object.assign({}, first);
    Object.keys(second || {}).forEach(function (id) {
      var item = second[id];
      if (!item || !Number.isFinite(item.updated_at)) return;
      if (!merged[id] || item.updated_at > merged[id].updated_at) merged[id] = item;
    });
    return merged;
  }
  function feedback(word, progress, rating, at) {
    if (['remembered', 'hesitant', 'forgotten'].indexOf(rating) === -1) throw new Error('无效的复习反馈');
    var current = state(word, progress);
    var day = reviewDay(at);
    var sameDay = current.last_reviewed_on === day;
    var step = current.interval_step;
    if (rating === 'forgotten') step = 0;
    else if (!sameDay) step = Math.max(0, Math.min(INTERVALS.length - 1, step + (rating === 'remembered' ? 1 : -1)));
    return {
      interval_step: step,
      last_reviewed_on: day,
      next_review_on: sameDay && rating !== 'forgotten' ? current.next_review_on : addDays(day, INTERVALS[step]),
      last_rating: rating,
      review_count: current.review_count + (sameDay ? 0 : 1),
      lapse_count: current.lapse_count + (rating === 'forgotten' && !sameDay ? 1 : 0),
      same_day_retest_pending: rating === 'forgotten' || (sameDay && current.same_day_retest_pending && rating === 'hesitant'),
      updated_at: Math.max(at === undefined ? Date.now() : Number(at), (current.updated_at || 0) + 1, (word.progress_updated_at || 0) + 1)
    };
  }
  function plan(words, progress, at) {
    var day = reviewDay(at);
    var all = words.map(function (word) { return state(word, progress); });
    var due = all.filter(function (word) {
      return word.first_learned_on && (word.same_day_retest_pending || word.next_review_on <= day);
    }).sort(function (a, b) {
      return Number(b.same_day_retest_pending) - Number(a.same_day_retest_pending) ||
        String(a.next_review_on).localeCompare(String(b.next_review_on)) ||
        Number(b.last_rating === 'forgotten') - Number(a.last_rating === 'forgotten') || a.id.localeCompare(b.id);
    });
    var upcoming = all.filter(function (word) { return word.first_learned_on && word.next_review_on > day; });
    return {
      day: day,
      due: due,
      completed: all.filter(function (word) { return word.last_reviewed_on === day && !word.same_day_retest_pending; }).length,
      next: upcoming.map(function (word) { return word.next_review_on; }).sort()[0] || null,
      total: all.length
    };
  }
  return { intervals: INTERVALS, reviewDay: reviewDay, addDays: addDays, nextRollover: nextRollover, state: state, mergeProgress: mergeProgress, feedback: feedback, plan: plan };
}));
