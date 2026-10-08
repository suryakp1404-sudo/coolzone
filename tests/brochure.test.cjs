const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../assets/js/brochure-state.js');

for (const single of [false, true]) {
  const seen = new Set();
  let current = 1;
  for (let step = 0; step < model.total; step++) {
    model.pages(current, single).filter(Boolean).forEach(page => seen.add(page));
    if (current === model.total) break;
    const next = model.next(current, single);
    assert.ok(next > current, 'Forward navigation must make progress');
    current = next;
  }
  assert.equal(current, 16);
  assert.equal(seen.size, 16, 'Every brochure page must be reachable');
  for (let step = 0; step < model.total && current > 1; step++) current = model.previous(current, single);
  assert.equal(current, 1, 'Backwards navigation must return to the cover');
  assert.equal(model.previous(1, single), 1);
  assert.equal(model.next(16, single), 16);
  for (let page = 1; page <= model.total; page++) {
    assert.ok(model.pages(page, single).includes(page), 'Jumped-to page must be visible');
  }
}
assert.deepEqual(model.pages(1, false), [null, 1]);
assert.deepEqual(model.pages(3, false), [2, 3]);
assert.deepEqual(model.pages(16, false), [16, null]);
for (let page = 1; page <= 16; page++) {
  const file = path.join(__dirname, `../assets/img/brochure/page-${String(page).padStart(2, '0')}.jpg`);
  assert.ok(fs.statSync(file).size > 0);
}
for (const file of ['index.html', 'gallery.html', 'brochure.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(html, /href="brochure.html"[^>]*>Brochure<\/a>/);
  assert.doesNotMatch(html, /id="brochure"/);
  for (const match of html.matchAll(/(?:src|href)="(assets\/[^"?#]+)[^"\s]*"/g)) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', match[1])), `Missing asset: ${match[1]}`);
  }
}
console.log('PASS all 16 pages forward/backward, spread selection, boundaries, image assets and menu routes');
