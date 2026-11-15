/* Gloss: the home page. A little JavaScript, no libraries, no requests to anywhere else.
   1. Option or Alt, by platform, and key caps that light while you hold the key.
   2. The copy button.   3. The before-and-after pane.   4. Repaint: hold the badge for the original.
   5. The demo film, only if the frame asks for one (data-demo).
   6. Real refraction in Chrome, on the dock (assets/glass.js is the extension's own script).
   7. On a phone, the big button sends the page to a computer instead of downloading a zip.
   8. The page, glossed: hold Option and drag. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* 1. the key is Option on a Mac and Alt everywhere else */
  var ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
  var mac = /mac|iphone|ipad/i.test(ua);
  if (!mac) {
    $$('[data-key]').forEach(function (n) { n.textContent = 'Alt'; });
    $$('[data-shift]').forEach(function (n) { n.textContent = 'Shift'; });
    $$('[data-key-note]').forEach(function (n) { n.textContent = 'On a Mac the key is Option.'; });
  }
  /* the caps light when the real keys are down */
  function held(e) { root.classList.toggle('opt-held', !!e.altKey); root.classList.toggle('shift-held', !!e.shiftKey); }
  window.addEventListener('keydown', held); window.addEventListener('keyup', held);
  window.addEventListener('blur', function () { root.classList.remove('opt-held', 'shift-held'); });

  /* 2. copy chrome://extensions (a web page is not allowed to link to it) */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var code = document.getElementById(b.getAttribute('data-copy')), text = code.textContent;
      var done = function (ok) {
        if (!ok) { try { window.getSelection().selectAllChildren(code); } catch (e) {} }   // no clipboard (a plain http page, say): select it, so Cmd-C or Ctrl-C works
        b.textContent = ok ? 'Copied' : 'Selected'; setTimeout(function () { b.textContent = 'Copy'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });

  /* 3. before and after: the range input lies over the picture and moves the pane */
  $$('.ba').forEach(function (ba) {
    var input = $('input', ba);
    var set = function () { ba.style.setProperty('--pos', input.value + '%'); input.setAttribute('aria-valuetext', 'As it is: the left ' + input.value + '%. With Gloss: the rest.'); };
    input.addEventListener('input', set); set();
  });

  /* 4. repaint: press and hold the badge to see the original underneath, as in Gloss */
  var rp = $('#repaint'), hold = $('#hold');
  if (rp && hold) {
    var lab = hold.querySelector('.blue > span');
    var orig = function (v) { rp.classList.toggle('orig', v); hold.classList.toggle('lit', v); hold.setAttribute('aria-pressed', String(v)); lab.textContent = v ? 'Original' : 'AI repaint'; };
    hold.addEventListener('pointerdown', function (e) { if (e.altKey) return; try { hold.setPointerCapture(e.pointerId); } catch (x) {} orig(true); });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(function (n) { hold.addEventListener(n, function () { orig(false); }); });
    hold.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); orig(true); } });
    hold.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') orig(false); });
    hold.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* 5. the demo film. Nothing is asked for unless the frame carries data-demo="demo.mp4".
        Then the film plays over the still, muted and looped, with a pause button; with reduced motion it waits for the button. */
  var frame = $('#demo'), filmSrc = frame && frame.getAttribute('data-demo');
  if (filmSrc) {
    var screen = $('.screen', frame), film = document.createElement('video'), btn = document.createElement('button');
    film.muted = true; film.loop = true; film.playsInline = true; film.setAttribute('muted', ''); film.setAttribute('playsinline', '');
    film.preload = calm ? 'metadata' : 'auto';
    film.setAttribute('aria-label', 'A short film of Gloss in use: a box is dragged over a sign in Street View and the answer appears beside it.');
    btn.type = 'button'; btn.className = 'playpause';
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path class="i-pause" d="M3 2h3.5v12H3zM9.5 2H13v12H9.5z"/><path class="i-play" d="M4 2l10 6-10 6z"/></svg>';
    var show = function (playing) {
      $('.i-pause', btn).style.display = playing ? '' : 'none'; $('.i-play', btn).style.display = playing ? 'none' : '';
      btn.setAttribute('aria-label', playing ? 'Pause the film' : 'Play the film');
    };
    var play = function () { screen.classList.add('playing'); var p = film.play(); if (p && p.then) p.then(function () { show(true); }, function () { show(false); }); else show(true); };
    film.addEventListener('loadedmetadata', function () {
      screen.appendChild(btn);
      if (calm) { show(false); return; }
      /* the still (demo.jpg) is the film's moment at data-from seconds: start there, so the still turns into the film without a jump (the loop then restarts from the top) */
      var from = parseFloat(frame.getAttribute('data-from'));
      if (from > 0 && from < film.duration - 1) { try { film.currentTime = from; } catch (e) { /* start from the top */ } }
      play();
    }, { once: true });
    film.addEventListener('error', function () { film.remove(); btn.remove(); screen.classList.remove('playing'); });
    btn.addEventListener('click', function () { if (film.paused) play(); else { film.pause(); show(false); } });
    screen.insertBefore(film, $('.credit', screen));
    film.src = filmSrc;
  }

  /* 6. real refraction, in Chrome only: the extension's own filter (assets/glass.js). Everywhere else the glass is plain frost.
        Add ?plainglass to the address to see the page without it. */
  var chromium = !/[?&]plainglass/.test(location.search) && /Chrom(e|ium)\//.test(navigator.userAgent) && !!(window.CSS && CSS.supports && CSS.supports('backdrop-filter', 'blur(1px)'));
  function refract(el) {
    if (!chromium || !window.PAAGlass || !window.ResizeObserver) return;
    try { window.PAAGlass.apply(el); window.PAAGlass.watch(el); if (el.__paaGlass) el.classList.add('fit'); } catch (e) {}
  }
  function unrefract(el) { if (window.PAAGlass) { try { window.PAAGlass.forget(el); } catch (e) {} } }
  var dock = $('#dock'); if (dock) refract(dock);

  /* 7. a phone cannot run Gloss, and a zip is no use there. Where the screen is touch only, the big buttons send
        this page to a computer instead (the share sheet, or failing that the link is copied). The zip stays one tap away. */
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var canShare = !!navigator.share, canCopy = !!(navigator.clipboard && navigator.clipboard.writeText);
  if (mq('(hover: none) and (pointer: coarse)') && (canShare || canCopy)) {
    root.classList.add('touch');
    $$('[data-send]').forEach(function (b) {
      var t = $('.t', b), say = t.textContent;
      var copied = function () { t.textContent = 'Link copied'; setTimeout(function () { t.textContent = say; }, 1800); };
      b.addEventListener('click', function () {
        var url = location.href.split('#')[0];
        if (canShare) navigator.share({ title: 'Gloss', url: url }).catch(function () {});
        else navigator.clipboard.writeText(url).then(copied, function () {});
      });
    });
  }

  /* 8. the page, glossed. Hold Option and drag a box (or click, or add Shift to type a question).
        It is a practice range: the page only knows about itself, and says so. */
  if (!mq('(hover: hover) and (pointer: fine)')) return;
  root.classList.add('sg-on');

  var layer = document.createElement('div'); layer.id = 'sg'; layer.setAttribute('aria-live', 'polite');
  document.body.appendChild(layer);
  var notes = [];           // { els: [...] }
  var drag = null, usedAlt = false, openCard = null;
  var DROP = '<img class="drop" src="assets/gloss-16.svg" width="13" height="13" alt="">';
  var RIGGED = 'This page uses preset answers about itself. In Street View, Gloss reads any area you select.';

  function el(tag, cls, html) { var n = document.createElement(tag); n.className = cls; if (html != null) n.innerHTML = html; layer.appendChild(n); return n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mid(x, half) { var w = root.clientWidth; return Math.max(half, Math.min(w - half, x)); }
  function place(n, x, y) { n.style.left = mid(x, 90) + 'px'; n.style.top = y + 'px'; }
  function drop(n) { unrefract(n); n.remove(); }

  var CLOUD = { head: 'A cloud', note: 'Water, mostly. Nothing is written on it.', thing: true };
  function cloudAt(cx, cy) {   // the clouds are drawn behind the page and take no clicks, so they are found by where they are
    return $$('.cloud').some(function (c) { var r = c.getBoundingClientRect(); return r.width > 0 && cx > r.left + r.width * .1 && cx < r.right - r.width * .1 && cy > r.top + r.height * .14 && cy < r.bottom - r.height * .06; });
  }
  function about(cx, cy) {   // what the page says about the thing at this point (viewport coordinates)
    var hits = document.elementsFromPoint ? document.elementsFromPoint(cx, cy) : [document.elementFromPoint(cx, cy)];
    for (var i = 0; i < hits.length; i++) {
      if (!hits[i] || layer.contains(hits[i])) continue;
      var owner = hits[i].closest('[data-gloss]');
      if (owner && owner.id === 'top' && cloudAt(cx, cy)) return CLOUD;   // the hero itself is sky: is this bit of it a cloud?
      if (owner) { var p = owner.getAttribute('data-gloss').split('|'); return { head: p[0], note: p[1] || '', thing: true }; }
      var h = hits[i].closest('h2, h3');
      if (h) return { head: h.textContent.trim(), note: 'A heading on this page.', thing: false };
      var sec = hits[i].closest('section[id]');
      if (sec) { var t = $('h2', sec); return { head: t ? t.textContent.trim() : 'Gloss', note: 'A part of this page.', thing: false }; }
    }
    return cloudAt(cx, cy) ? CLOUD : { head: 'A web page about Gloss', note: '', thing: true };
  }

  function closeCard() { if (openCard) { drop(openCard); openCard = null; } }
  function card(pill, a) {
    closeCard();
    var c = el('div', 'g sgcard appear', '<div class="blue"><h4>' + esc(a.head) + '</h4><p>' + esc((a.note ? a.note + ' ' : '') + RIGGED) + '</p></div>');
    c.style.left = mid(parseFloat(pill.style.left), 175) + 'px'; c.style.top = (parseFloat(pill.style.top) + 42) + 'px';
    openCard = c; c.owner = pill;
    refract(c);
  }

  function finish(box, a, isRing) {   // box in page coordinates
    var cx = box.x + box.w / 2, below = box.y + box.h + 10;
    var chip = el('span', 'g pill appear', '<span class="blue"><span class="dots"><b></b><b></b><b></b></span><span>Reading</span></span>');
    place(chip, cx, below);
    var note = notes[notes.length - 1];
    note.els.push(chip);
    setTimeout(function () {
      if (!chip.isConnected) return;
      chip.remove();
      if (note.mark) { note.mark.classList.remove('reading'); if (!isRing) note.mark.classList.add('quiet'); }
      var pill = el('button', 'g pill appear' + (a.thing ? ' thing' : ''), '<span class="blue">' + DROP + '<span>' + esc(a.head) + '</span></span>');
      pill.type = 'button'; place(pill, cx, below);
      pill.addEventListener('click', function () { if (openCard && openCard.owner === pill) closeCard(); else card(pill, a); });
      note.els.push(pill);
      if (notes.length === 1 || a.asked) card(pill, a);   // the first one opens by itself, so the joke is explained once; so does an answer to a question
    }, calm ? 250 : 900);
  }

  function start(e) {
    if (!e.altKey || e.button !== 0) return;
    if (layer.contains(e.target) && e.target.closest('input')) return;
    e.preventDefault(); usedAlt = true; closeCard();
    drag = { x0: e.pageX, y0: e.pageY, shift: e.shiftKey, mark: el('span', 'mark', '<i></i><i></i><i></i><i></i>'), moved: false };
    root.classList.add('sg-drag');
    size(e);
  }
  function size(e) {
    if (!drag) return;
    var x = Math.min(drag.x0, e.pageX), y = Math.min(drag.y0, e.pageY), w = Math.abs(e.pageX - drag.x0), h = Math.abs(e.pageY - drag.y0);
    if (w > 6 || h > 6) drag.moved = true;
    drag.box = { x: x, y: y, w: w, h: h };
    var s = drag.mark.style; s.left = x + 'px'; s.top = y + 'px'; s.width = w + 'px'; s.height = h + 'px';
  }
  function end(e) {
    if (!drag) return;
    size(e);
    var d = drag; drag = null;
    root.classList.remove('sg-drag');
    var note = { els: [d.mark], mark: d.mark }; notes.push(note);
    while (notes.length > 8) notes.shift().els.forEach(function (n) { if (n === openCard) openCard = null; drop(n); });
    var sx = window.scrollX, sy = window.scrollY, box = d.box, isRing = !d.moved;
    if (isRing) {            // Option-click: "this thing here"
      d.mark.className = 'ring appear'; d.mark.innerHTML = '';
      d.mark.style.cssText = 'left:' + (d.x0 - 15) + 'px;top:' + (d.y0 - 15) + 'px';
      box = { x: d.x0 - 15, y: d.y0 - 15, w: 30, h: 30 };
    }
    var a = about(box.x + box.w / 2 - sx, box.y + box.h / 2 - sy);
    if (d.shift && !isRing) {  // Option-Shift-drag: type a question
      var ask = el('form', 'g sgask appear', '<span class="blue"><input type="text" placeholder="Ask about this" aria-label="Your question" maxlength="80"></span>');
      place(ask, mid(box.x + box.w / 2, 160), box.y + box.h + 10);
      note.els.push(ask);
      var input = $('input', ask); input.focus({ preventScroll: true });
      ask.addEventListener('submit', function (ev) {
        ev.preventDefault(); var q = input.value.trim(); ask.remove();
        d.mark.classList.add('reading');
        finish(box, { head: a.head, note: q ? 'You asked: “' + q + '” A fair question. I cannot answer it from here.' : a.note, thing: a.thing, asked: true }, false);
      });
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); note.els.forEach(function (n) { n.remove(); }); notes.splice(notes.indexOf(note), 1); } });
      return;
    }
    if (!isRing) d.mark.classList.add('reading');
    finish(box, a, isRing);
  }

  document.addEventListener('mousedown', start, true);
  document.addEventListener('mousemove', size, true);
  document.addEventListener('mouseup', end, true);
  // an Option-click must not follow a link (Chrome would download it), and Alt must not open the menu bar on Windows
  document.addEventListener('click', function (e) { if (e.altKey && !layer.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('keyup', function (e) { if (e.key === 'Alt' && usedAlt) { e.preventDefault(); usedAlt = false; } });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (openCard) { closeCard(); return; }
    notes.forEach(function (n) { n.els.forEach(drop); }); notes = [];
  });
  document.addEventListener('mousedown', function (e) { if (!e.altKey && openCard && !layer.contains(e.target)) closeCard(); });
})();
