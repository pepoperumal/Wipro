/* green bubbles -- ambient field placed AROUND the dandelions, never on them.
 *
 * State 1 (the ambient view) is generated deterministically: an even, non-
 * overlapping field that fills the green (left) side of the scene but stays
 * OUTSIDE a keep-out ellipse drawn around the green dandelion's head + its
 * sub-branches (plus a margin), and clear of the intro text. So no bubble ever
 * collides with, touches, or sits under the main dandelion group. The purple
 * field owns the right side (bubbles-purple.js) with the same rule, so the two
 * fields meet down the middle and never cross onto a plant.
 *
 * The layer carries `bubbles--drift`, whose CSS gives every bubble a slow, soft
 * fade-in / gentle drift / hold / fade-out loop, each on its own timing. As a
 * bubble fades out it may relocate to a free pool spot -- and the pool itself is
 * built with the SAME keep-out guard, so a relocation can never land on a plant.
 *
 *   t  asset index into ASSETS   x,y  centre (% of scene w / h)   s  diameter (% w)
 */
(() => {
  "use strict";
  // Only real bubbles here. SmallBubbleGreen2.png is a hollow dotted ring (a
  // seed-head, not a bubble), so its slot (index 1) points at the glowing bubble
  // instead. The field uses SmallBubbleGreen1.png (soft glow) and 3.png (solid).
  const ASSETS = ["SmallBubbleGreen1.png", "SmallBubbleGreen1.png", "3.png"];

  // ---- geometry helpers (shared by all three fields) ------------------------
  const YW2 = 2.2222; // 1% height == 2.22% width (9:20 scene) -- for round distances
  const ell = (x, y, cx, cy, rx, ry) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy < 1;
  };
  const d2 = (x, y, cx, cy) => {
    const dx = x - cx, dy = (y - cy) * YW2;
    return dx * dx + dy * dy;
  };
  // Squared distance (in width-%) from (x,y) to the segment (ax,ay)->(bx,by).
  // Used to keep bubbles off a stem/tail, which is a LINE, not a blob.
  const segD2 = (x, y, ax, ay, bx, by) => {
    const px = x - ax, py = (y - ay) * YW2;
    const dx = bx - ax, dy = (by - ay) * YW2;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    const cx = ax + t * (bx - ax), cy = ay + t * (by - ay);
    const ex = x - cx, ey = (y - cy) * YW2;
    return ex * ex + ey * ey;
  };

  // --- STATE-1 keep-outs -----------------------------------------------------
  // One ellipse per dandelion, sized to enclose its HEAD + all its SUB-BRANCHES
  // plus a clear margin (verified visually against the state-1 render). A bubble
  // CENTRE is rejected inside either ellipse; with the margin baked in, even the
  // largest bubble's rim stays off the plant. These are the initial (un-bloomed)
  // plant positions: green head ~(36.5,62), purple head ~(74,51).
  const ko1Green  = (x, y) => ell(x, y, 34, 61, 22, 14);
  const ko1Purple = (x, y) => ell(x, y, 75, 51, 22, 13.5);
  // The TAILS too: each stem runs as a diagonal from its head down to its foot at
  // the bottom edge (green head(36.5,61) -> foot(13,100); purple head(75,51) ->
  // foot(40,100)). Keep bubbles off those lines -- now that the fields reach into
  // the middle, a bubble could sit on a stem and make it look pinched or merged.
  const ko1TailG = (x, y) => segD2(x, y, 36.5, 61, 13, 100) < 30;  // within ~5.5%w
  const ko1TailP = (x, y) => segD2(x, y, 75, 51, 40, 100) < 30;
  const clearPlants1 = (x, y) =>
    !ko1Green(x, y) && !ko1Purple(x, y) && !ko1TailG(x, y) && !ko1TailP(x, y);
  // Clear of the intro text column (top-left).
  const notText = (x, y) => !(x >= 4 && x <= 66 && y >= 10 && y <= 47);
  // Split the scene by NEAREST plant centre (a Voronoi cut), not a hard x seam:
  // each field reaches all the way in to the bisector between the two plants, so
  // the middle / lower-middle fills instead of leaving an empty gap. Green owns
  // the lower-left half; purple the upper-right. (Purple uses !nearG.)
  const d2p = (x, y, cx, cy) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy; };
  const nearG = (x, y) => d2p(x, y, 36.5, 62) <= d2p(x, y, 74, 51);
  // --- Frame ring ------------------------------------------------------------
  // The ambient bubbles no longer fill the scene: they sit on a large ELLIPSE that
  // hugs the edges, split into four cardinal arcs with a gap left at each corner,
  // so the field reads as four distinct letters -- a C down the left, a reverse-C
  // down the right, a U across the bottom and a reverse-U across the top. The whole
  // centre (the dandelions + their sub-branches) is far inside the ring, so a wide
  // clear gap surrounds the plants. Green owns the left + bottom arcs (nearG);
  // purple owns the right + top (see bubbles-purple.js).
  const RCX = 50, RCY = 50, RRX = 46, RRY = 47; // ring centre + radii (% w / h)
  const RBAND = 0.085;   // ring half-thickness in normalised ellipse units
  const ARCH = 42;       // each arc spans its cardinal +/- this many degrees
  const onRing = (x, y) => {
    const nx = (x - RCX) / RRX, ny = (y - RCY) / RRY;
    return Math.abs(Math.hypot(nx, ny) - 1) < RBAND;
  };
  const ringAng = (x, y) =>
    (Math.atan2((y - RCY) / RRY, (x - RCX) / RRX) * 180 / Math.PI + 360) % 360;
  const angDist = (a, c) => { const d = Math.abs(a - c) % 360; return d > 180 ? 360 - d : d; };
  // On one of the four cardinal arcs: E = reverse-C, S = U, W = C, N = reverse-U.
  const onArc = (x, y) => {
    const a = ringAng(x, y);
    return angDist(a, 0) < ARCH || angDist(a, 90) < ARCH ||
           angDist(a, 180) < ARCH || angDist(a, 270) < ARCH;
  };
  // Green's region: on the ring's arcs, off the plants + text, on the green side.
  const accept1 = (x, y) =>
    onRing(x, y) && onArc(x, y) && clearPlants1(x, y) && notText(x, y) && nearG(x, y);

  // --- Halo around the sub-branches ------------------------------------------
  // A second, closer ring: bubbles hugging just OUTSIDE the green sub-branch
  // cluster, with a clear gap so they never touch a puff. Width-aware distance
  // from the head centre keeps the ring round; d > 24 clears the subs' outer edge
  // (~20 from the head) by ~4%w -- the requested gap. The tail keep-out + Voronoi +
  // text carve it, so it wraps the upper/outer side of the puffs and never sits on
  // the stem or the other plant. (Measured head centre ~ (39, 64).)
  const GHX = 39, GHY = 64;
  const haloG = (x, y) => {
    const dx = x - GHX, dy = (y - GHY) * YW2;
    const d = Math.hypot(dx, dy);
    return d > 23 && d < 29;
  };
  const acceptHalo = (x, y) =>
    haloG(x, y) && !ko1Purple(x, y) && !ko1TailG(x, y) && !ko1TailP(x, y) &&
    notText(x, y) && nearG(x, y);

  // Deterministic, evenly-spaced sampler (R2 low-discrepancy + spacing
  // rejection): no overlaps, no rows, identical on every load (no Math.random).
  const genField = (opts) => {
    const PHI = 1.32471795724474602596;         // plastic number (2D R2 base)
    const A1 = 1 / PHI, A2 = 1 / (PHI * PHI);
    const SIZES = opts.sizes;
    const TS = opts.ts;
    const MAX = opts.maxtries || 80000;
    const out = [];
    for (let i = opts.seed, tries = 0; out.length < opts.target && tries < MAX; tries++, i++) {
      const x = ((0.5 + A1 * i) % 1) * 100;
      const y = ((0.5 + A2 * i) % 1) * 100;
      if (x < 2.5 || x > 97.5 || y < 3 || y > 97) continue;
      if (!opts.accept(x, y)) continue;
      let ok = true;
      for (const b of out) {
        const dx = x - b.x, dy = (y - b.y) * YW2;
        if (dx * dx + dy * dy < opts.gap * opts.gap) { ok = false; break; }
      }
      if (!ok) continue;
      out.push({
        t: TS[out.length % TS.length],
        x: +x.toFixed(2),
        y: +y.toFixed(2),
        s: SIZES[out.length % SIZES.length],
      });
    }
    return out;
  };

  // Bigger overall, with the FLOOR lifted so even the smallest bubble reads
  // clearly (the old 1.6-2.0 minima looked like specks).
  const AMB_SIZES = [4.2, 3.2, 3.8, 3.0, 3.5, 3.1, 4.0, 2.9, 3.4, 3.0, 4.4, 2.8];
  const HALO_SIZES = [3.4, 2.7, 3.8, 3.0, 2.5, 3.6, 2.9, 4.0, 3.2, 2.8];
  const SKY_SIZES = [2.4, 2.1, 2.7, 2.3, 2.5, 2.2, 2.6, 2.3];

  // State-1 ambient field, in two bands so the density is right in each:
  //   (main) around + below the plants and filling the middle/lower-middle --
  //          denser, so the bays beside each plant and the gap between the two
  //          stems are populated (right up to the keep-out, never onto a plant);
  //   (top)  a SPARSE scatter up in the sky -- fewer bubbles up top, as asked.
  const LAYOUT = genField({
    seed: 1,
    target: 26,          // sparse -- a light frame, not a fill
    gap: 5.8,
    maxtries: 500000,
    ts: [1, 0, 2, 0, 1, 2, 0, 1],
    sizes: AMB_SIZES,
    accept: accept1,
  });

  // The halo hugging the green sub-branches (see acceptHalo). A separate field, so
  // it keeps its own migration pool and never trades bubbles with the edge frame.
  const LAYOUT_HALO = genField({
    seed: 3,
    target: 16,
    gap: 4.8,
    maxtries: 260000,
    ts: [1, 0, 2, 0, 1, 2],
    sizes: HALO_SIZES,
    accept: acceptHalo,
  });

  // Four extra GREEN bubbles tucked BELOW the main green circle (requested). A
  // dedicated field with a small keep-IN zone (underZone) instead of the usual
  // keep-OUT, so they sit just under the ball -- with a clear gap from it and to
  // the right of the descending stem -- and stay there rather than wandering off
  // to the frame. Their pool spots are confined to the same zone.
  const ballG = (x, y) => ell(x, y, 36, 62, 11, 7.5);        // the green ball (+ margin)
  const underZone = (x, y) => ell(x, y, 41.5, 72, 6.5, 4.8); // the small bay below it
  const acceptUnder = (x, y) => underZone(x, y) && !ballG(x, y) && !ko1TailG(x, y);
  const LAYOUT_UNDER = [
    { t: 1, x: 37.5, y: 70.8, s: 4.6 },
    { t: 0, x: 41.5, y: 70.5, s: 4.8 },
    { t: 2, x: 45.0, y: 72.0, s: 4.2 },
    { t: 1, x: 41.0, y: 74.2, s: 4.0 },
  ];

  /* -- 2nd-state (bloom) field ------------------------------------------------
   * A separate field shown ONLY while the dandelions are bloomed. It carries
   * `bubbles--phase2` (hidden until lit) and NOT `bubbles--green`, so the state-1
   * fade-out never touches it. A thick halo hugging the green bloom plus a top
   * scatter. Deterministic, Voronoi-split by nearest bloom plant. */
  const nearerGreen = (x, y) => d2(x, y, 37, 64) <= d2(x, y, 74, 52);
  const clearOfSubs = (x, y) =>
    !ell(x, y, 37, 64, 19, 12) && !ell(x, y, 74, 52, 18, 11);
  // State-2 GREEN bubbles, hand-placed to the reference image: the puff-motif
  // bubbles that ring the ECO ENERGY bloom -- a cluster above it, a run down the
  // left, a bunch lower-left, and a trail down-right toward the centre. Sizes are
  // % of scene width (bigger than the ambient dots, as in the reference).
  const LAYOUT2 = [
    // top of the green cluster
    { x: 26.7, y: 42.8, s: 8.0 },
    { x: 33.4, y: 42.0, s: 6.8 },
    { x: 18.1, y: 45.1, s: 4.3 },
    { x: 45.4, y: 43.2, s: 3.0 },
    { x: 48.4, y: 45.4, s: 4.8 },
    // left of the green head
    { x: 12.3, y: 55.4, s: 7.0 },
    { x: 8.0,  y: 62.0, s: 4.6 },
    { x: 7.5,  y: 85.0, s: 2.7 },
    // lower-left bunch (below Accolades)
    { x: 12.8, y: 77.5, s: 8.0 },
    { x: 20.9, y: 77.8, s: 6.8 },
    { x: 18.1, y: 72.0, s: 4.3 },
    { x: 27.0, y: 74.2, s: 4.3 },
    // small dots below the centre circle
    { x: 27.2, y: 82.4, s: 2.9 },
    { x: 32.2, y: 80.3, s: 3.4 },
    { x: 35.0, y: 83.4, s: 2.4 },
    // trail down-right toward the centre
    { x: 43.5, y: 75.6, s: 4.8 },
    { x: 48.4, y: 77.8, s: 3.4 },
    { x: 53.2, y: 75.6, s: 3.2 },
    { x: 45.6, y: 79.8, s: 2.4 },
    { x: 50.6, y: 81.2, s: 1.9 },
    // right side of green, reaching toward the purple plant
    { x: 51.1, y: 66.2, s: 5.6 },
    { x: 57.0, y: 68.4, s: 4.3 },
    { x: 58.8, y: 71.6, s: 3.0 },
  ];

  /* -- 3rd-state (drill) field -------------------------------------------------
   * A full 360deg halo of GREEN bubbles hugging the CENTRED green plant, revealed
   * only while the green dandelion is the drilled one. Carries `bubbles--phase3`
   * (hidden until a green drill lights it) and NOT `bubbles--green`.
   *
   * The halo is an ANNULUS that stays off the whole plant: outside an inner
   * keep-out around the head + its (now hugging) sub-branches, AND off the tail.
   * The tail is NOT under the head -- it runs as a diagonal from the head's base
   * down to its foot at the lower-left -- so it is excluded as a strip along that
   * line, wide enough to clear the stem + a bubble's rim. (segD2 is defined with
   * the shared geometry helpers above.) */
  const ko3Head = (x, y) => ell(x, y, 50, 63, 22, 14);          // head + hugging subs
  const ko3Tail = (x, y) => segD2(x, y, 50, 66, 26, 100) < 36;  // within 6%w of the tail
  const LAYOUT3 = [
    // the halo hugging the centred green plant
    ...genField({
      seed: 1,
      target: 80,
      gap: 4.6,
      ts: [1, 0, 2, 0, 1, 2, 0, 1],
      sizes: HALO_SIZES,
      accept: (x, y) =>
        ell(x, y, 50, 63, 30, 19) && !ko3Head(x, y) && !ko3Tail(x, y) && notText(x, y),
    }),
    // extra bubbles scattered across the TOP-RIGHT of the screen
    ...genField({
      seed: 7000,
      target: 14,
      gap: 4.4,
      ts: [1, 0, 2, 0, 1, 2],
      sizes: HALO_SIZES,
      accept: (x, y) => x >= 66 && x <= 97 && y >= 4 && y <= 27,
    }),
  ];

  // -- Migration with a hard NO-OVERLAP + NO-PLANT guarantee -------------------
  // Bubbles migrate: when one finishes a fade cycle (opacity 0 then) it moves to a
  // new spot and fades back in there. To make sure two bubbles never overlap AND
  // none ever lands on a plant, each field gets a fixed POOL of candidate spots
  // that are mutually non-overlapping (size-aware, drift-covering margin) and all
  // pass the field's own `accept` guard (so every pool spot is already clear of
  // the plants + text). A bubble may only relocate into a currently FREE spot.
  const YW = 2.2222;
  const DRIFT = () => 0.5 + Math.random() * 0.4; // 0.5..0.9 cqw -- capped so two
  //                                       drifting neighbours still cannot touch
  const overlaps = (a, b, margin) => {
    const dx = a.x - b.x, dy = (a.y - b.y) * YW;
    const min = (a.s + b.s) / 2 + margin;
    return dx * dx + dy * dy < min * min;
  };

  // Build the pool: the authored spots first, then extra non-overlapping spots
  // sampled near that cloud -- each of which must ALSO pass `accept`, so no pool
  // spot (and therefore no relocation target) can ever fall on a plant or text.
  const buildPool = (layout, accept) => {
    const MARGIN = 1.8;   // width-% breathing room between spots (covers the drift)
    const RCLOUD = 7.0;   // extra spots spread this far from an authored spot, so a
    //                       relocation has somewhere clearly ELSEWHERE to land
    const pool = layout.map((b) => ({ x: b.x, y: b.y, s: b.s }));
    const want = Math.ceil(layout.length * 2.0); // a healthy surplus of free spots
    const sizes = layout.map((b) => b.s);
    let seed = 0x9e3779b1 ^ layout.length;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let tries = 0; pool.length < want && tries < 50000; tries++) {
      const base = layout[(rnd() * layout.length) | 0];
      const ang = rnd() * Math.PI * 2;
      const rad = rnd() * RCLOUD;
      const cand = {
        x: base.x + Math.cos(ang) * rad,
        y: base.y + (Math.sin(ang) * rad) / YW,
        s: sizes[(rnd() * sizes.length) | 0],
      };
      if (cand.x < 2 || cand.x > 98 || cand.y < 3 || cand.y > 97) continue;
      if (accept && !accept(cand.x, cand.y)) continue; // stay off the plants + text
      let ok = true;
      for (const p of pool) if (overlaps(cand, p, MARGIN)) { ok = false; break; }
      if (ok) pool.push(cand);
    }
    return pool;
  };

  // Fill a wrap with one layout's bubbles, wired to the pool above.
  const fill = (wrap, layout, accept) => {
    const pool = buildPool(layout, accept);
    const taken = new Array(pool.length).fill(false); // pool-spot occupancy

    const place = (slot, idx) => {
      const p = pool[idx];
      const ang = Math.random() * Math.PI * 2, amp = DRIFT();
      slot.style.setProperty("--bx", p.x.toFixed(2) + "%");
      slot.style.setProperty("--by", p.y.toFixed(2) + "%");
      slot.style.setProperty("--bs", p.s.toFixed(2) + "%");
      slot.style.setProperty("--dx", (Math.cos(ang) * amp).toFixed(2) + "cqw");
      slot.style.setProperty("--dy", (Math.sin(ang) * amp).toFixed(2) + "cqw");
    };

    const MINMOVE2 = 12 * 12; // a relocation must land >=12%w from the current spot,
    //                           so every fade-out reappears in a clearly new place
    const relocate = (slot) => {
      if (slot._pi != null) taken[slot._pi] = false;
      const cur = slot._pi != null ? pool[slot._pi] : null;
      const free = [];
      for (let k = 0; k < pool.length; k++) if (!taken[k]) free.push(k);
      let idx;
      if (!free.length) {
        idx = slot._pi; // nothing free -> hold (does not happen with the surplus pool)
      } else if (!cur) {
        idx = free[(Math.random() * free.length) | 0];
      } else {
        // Prefer spots clearly ELSEWHERE (>=12%w away), picked at random among them
        // so the field still shuffles naturally rather than snapping to the corners.
        // If none are that far (a sparse pocket), take the farthest third instead.
        let cand = free.filter((k) => d2(pool[k].x, pool[k].y, cur.x, cur.y) >= MINMOVE2);
        if (!cand.length) {
          cand = free.slice().sort(
            (a, b) => d2(pool[b].x, pool[b].y, cur.x, cur.y) - d2(pool[a].x, pool[a].y, cur.x, cur.y)
          ).slice(0, Math.max(1, Math.ceil(free.length / 3)));
        }
        idx = cand[(Math.random() * cand.length) | 0];
      }
      taken[idx] = true;
      slot._pi = idx;
      place(slot, idx);
    };

    layout.forEach((b, i) => {
      const slot = document.createElement("div");
      slot.className = "bubble-slot";
      const dur = 10 + (i % 6) * 1.1; // 10.0 .. 15.5s
      const frac = (i * 0.61803398875) % 1; // even phase spread across [0,1)
      slot.style.setProperty("--ddur", dur.toFixed(1) + "s");
      slot.style.setProperty("--ddelay", (-frac * dur).toFixed(2) + "s");
      taken[i] = true;
      slot._pi = i;
      place(slot, i);
      const img = document.createElement("img");
      img.className = "bubble";
      img.src = ASSETS[b.t];
      img.alt = "";
      img.decoding = "async";
      slot.appendChild(img);
      wrap.appendChild(slot);
      slot.addEventListener("animationiteration", () => relocate(slot));
    });
  };

  // Static motif filler (state 2): each bubble is a small copy of the dandelion
  // puff (#sub-green-motif) at a FIXED spot -- no pool, no migration, no fade
  // cycle -- so the field reads exactly as authored (to the reference). `b.m`
  // marks a magenta bubble (purple field only).
  const SVGNS = "http://www.w3.org/2000/svg";
  // Randomised size, biased LARGE ("more than small"): each bubble alternates a
  // big and a small band with a little jitter, so the field reads as a natural mix
  // of big and small puffs (one big, one small...) rather than one uniform size.
  // Positions stay exactly as authored; only the size is rolled.
  const rollSize = (i) => {
    const big = i % 2 === 0;
    return (big ? 7.0 : 4.2) + Math.random() * (big ? 3.4 : 2.4); // big 7-10.4, small 4.2-6.6
  };
  const fillMotif = (wrap, layout, motifId) => {
    layout.forEach((b, i) => {
      const slot = document.createElement("div");
      slot.className = "bubble-slot";
      slot.style.setProperty("--bx", b.x + "%");
      slot.style.setProperty("--by", b.y + "%");
      slot.style.setProperty("--bs", rollSize(i).toFixed(2) + "%");
      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("viewBox", "-1.12 -1.12 2.24 2.24");
      svg.setAttribute("class", "bubble-motif" + (b.m ? " bubble--magenta" : ""));
      svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS(SVGNS, "use");
      use.setAttribute("href", motifId);
      svg.appendChild(use);
      slot.appendChild(svg);
      wrap.appendChild(slot);
    });
  };

  const build = () => {
    const app = document.querySelector(".app");
    if (!app || app.querySelector(".bubbles--green")) return;

    // State-1 field: the ambient composition, kept off the plants by accept1.
    const wrap = document.createElement("div");
    wrap.className = "bubbles bubbles--drift bubbles--green";
    wrap.setAttribute("aria-hidden", "true");
    fill(wrap, LAYOUT, accept1);
    fill(wrap, LAYOUT_HALO, acceptHalo); // the ring hugging the green sub-branches
    fill(wrap, LAYOUT_UNDER, acceptUnder); // 4 bubbles tucked below the green circle
    app.prepend(wrap);

    // State-2 field: puff-motif bubbles hand-placed to the reference, hidden until
    // labels.js lights it. Static (no drift/migration) so the arrangement holds.
    const wrap2 = document.createElement("div");
    wrap2.className = "bubbles bubbles--motif bubbles--phase2 bubbles--phase2-green";
    wrap2.setAttribute("aria-hidden", "true");
    fillMotif(wrap2, LAYOUT2, "#sub-green-motif");
    app.prepend(wrap2);

    // State-3 field: the halo around the CENTRED green plant, hidden until a green
    // drill lights it (see the drill listeners below).
    const wrap3 = document.createElement("div");
    wrap3.className = "bubbles bubbles--drift bubbles--phase3 bubbles--phase3-green";
    wrap3.setAttribute("aria-hidden", "true");
    fill(wrap3, LAYOUT3);
    app.prepend(wrap3);

    // Drill wiring: light the green halo the moment a GREEN drill begins, so the
    // halo is already present and STAYS put while the plant grows into it -- rather
    // than fading out and only fading back in after the grow. A purple drill clears
    // it (setGreen sees a non-green colour). `grown` re-asserts it as a safety net.
    const litGreen = (on) => wrap3.classList.toggle("is-lit", on);
    const setGreen = (e) => litGreen(!!e.detail && e.detail.color === "green");
    document.addEventListener("dandelion:drillstart", setGreen);
    document.addEventListener("dandelion:grown", setGreen);
    document.addEventListener("dandelion:reset", () => litGreen(false));
    document.addEventListener("dandelion:undrill", () => litGreen(false));

    console.log(
      `[green bubbles] ${LAYOUT.length} state-1 + ${LAYOUT2.length} state-2 + ${LAYOUT3.length} state-3 bubbles placed`
    );
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", build);
  else build();
})();
