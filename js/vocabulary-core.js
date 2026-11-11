(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VocabularyReviewCore = factory();
}(typeof window === 'object' ? window : this, function () {
  'use strict';
  var DAY = 86400000;
  var INTERVALS = [1, 3, 7, 14, 30, 60, 90];
  var DAILY_LIMIT = 100;
  var FIELDS = ['interval_step', 'last_reviewed_on', 'last_reviewed_at', 'next_review_on', 'last_rating', 'review_count', 'lapse_count', 'same_day_retest_pending', 'updated_at'];

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
    if (!result.next_review_on && word.first_learned_on) result.next_review_on = word.first_learned_on;
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
    var firstReview = !current.last_reviewed_on && current.review_count === 0 && step === 0;
    if (rating === 'forgotten') step = 0;
    else if (!sameDay && !firstReview) step = Math.max(0, Math.min(INTERVALS.length - 1, step + (rating === 'remembered' ? 1 : -1)));
    return {
      interval_step: step,
      last_reviewed_on: day,
      last_reviewed_at: at === undefined ? Date.now() : Number(at),
      next_review_on: sameDay && rating !== 'forgotten' ? current.next_review_on : addDays(day, INTERVALS[step]),
      last_rating: rating,
      review_count: current.review_count + (sameDay ? 0 : 1),
      lapse_count: current.lapse_count + (rating === 'forgotten' && !sameDay ? 1 : 0),
      same_day_retest_pending: rating === 'forgotten' || (sameDay && current.same_day_retest_pending && rating === 'hesitant'),
      updated_at: Math.max(at === undefined ? Date.now() : Number(at), (current.updated_at || 0) + 1, (word.progress_updated_at || 0) + 1)
    };
  }
  function oldestFirst(a, b) {
    return String(a.last_reviewed_on || '').localeCompare(String(b.last_reviewed_on || '')) ||
      (a.last_reviewed_at || a.updated_at || 0) - (b.last_reviewed_at || b.updated_at || 0) ||
      String(a.added_on || a.first_learned_on).localeCompare(String(b.added_on || b.first_learned_on)) || a.id.localeCompare(b.id);
  }
  function mergeDailyBatches(first, second) {
    if (!first || !Array.isArray(first.ids)) return second && Array.isArray(second.ids) ? second : null;
    if (!second || !Array.isArray(second.ids)) return first;
    var preferred;
    if (first.day !== second.day) preferred = first.day > second.day ? first : second;
    else if (first.created_at !== second.created_at) preferred = first.created_at < second.created_at ? first : second;
    else if (first.ids.length !== second.ids.length) preferred = first.ids.length > second.ids.length ? first : second;
    else preferred = first.ids.join('|') <= second.ids.join('|') ? first : second;
    var carry = {};
    function keep(id, day) { if (!carry[id] || day < carry[id]) carry[id] = day; }
    [first, second].forEach(function (batch) {
      Object.keys(batch.carry || {}).forEach(function (id) { keep(id, batch.carry[id]); });
      if (batch.day < preferred.day) batch.ids.forEach(function (id) { keep(id, batch.day); });
    });
    var ordered = {};
    Object.keys(carry).sort().forEach(function (id) { ordered[id] = carry[id]; });
    return { day: preferred.day, ids: preferred.ids.slice(0, DAILY_LIMIT), created_at: preferred.created_at, carry: ordered };
  }
  function selectDaily(words, progress, at, previous) {
    var day = reviewDay(at);
    if (previous && previous.day > day) return previous;
    var all = words.map(function (word) { return state(word, progress); });
    var byId = new Map(all.map(function (word) { return [word.id, word]; }));
    var carry = Object.assign({}, previous && previous.carry);
    if (previous && previous.day < day) previous.ids.forEach(function (id) {
      if (!carry[id] || previous.day < carry[id]) carry[id] = previous.day;
    });
    Object.keys(carry).forEach(function (id) {
      var word = byId.get(id);
      if (!word || (word.last_reviewed_on && word.last_reviewed_on >= carry[id])) delete carry[id];
    });
    var ids = previous && previous.day === day ? previous.ids.filter(function (id) { return byId.has(id); }).slice(0, DAILY_LIMIT) : [];
    var chosen = new Set(ids);
    all.filter(function (word) {
      return word.first_learned_on && word.first_learned_on <= day && !chosen.has(word.id);
    }).sort(oldestFirst).slice(0, DAILY_LIMIT - ids.length).forEach(function (word) { ids.push(word.id); });
    var ordered = {};
    Object.keys(carry).sort().forEach(function (id) { ordered[id] = carry[id]; });
    return { day: day, ids: ids, created_at: previous && previous.day === day ? previous.created_at : (at === undefined ? Date.now() : Number(at)), carry: ordered };
  }
  function plan(words, progress, at, previousBatch) {
    var day = reviewDay(at);
    var all = words.map(function (word) { return state(word, progress); });
    var batch = selectDaily(words, progress, at, previousBatch);
    var selected = new Set(batch.day === day ? batch.ids : []);
    var due = all.filter(function (word) {
      if (!word.first_learned_on || word.first_learned_on > day) return false;
      var scheduled = (word.last_reviewed_on || word.review_count > 0) && word.next_review_on <= day;
      var carried = batch.carry[word.id] && batch.carry[word.id] <= day;
      return word.same_day_retest_pending || scheduled || carried || (selected.has(word.id) && word.last_reviewed_on !== day);
    }).sort(oldestFirst);
    var pending = new Set(due.map(function (word) { return word.id; }));
    var extraCandidates = all.filter(function (word) {
      return word.first_learned_on && word.first_learned_on <= day && word.last_reviewed_on !== day && !selected.has(word.id) && !pending.has(word.id);
    }).sort(oldestFirst);
    var upcoming = all.filter(function (word) { return word.first_learned_on && word.next_review_on > day; });
    var next = upcoming.map(function (word) { return word.next_review_on; }).sort()[0] || null;
    if (all.some(function (word) { return word.first_learned_on && word.first_learned_on <= day; })) {
      var tomorrow = addDays(day, 1);
      if (!next || tomorrow < next) next = tomorrow;
    }
    return {
      day: day,
      due: due,
      completed: all.filter(function (word) { return word.last_reviewed_on === day && !word.same_day_retest_pending; }).length,
      next: next,
      total: all.length,
      daily_batch: batch,
      rotation_total: selected.size,
      extra_candidates: extraCandidates,
      extra_due: due.filter(function (word) { return !selected.has(word.id); }).length
    };
  }
  return { intervals: INTERVALS, dailyLimit: DAILY_LIMIT, reviewDay: reviewDay, addDays: addDays, nextRollover: nextRollover, state: state, mergeProgress: mergeProgress, mergeDailyBatches: mergeDailyBatches, feedback: feedback, selectDaily: selectDaily, plan: plan };
}));
