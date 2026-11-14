/* GLOSS glass: real refraction for an element, using an SVG filter as its backdrop filter (Chrome only, which is all
   an extension needs). The filter does these things to the picture behind the element:
     1. bends it inside a bevel around the edge (feDisplacementMap driven by a map drawn here for the element's exact
        size, corner radius and bevel width), with a little colour fringing where the bend is strongest. The bevel looks
        INWARD: at the edge it shows a squeezed copy of what lies just inside the rim, like a convex lens. (It cannot look
        outward: Chrome gives a backdrop filter nothing outside the element's own box, and the colour-fringing path turns
        that nothing into solid black) (optional:
        the red, green and blue are bent by slightly different amounts, as in real glass);
     2. frosts it inside the bevel (feGaussianBlur, kept only in the core by a mask).
   The rest of the look (tint, rim, sheen) is CSS: design/glass.css. An element opts in with the class "lg" and sets
   --r (corner radius), --bevel (width of the clear edge) and, if it wants, --bend (how far the bevel looks inward, in bevels,
   default 3.2), --frost (blur of the core in px, default 12) and --disperse (colour fringing, 0 to .3, default 0), --dim (how much the core darkens the street, default .46), --aqua (how blue the filtered street is, 0 to 1, default 1) and --paa-sat (default 2.4).
   The saturation of the whole result (--paa-sat, default 2.4) is done INSIDE the filter, as its last step: a CSS saturate() after url(#id) in
   the same backdrop-filter list is a second pass, and with 39 captions showing it halved the frame rate (measured, live-1a s10).

   Use:  PAAGlass.watch(el, { root })   once per element: it is fitted when it has a size and again whenever its size
         changes (a ResizeObserver, so never per frame, and at most about 8 times a second for one element: an answer
         streaming into a card does not redraw the glass for every word).  PAAGlass.apply(el, opts) does it right now.
         PAAGlass.release(el) lets go of the element's filter (and puts back the plain-blur fall-back of glass.css);
         PAAGlass.forget(el) does that and stops watching: call it where the element is thrown away.
   Where the filters live matters. A closed shadow root is its own scope: url(#id) inside it only finds a filter that is in
   the SAME shadow root (checked in Chrome for Testing: a filter in the document is not found, and a filter in the shadow
   root is). So opts.root is the shadow root (or document.body for an ordinary page) and the <svg> that holds the filters is
   appended there. Filters are shared between elements of the same size, radius and bevel, and the maps are cached by size,
   so thirty captions of one width cost one map, not thirty. The map cache is a small LRU. */
