(function (root) {
  'use strict';
  const total = 16;
  const clamp = page => Math.max(1, Math.min(total, Number(page) || 1));
  const pages = (page, single) => {
    page = clamp(page);
    if (single) return [page];
    if (page === 1) return [null, 1];
    if (page === total) return [total, null];
    const left = Math.floor(page / 2) * 2;
    return [left, left + 1];
  };
  const next = (page, single) => {
    page = clamp(page);
    return clamp(single ? page + 1 : page === 1 ? 2 : Math.floor(page / 2) * 2 + 2);
  };
  const previous = (page, single) => {
    page = clamp(page);
    return clamp(single ? page - 1 : Math.floor(page / 2) * 2 - 2);
  };
  const model = { total, clamp, pages, next, previous };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.BrochurePages = model;
})(typeof window === 'undefined' ? globalThis : window);
