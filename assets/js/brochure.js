(function () {
  'use strict';
  const reader = document.querySelector('#brochure-reader');
  if (!reader) return;
  const model = window.BrochurePages;
  const book = reader.querySelector('.flipbook');
  const previous = reader.querySelector('#book-previous');
  const next = reader.querySelector('#book-next');
  const picker = reader.querySelector('#book-page');
  const status = reader.querySelector('#book-status');
  const error = reader.querySelector('#book-error');
  const soundButton = reader.querySelector('#book-sound');
  const zoomButton = reader.querySelector('#book-zoom');
  const zoomDialog = document.querySelector('#brochure-zoom');
  const singleQuery = window.matchMedia('(max-width: 767px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const imageCache = new Map();
  let currentPage = 1;
  let busy = false;
  let generation = 0;
  let animation;
  let audioContext;
  let noiseBuffer;
  let soundEnabled = true;
  let gesture;
  let suppressClick = false;
  try { soundEnabled = localStorage.getItem('coolzone-brochure-sound') !== 'off'; } catch (_) {}

  const source = page => `assets/img/brochure/page-${String(page).padStart(2, '0')}.jpg`;
  const visiblePages = page => model.pages(page, singleQuery.matches);

  function imageFor(page) {
    const image = new Image();
    image.src = source(page);
    image.alt = `Cool Zone Air Systems brochure, page ${page} of ${model.total}`;
    image.width = 1200;
    image.height = 1698;
    image.draggable = false;
    return image;
  }

  function loadPage(page) {
    if (!page) return Promise.resolve();
    if (!imageCache.has(page)) {
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        const timer = window.setTimeout(() => reject(new Error('Page loading timed out')), 15000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('Page unavailable')); };
        image.src = source(page);
      }).catch(failure => { imageCache.delete(page); throw failure; });
      imageCache.set(page, promise);
    }
    return imageCache.get(page);
  }

  function sheet(page, className) {
    const element = document.createElement('div');
    element.className = className;
    if (page) element.append(imageFor(page));
    else element.classList.add('empty-page');
    return element;
  }

  function position(page) {
    book.dataset.position = singleQuery.matches ? 'single' : page === 1 ? 'front' : page === model.total ? 'back' : 'open';
  }

  function updateControls() {
    previous.disabled = busy || currentPage === 1;
    next.disabled = busy || currentPage === model.total;
    picker.disabled = busy;
    zoomButton.disabled = busy;
    picker.value = String(currentPage);
    const displayed = visiblePages(currentPage).filter(Boolean);
    status.textContent = busy ? 'Turning page…' : displayed.length === 2
      ? `Pages ${displayed[0]}–${displayed[1]} of ${model.total}`
      : `Page ${displayed[0]} of ${model.total}`;
    reader.querySelector('#book-progress').value = Math.max(...displayed);
    book.setAttribute('aria-busy', String(busy));
  }

  function render() {
    position(currentPage);
    const pages = visiblePages(currentPage);
    book.replaceChildren(...pages.map((page, index) => sheet(page, `book-page page-${index === 0 ? 'left' : 'right'}`)));
    updateControls();
    [model.next(currentPage, singleQuery.matches), model.previous(currentPage, singleQuery.matches)]
      .flatMap(visiblePages).filter(Boolean).forEach(page => loadPage(page).catch(() => {}));
  }

  function updateSound() {
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.querySelector('span').textContent = soundEnabled ? 'Sound on' : 'Sound off';
    soundButton.querySelector('i').className = `bi ${soundEnabled ? 'bi-volume-up' : 'bi-volume-mute'}`;
  }

  function unlockSound() {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) { /* Reading still works when browser audio is unavailable. */ }
  }

  function pageSound() {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    try {
      if (!noiseBuffer) {
        noiseBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.38), audioContext.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let previousSample = 0;
        for (let i = 0; i < data.length; i++) {
          previousSample = (previousSample + 0.35 * (Math.random() * 2 - 1)) / 1.35;
          data[i] = previousSample * (0.75 + 0.25 * Math.sin(i * 0.035));
        }
      }
      const sound = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const volume = audioContext.createGain();
      sound.buffer = noiseBuffer;
      filter.type = 'highpass';
      filter.frequency.value = 650;
      const now = audioContext.currentTime;
      volume.gain.setValueAtTime(0, now);
      volume.gain.linearRampToValueAtTime(0.34, now + 0.06);
      volume.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      sound.connect(filter).connect(volume).connect(audioContext.destination);
      sound.onended = () => { sound.disconnect(); filter.disconnect(); volume.disconnect(); };
      sound.start();
    } catch (_) {}
  }

  async function turnTo(page) {
    page = model.clamp(page);
    if (busy || page === currentPage) return;
    const focusedControl = document.activeElement;
    unlockSound(); // Must run in the original click/key gesture, before loading images.
    const shell = reader.querySelector('.reader-shell');
    const bounds = shell.getBoundingClientRect();
    if (bounds.height < window.innerHeight - 16 && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
      shell.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'instant' : 'smooth' });
    }
    const token = ++generation;
    busy = true;
    error.hidden = true;
    updateControls();
    const oldPages = visiblePages(currentPage);
    const newPages = visiblePages(page);
    try {
      await Promise.all([...oldPages, ...newPages].map(loadPage));
      if (token !== generation) return;
      const forward = page > currentPage;
      if (!reduceMotion.matches && typeof book.animate === 'function') {
        const single = singleQuery.matches;
        const basePages = single ? newPages : forward ? [oldPages[0], newPages[1]] : [newPages[0], oldPages[1]];
        book.replaceChildren(...basePages.map((number, index) => sheet(number, `book-page page-${index === 0 ? 'left' : 'right'}`)));
        const leaf = document.createElement('div');
        leaf.className = `turning-leaf ${forward ? 'turn-forward' : 'turn-backward'}${single ? ' single-leaf' : ''}`;
        leaf.setAttribute('aria-hidden', 'true');
        leaf.append(sheet(single ? oldPages[0] : forward ? oldPages[1] : oldPages[0], 'leaf-face leaf-front'));
        if (!single) leaf.append(sheet(forward ? newPages[0] : newPages[1], 'leaf-face leaf-back'));
        book.append(leaf);
        position(page);
        pageSound();
        animation = leaf.animate([
          { transform: 'rotateY(0deg)', filter: 'brightness(1)' },
          { transform: `rotateY(${forward ? -70 : 70}deg)`, filter: 'brightness(0.86)', offset: 0.45 },
          { transform: `rotateY(${(forward ? -1 : 1) * (single ? 105 : 180)}deg)`, filter: 'brightness(1)' }
        ],
        { duration: single ? 440 : 720, easing: 'cubic-bezier(.3,.05,.25,1)', fill: 'forwards' });
        await animation.finished;
      } else {
        pageSound();
      }
      if (token !== generation) return;
      currentPage = page;
    } catch (_) {
      if (token === generation) {
        error.textContent = 'This page could not load. Please try again, or use the PDF download below.';
        error.hidden = false;
      }
    } finally {
      if (token === generation) {
        animation = null;
        busy = false;
        render();
        if (reader.contains(focusedControl) && document.activeElement === document.body) {
          (focusedControl.disabled ? book : focusedControl).focus({ preventScroll: true });
        }
      }
    }
  }

  for (let page = 1; page <= model.total; page++) {
    picker.add(new Option(page === 1 ? '1 — Front cover' : page === model.total ? '16 — Back cover' : `Page ${page}`, String(page)));
  }
  previous.addEventListener('click', () => turnTo(model.previous(currentPage, singleQuery.matches)));
  next.addEventListener('click', () => turnTo(model.next(currentPage, singleQuery.matches)));
  picker.addEventListener('change', () => turnTo(Number(picker.value)));
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateSound();
    unlockSound();
    try { localStorage.setItem('coolzone-brochure-sound', soundEnabled ? 'on' : 'off'); } catch (_) {}
  });

  reader.addEventListener('keydown', event => {
    if (event.target.closest('select, input, dialog') || event.altKey || event.ctrlKey || event.metaKey) return;
    const destinations = {
      ArrowRight: model.next(currentPage, singleQuery.matches),
      ArrowLeft: model.previous(currentPage, singleQuery.matches),
      Home: 1,
      End: model.total
    };
    if (destinations[event.key] !== undefined) {
      event.preventDefault();
      turnTo(destinations[event.key]);
    }
  });

  book.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { x: event.clientX, y: event.clientY };
    suppressClick = false;
  });
  book.addEventListener('pointerup', event => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      suppressClick = true;
      turnTo(dx < 0 ? model.next(currentPage, singleQuery.matches) : model.previous(currentPage, singleQuery.matches));
    }
  });
  book.addEventListener('pointercancel', () => { gesture = null; });
  book.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; return; }
    const rect = book.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    turnTo(currentPage === 1 || ratio > (singleQuery.matches ? 0.3 : 0.5)
      ? model.next(currentPage, singleQuery.matches) : model.previous(currentPage, singleQuery.matches));
    book.focus({ preventScroll: true });
  });

  zoomButton.addEventListener('click', () => {
    zoomDialog.querySelector('.zoom-pages').replaceChildren(...visiblePages(currentPage).filter(Boolean).map(imageFor));
    zoomDialog.showModal();
  });
  zoomDialog.querySelector('button').addEventListener('click', () => zoomDialog.close());
  zoomDialog.addEventListener('close', () => zoomButton.focus({ preventScroll: true }));

  singleQuery.addEventListener('change', () => {
    generation++;
    if (animation) animation.cancel();
    animation = null;
    busy = false;
    render();
  });
  reader.querySelector('.reader-controls').hidden = false;
  reader.querySelector('.reader-tools').hidden = false;
  updateSound();
  render();
})();