(function (g) {
  const NS = 'http://www.w3.org/2000/svg';
  const mapCache = new Map(); // "w,h,r,b" -> { map, mask } (data URLs), least recently used first
  const MAPS = 40;             // how many sizes are kept
  const scopes = new WeakMap(); // root -> { defs, entries: Map(sig -> { id, count, el }) }
  const watched = new WeakMap(); // element -> { root, w, h, fw, fh, timer, at } (fw, fh: the size the filter was last fitted to)
  const GAP = 120; // ms between two redraws of one element's glass
  let seq = 0;
  const stats = { applies: 0, drawn: 0, drawMs: 0, filters: 0 };
  let ro = null;

  // signed distance from a point to the edge of a rounded rectangle (negative inside), and its outward normal
  function sd(x, y, w, h, r) {
    const cx = w / 2, cy = h / 2, qx = Math.abs(x - cx) - (cx - r), qy = Math.abs(y - cy) - (cy - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
    const d = len + Math.min(Math.max(qx, qy), 0) - r;
    let nx, ny;
    if (qx > 0 && qy > 0) { nx = ox / (len || 1); ny = oy / (len || 1); } else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
    return { d, nx: nx * Math.sign(x - cx || 1), ny: ny * Math.sign(y - cy || 1) };
  }

  /* the displacement map (red = x, green = y, 128 = no shift) and the core mask (alpha: 1 in the core, 0 at the edge) */
  function draw(w, h, r, b) {
    const key = [w, h, r, b].join(',');
    if (mapCache.has(key)) { const hit = mapCache.get(key); mapCache.delete(key); mapCache.set(key, hit); return hit; }
    const t0 = performance.now();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const m = document.createElement('canvas'); m.width = w; m.height = h;
    const cc = c.getContext('2d'), mc = m.getContext('2d');
    const img = cc.createImageData(w, h), msk = mc.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, s = sd(x + 0.5, y + 0.5, w, h, r), t = -s.d; // t = depth inside the edge, px
      let dx = 0, dy = 0, core = 1;
      if (t < b) {
        const k = 1 - Math.max(t, 0) / b;           // 1 at the edge, 0 where the bevel meets the core
        const f = k * k * (3 - 2 * k);               // smooth
        dx = -s.nx * f; dy = -s.ny * f;              // look inward: the rim shows a squeezed copy of what lies just inside it
        core = Math.max(0, 1 - k * 5);               // frost and dim only in the innermost fifth of the bevel (enough to anti-alias the core's edge)
      }
      img.data[i] = 128 + 127 * dx; img.data[i + 1] = 128 + 127 * dy; img.data[i + 2] = 128; img.data[i + 3] = 255;
      msk.data[i] = msk.data[i + 1] = msk.data[i + 2] = 255; msk.data[i + 3] = t <= 0 ? 0 : 255 * core;
    }
    cc.putImageData(img, 0, 0); mc.putImageData(msk, 0, 0);
    const out = { map: c.toDataURL('image/png'), mask: m.toDataURL('image/png') };
    mapCache.set(key, out);
    if (mapCache.size > MAPS) mapCache.delete(mapCache.keys().next().value);
    stats.drawn++; stats.drawMs += performance.now() - t0;
    return out;
  }

  function scope(root) {
    let s = scopes.get(root);
    if (s) return s;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('data-paa-glass', ''); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    const defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    root.appendChild(svg);
    s = { defs, entries: new Map(), svg };
    scopes.set(root, s);
    return s;
  }
  const mk = (name, attrs) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  function buildFilter(id, w, h, r, b, bend, frost, disp, dim, sat, aqua) {
    const { map, mask } = draw(w, h, r, b);
    const f = mk('filter', { id, x: '0', y: '0', width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
    const S = bend * 2; // the displacement scale: the map's full range moves a pixel by up to +-bend
    f.append(
      mk('feImage', { href: map, x: '0', y: '0', width: w, height: h, preserveAspectRatio: 'none', result: 'map' }),
      mk('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '1.2', result: 'soft' })
    );
    if (disp > 0) {
      // colour fringing: red, green and blue are bent by slightly different amounts, then put back together
      const chan = (name, scale, keep) => [
        mk('feDisplacementMap', { in: 'soft', in2: 'map', scale: String(scale), xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + name }),
        mk('feColorMatrix', { in: 'd' + name, type: 'matrix', values: keep, result: 'c' + name }),
      ];
      // (each keeps only its own colour; alpha stays 1 so the sum below stays a valid pre-multiplied colour)
      f.append(
        ...chan('r', S * (1 - disp), '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1'),
        ...chan('g', S, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1'),
        ...chan('b', S * (1 + disp), '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1'),
        mk('feComposite', { in: 'cr', in2: 'cg', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'rg' }),
        mk('feComposite', { in: 'rg', in2: 'cb', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'bent' })
      );
    } else {
      f.append(mk('feDisplacementMap', { in: 'soft', in2: 'map', scale: String(S), xChannelSelector: 'R', yChannelSelector: 'G', result: 'bent' }));
    }
    f.append(
      mk('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: String(frost), result: 'frosted' }),
      (() => { // the core's darkening is a soft ceiling, not a flat dim: white is held down to --dim, and darker things are let through lighter
        // than a flat dim would leave them (v = dim * x * (2 - x)), so the glass is only as dark as white type needs over that scene
        // and it is BLUE glass: it filters the light (holds red back, lets blue through) instead of making the street grey; the same luminance as a grey
        // dim (0.55 / 0.8 / 1.45 of it for R / G / B), so no contrast is spent. --aqua (0 to 1) scales how far the three channels part.
        const tv = (k) => Array.from({ length: 9 }, (_, i) => { const x = i / 8; return Math.min(1, (1 + aqua * (k - 1)) * dim * x * (2 - x)).toFixed(4); }).join(' ');
        const ct = mk('feComponentTransfer', { in: 'frosted', result: 'frost' });
        ct.append(mk('feFuncR', { type: 'table', tableValues: tv(.55) }), mk('feFuncG', { type: 'table', tableValues: tv(.8) }), mk('feFuncB', { type: 'table', tableValues: tv(1.45) }));
        return ct;
      })(),
      mk('feImage', { href: mask, x: '0', y: '0', width: w, height: h, preserveAspectRatio: 'none', result: 'mask' }),
      mk('feComposite', { in: 'frost', in2: 'mask', operator: 'in', result: 'core' }),
      mk('feComposite', { in: 'core', in2: 'bent', operator: 'over', result: 'glass' }),
      mk('feColorMatrix', { in: 'glass', type: 'saturate', values: String(sat) })
    );
    return f;
  }

  function release(node) {
    const cur = node.__paaGlass;
    if (!cur) return;
    node.__paaGlass = null;
    // back to the plain blur in glass.css (an inline url() to a filter that is gone would drop the whole filter chain)
    node.style.removeProperty('-webkit-backdrop-filter'); node.style.removeProperty('backdrop-filter');
    const s = scopes.get(cur.root);
    const e = s && s.entries.get(cur.sig);
    if (e && --e.count <= 0) { if (e.el.parentNode) e.el.remove(); s.entries.delete(cur.sig); stats.filters--; }
  }

  /* opts: { root (the shadow root or document.body), w, h (when the caller already knows the size: no layout read), r, bevel, bend, frost, disperse, dim } */
  function apply(node, opts) {
    opts = opts || {};
    const w = Math.round(opts.w != null ? opts.w : node.offsetWidth), h = Math.round(opts.h != null ? opts.h : node.offsetHeight);
    if (!w || !h) { release(node); return; }
    const root = opts.root || (node.__paaGlass && node.__paaGlass.root) || document.body;
    const cs = getComputedStyle(node);
    const num = (name, d) => { const v = parseFloat(cs.getPropertyValue(name)); return isNaN(v) ? d : v; };
    const r = Math.min(opts.r != null ? opts.r : num('--r', 16), w / 2, h / 2);
    const b = Math.min(opts.bevel != null ? opts.bevel : num('--bevel', 8), w / 2, h / 2);
    const bend = Math.round(b * (opts.bend != null ? opts.bend : num('--bend', 3.2)));
    const frost = opts.frost != null ? opts.frost : num('--frost', 12);
    const disp = Math.max(0, Math.min(.4, opts.disperse != null ? opts.disperse : num('--disperse', 0)));
    const dim = Math.max(.2, Math.min(1.2, opts.dim != null ? opts.dim : num('--dim', .46)));
    const sat = Math.max(0.5, Math.min(4, opts.sat != null ? opts.sat : num('--paa-sat', 2.4)));
    const aqua = Math.max(0, Math.min(1, opts.aqua != null ? opts.aqua : num('--aqua', 1)));
    const sig = [w, h, r, b, bend, frost, disp, dim, sat, aqua].join(',');
    const cur = node.__paaGlass;
    if (cur && cur.sig === sig && cur.root === root) return;
    stats.applies++;
    const s = scope(root);
    let e = s.entries.get(sig);
    if (!e) {
      e = { id: 'paa-glass-' + (++seq), count: 0, el: null };
      e.el = buildFilter(e.id, w, h, r, b, bend, frost, disp, dim, sat, aqua);
      s.defs.appendChild(e.el);
      s.entries.set(sig, e);
      stats.filters++;
    }
    e.count++;
    node.__paaGlass = { sig, root };
    if (cur) { // let go of the old one only after the new one is in place
      const old = s.entries.get(cur.sig);
      if (old && old !== e && --old.count <= 0) { if (old.el.parentNode) old.el.remove(); s.entries.delete(cur.sig); stats.filters--; }
    }
    const v = 'url(#' + e.id + ')';
    node.style.setProperty('-webkit-backdrop-filter', v); node.style.setProperty('backdrop-filter', v);
  }

  function run(node) {
    const st = watched.get(node);
    if (!st) return;
    st.timer = 0; st.at = performance.now(); st.fw = st.w; st.fh = st.h;
    try { apply(node, { w: st.w, h: st.h, root: st.root }); } catch (e) { console.warn('[PAAGlass]', e); }
  }

  function onResize(entries) {
    for (const en of entries) {
      const node = en.target, st = watched.get(node);
      if (!st) continue;
      const bs = en.borderBoxSize && en.borderBoxSize[0];
      st.w = bs ? bs.inlineSize : en.contentRect.width;
      st.h = bs ? bs.blockSize : en.contentRect.height;
      if (!st.w || !st.h) { // gone for now (detached, or display none): let go of its filter, keep watching: it is fitted again when it has a size
        clearTimeout(st.timer); st.timer = 0;
        release(node);
        continue;
      }
      // a size that grew is fitted at once (the new strip would otherwise lie outside the filter, unfrosted, and the old bottom bevel would
      // draw a seam across the middle); shrinking and repeated small changes are throttled
      if (st.w > st.fw || st.h > st.fh || !node.__paaGlass) { clearTimeout(st.timer); st.timer = 0; run(node); continue; }
      if (st.timer) continue; // the pending redraw will pick up the newest size
      const since = performance.now() - st.at;
      if (!st.at || since >= GAP) run(node);
      else st.timer = setTimeout(() => run(node), GAP - since);
    }
  }

  /* fit the element's glass now and whenever its size changes */
  function watch(node, opts) {
    if (watched.has(node)) return;
    if (!ro) ro = new ResizeObserver(onResize);
    watched.set(node, { root: (opts && opts.root) || document.body, w: 0, h: 0, fw: 0, fh: 0, timer: 0, at: 0 });
    ro.observe(node);
  }

  /* the element is being thrown away (or will not be glass any more): let go of its filter and stop watching it */
  function forget(node) {
    if (!node) return;
    const st = watched.get(node);
    if (st) { clearTimeout(st.timer); if (ro) ro.unobserve(node); watched.delete(node); }
    node.__fit = false;
    release(node);
  }

  g.PAAGlass = { apply, watch, release, forget, stats, _draw: draw, _entries: (root) => { const s = scopes.get(root); return s ? s.entries.size : 0; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
