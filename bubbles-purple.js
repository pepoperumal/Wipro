/* purple bubbles -- ambient field placed AROUND the dandelions, never on them.
 *
 * State 1 (the ambient view) is generated deterministically: an even, non-
 * overlapping field that fills the purple (right) side of the scene but stays
 * OUTSIDE a keep-out ellipse drawn around each dandelion's head + its sub-
 * branches (plus a margin), and clear of the intro text. So no bubble ever
 * collides with, touches, or sits under the main dandelion group. The green
 * field owns the left side (bubbles.js) with the same rule, so the two fields
 * meet down the middle and never cross onto a plant.
 *
 * The layer carries `bubbles--drift`, whose CSS gives every bubble a slow, soft
 * fade-in / gentle drift / hold / fade-out loop. As a bubble fades out it may
 * relocate to a free pool spot -- and the pool is built with the SAME keep-out
 * guard, so a relocation can never land on a plant.
 *
 *   t  asset index into ASSETS      x,y  centre (% of scene w / h)   s  diameter (% w)
 */
(() => {
  "use strict";
  const ASSETS = ["Group.png", "sub-purple.svg"];

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

  // --- STATE-1 keep-outs (identical to the green field's) --------------------
  // One ellipse per dandelion, enclosing its HEAD + all SUB-BRANCHES plus a clear
  // margin, so no bubble centre lands where its rim could touch a plant. Initial
  // (un-bloomed) positions: green head ~(36.5,62), purple head ~(74,51).
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
  const notText = (x, y) => !(x >= 4 && x <= 66 && y >= 10 && y <= 47);
  // Split the scene by NEAREST plant centre (a Voronoi cut), matching bubbles.js,
  // so each field reaches in to the bisector and the middle fills. Purple owns the
  // upper-right half (!nearG); green owns the lower-left.
  const d2p = (x, y, cx, cy) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy; };
  const nearG = (x, y) => d2p(x, y, 36.5, 62) <= d2p(x, y, 74, 51);
  // --- Frame ring (mirrors bubbles.js) ---------------------------------------
  // The ambient bubbles sit on a large ELLIPSE hugging the scene edges, split into
  // four cardinal arcs with a gap at each corner, so the field reads as four
  // distinct letters: a C down the left, a reverse-C down the right, a U across the
  // bottom and a reverse-U across the top. Purple owns the right + top arcs
  // (!nearG); green owns the left + bottom (see bubbles.js).
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
  const onArc = (x, y) => {
    const a = ringAng(x, y);
    return angDist(a, 0) < ARCH || angDist(a, 90) < ARCH ||
           angDist(a, 180) < ARCH || angDist(a, 270) < ARCH;
  };
  // Purple's region: on the ring's arcs, off the plants + text, on the purple side.
  const accept1 = (x, y) =>
    onRing(x, y) && onArc(x, y) && clearPlants1(x, y) && notText(x, y) && !nearG(x, y);

  // --- Halo around the sub-branches ------------------------------------------
  // Bubbles hugging just OUTSIDE the purple sub-branch cluster, with a clear gap so
  // they never touch a puff. Width-aware distance from the head keeps the ring
  // round; d > 24 clears the subs' outer edge (~20 from the head) by ~4%w. The tail
  // keep-out + Voronoi + text carve it. (Measured head centre ~ (71, 50).)
  const PHX = 71, PHY = 50;
  const haloP = (x, y) => {
    const dx = x - PHX, dy = (y - PHY) * YW2;
    const d = Math.hypot(dx, dy);
    return d > 23 && d < 29;
  };
  const acceptHalo = (x, y) =>
    haloP(x, y) && !ko1Green(x, y) && !ko1TailG(x, y) && !ko1TailP(x, y) &&
    notText(x, y) && !nearG(x, y);

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

  const AMB_SIZES = [3.2, 2.2, 2.8, 1.9, 2.5, 2.0, 3.4, 1.8, 2.6, 2.1, 3.0, 2.4];
  const HALO_SIZES = [2.6, 1.8, 3.0, 2.2, 1.6, 2.8, 2.0, 3.2, 2.4, 1.9];
  const SKY_SIZES = [1.6, 1.3, 1.9, 1.5, 1.7, 1.4, 1.8, 1.5];

  // State-1 ambient field, in two bands (see bubbles.js): a denser main field
  // around + below the plant and into the middle, and a SPARSE top scatter.
  const LAYOUT = genField({
    seed: 40000,
    target: 26,          // sparse -- a light frame, not a fill
    gap: 5.5,
    maxtries: 500000,
    ts: [0, 1, 0],
    sizes: AMB_SIZES,
    accept: accept1,
  });

  // The halo hugging the purple sub-branches (see acceptHalo). A separate field, so
  // it keeps its own migration pool and never trades bubbles with the edge frame.
  const LAYOUT_HALO = genField({
    seed: 30000,
    target: 16,
    gap: 4.2,
    maxtries: 260000,
    ts: [0, 1, 0],
    sizes: HALO_SIZES,
    accept: acceptHalo,
  });

  /* -- 2nd-state (bloom) field ------------------------------------------------
   * The purple counterpart to the green phase-2 field, shown ONLY while bloomed.
   * Carries `bubbles--phase2` (hidden until lit) and NOT `bubbles--purple`. */
  const nearerGreen = (x, y) => d2(x, y, 37, 64) <= d2(x, y, 74, 52);
  const clearOfSubs = (x, y) =>
    !ell(x, y, 37, 64, 19, 12) && !ell(x, y, 74, 52, 18, 11);
  const abovePurpleHead = (x, y) => x >= 58 && x <= 90 && y <= 44;
  // State-2 PURPLE bubbles, hand-placed to the reference: the puff-motif bubbles
  // that ring the ECO EYE bloom. `m: true` marks the BRIGHT MAGENTA ones (the hot
  // pink puffs above and lower-right of the head in the reference); the rest are
  // the violet puff. Sizes are % of scene width.
  const LAYOUT2 = [
    // bright-magenta puffs across the top
    { x: 70.3, y: 33.9, s: 4.8, m: true },
    { x: 76.7, y: 34.0, s: 6.6, m: true },
    { x: 83.2, y: 34.8, s: 5.2, m: true },
    { x: 64.1, y: 39.5, s: 3.8, m: true },
    { x: 88.9, y: 38.1, s: 2.9, m: true },
    // violet puffs around the head
    { x: 91.4, y: 41.4, s: 4.8 },
    { x: 94.7, y: 46.0, s: 2.9 },
    { x: 60.7, y: 41.4, s: 2.4 },
    // lower-right trail (mix of magenta + violet)
    { x: 79.9, y: 62.5, s: 5.6, m: true },
    { x: 85.4, y: 65.7, s: 4.3, m: true },
    { x: 89.5, y: 61.5, s: 3.4 },
    { x: 92.4, y: 72.8, s: 3.8, m: true },
    { x: 82.8, y: 69.9, s: 2.9 },
    { x: 88.0, y: 74.2, s: 2.4 },
    // trail toward the centre (between the two plants)
    { x: 72.2, y: 69.9, s: 4.3 },
    { x: 67.4, y: 71.8, s: 3.4, m: true },
    { x: 77.2, y: 72.8, s: 2.9 },
    { x: 62.6, y: 73.7, s: 2.4 },
    { x: 71.3, y: 75.6, s: 1.9 },
  ];

  /* -- 3rd-state (drill) field -------------------------------------------------
   * A full 360deg halo of PURPLE bubbles hugging the CENTRED purple plant,
   * revealed only while the purple dandelion is the drilled one.
   *
   * Same as green: an annulus outside a keep-out around the head + its hugging
   * sub-branches, AND off the tail -- which runs as a diagonal from the head's
   * base down to its foot at the lower-left, excluded as a strip along that line. */
  const ko3Head = (x, y) => ell(x, y, 50, 52, 21, 14);          // head + hugging subs
  const ko3Tail = (x, y) => segD2(x, y, 50, 56, 16, 100) < 36;  // within 6%w of the tail
  const LAYOUT3 = [
    // the halo hugging the centred purple plant
    ...genField({
      seed: 40000,
      target: 52,
      gap: 4.0,
      ts: [0, 1, 0],
      sizes: HALO_SIZES,
      accept: (x, y) =>
        ell(x, y, 50, 52, 28, 17) && !ko3Head(x, y) && !ko3Tail(x, y) && notText(x, y),
    }),
    // extra bubbles scattered across the TOP-RIGHT of the screen
    ...genField({
      seed: 9500,
      target: 14,
      gap: 3.8,
      ts: [0, 1, 0],
      sizes: HALO_SIZES,
      accept: (x, y) => x >= 66 && x <= 97 && y >= 4 && y <= 27,
    }),
  ];

  // -- Migration with a hard NO-OVERLAP + NO-PLANT guarantee -------------------
  // Each field gets a fixed POOL of mutually non-overlapping candidate spots that
  // all pass the field's `accept` guard, so every relocation target is already
  // clear of the plants + text and no two bubbles can overlap.
  const DRIFT = () => 2.0 + Math.random() * 1.2; // 2.0..3.2 cqw -- clearly visible motion
  const overlaps = (a, b, margin) => {
    const dx = a.x - b.x, dy = (a.y - b.y) * YW2;
    const min = (a.s + b.s) / 2 + margin;
    return dx * dx + dy * dy < min * min;
  };

  const buildPool = (layout, accept) => {
    const MARGIN = 1.8;
    const RCLOUD = 7.0;   // spread extra spots wider, so a relocation has somewhere
    //                       clearly ELSEWHERE to land
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
        y: base.y + (Math.sin(ang) * rad) / YW2,
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

  // Every three bubbles receive one small, one medium and one large scale, then
  // the order is shuffled. This gives the field genuine variation while avoiding
  // long runs of identical-looking bubbles.
  const shuffledSizeScales = (count) => {
    const out = [];
    while (out.length < count) {
      const group = [0.72, 1, 1.28];
      for (let i = group.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [group[i], group[j]] = [group[j], group[i]];
      }
      out.push(...group);
    }
    return out;
  };

  // Cycle bubbles in batches of roughly eight. Every bubble in a batch shares a
  // clock, while the batches are evenly distributed through the full cycle.
  const setBatchCycle = (slot, i, count) => {
    const duration = 14;
    const batches = Math.max(1, Math.round(count / 8));
    const batch = Math.min(batches - 1, Math.floor(i * batches / count));
    slot.style.setProperty("--ddur", duration + "s");
    slot.style.setProperty("--ddelay", (-(batch * duration / batches)).toFixed(2) + "s");
  };

  // Collision detection is intentionally separate from the normal bubble cycle:
  // it only intervenes when a bubble reaches a visible head or sub-branch.
  const watchedWraps = new Set();
  let collisionRaf = 0, collisionTick = 0;
  const touchesDandelion = (slot, target) => {
    const a = slot.getBoundingClientRect(), b = target.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    return Math.hypot(ax - bx, ay - by) < (Math.min(a.width, a.height) + Math.min(b.width, b.height)) * 0.42;
  };
  const watchCollisions = (wrap) => {
    watchedWraps.add(wrap);
    if (collisionRaf) return;
    const frame = (now) => {
      if (now - collisionTick > 160) {
        collisionTick = now;
        const targets = [...document.querySelectorAll(".branch:not(.is-faded) .branch__head, .branch:not(.is-faded) .sub")];
        watchedWraps.forEach((field) => field.querySelectorAll(".bubble-slot").forEach((slot) => {
          if (slot._respawning || getComputedStyle(field).opacity === "0") return;
          if (targets.some((target) => touchesDandelion(slot, target))) slot.dispatchEvent(new Event("bubble:collision"));
        }));
      }
      collisionRaf = requestAnimationFrame(frame);
    };
    collisionRaf = requestAnimationFrame(frame);
  };
  const bindCollisionRespawn = (slot, relocate) => slot.addEventListener("bubble:collision", () => {
    if (slot._respawning) return;
    slot._respawning = true;
    slot.classList.add("bubble-collision");
    window.setTimeout(() => {
      relocate(slot);
      slot.style.setProperty("--ddelay", "0s");
      slot.classList.remove("bubble-collision");
      slot._respawning = false;
    }, 420);
  });

  const fill = (wrap, layout, accept) => {
    const pool = buildPool(layout, accept);
    const taken = new Array(pool.length).fill(false);
    const sizeScales = shuffledSizeScales(layout.length);

    const place = (slot, idx) => {
      const p = pool[idx];
      const ang = Math.random() * Math.PI * 2, amp = DRIFT();
      slot.style.setProperty("--bx", p.x.toFixed(2) + "%");
      slot.style.setProperty("--by", p.y.toFixed(2) + "%");
      slot.style.setProperty("--bs", (p.s * slot._sizeScale).toFixed(2) + "%");
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
      slot._sizeScale = sizeScales[i];
      setBatchCycle(slot, i, layout.length);
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
      bindCollisionRespawn(slot, relocate);
    });
    watchCollisions(wrap);
  };

  // Static motif filler (state 2): each bubble is a small copy of the dandelion
  // puff (#sub-purple-motif) at a FIXED spot. `b.m` marks a magenta bubble.
  const SVGNS = "http://www.w3.org/2000/svg";
  // The reference composition is fixed: each authored entry supplies both its
  // centre and its diameter, so reloads preserve the exact arrangement.
  const fillMotif = (wrap, layout, motifId) => {
    const sizeScales = shuffledSizeScales(layout.length);
    const pool = buildPool(layout);
    const taken = new Array(pool.length).fill(false);
    const place = (slot, idx) => {
      const p = pool[idx];
      slot.style.setProperty("--bx", p.x.toFixed(2) + "%");
      slot.style.setProperty("--by", p.y.toFixed(2) + "%");
      slot.style.setProperty("--bs", (p.s * slot._sizeScale).toFixed(2) + "%");
    };
    const relocate = (slot) => {
      const current = slot._pi;
      if (current != null) taken[current] = false;
      const free = pool.map((_, i) => i).filter((i) => !taken[i] && i !== current);
      const options = free.filter((i) => !current || d2(pool[i].x, pool[i].y, pool[current].x, pool[current].y) >= 25);
      const next = (options.length ? options : free)[(Math.random() * (options.length || free.length)) | 0];
      if (next == null) { if (current != null) taken[current] = true; return; }
      taken[next] = true;
      slot._pi = next;
      place(slot, next);
    };
    layout.forEach((b, i) => {
      const slot = document.createElement("div");
      slot.className = "bubble-slot bubble-motif-slot";
      slot._sizeScale = sizeScales[i];
      slot._pi = i;
      taken[i] = true;
      place(slot, i);
      setBatchCycle(slot, i, layout.length);
      const angle = Math.random() * Math.PI * 2;
      slot.style.setProperty("--dx", (Math.cos(angle) * 2.6).toFixed(2) + "cqw");
      slot.style.setProperty("--dy", (Math.sin(angle) * 2.6).toFixed(2) + "cqw");
      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("viewBox", "-1.12 -1.12 2.24 2.24");
      svg.setAttribute("class", "bubble-motif" + (b.m ? " bubble--magenta" : ""));
      svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS(SVGNS, "use");
      use.setAttribute("href", motifId);
      svg.appendChild(use);
      slot.appendChild(svg);
      wrap.appendChild(slot);
      slot.addEventListener("animationiteration", () => relocate(slot));
      bindCollisionRespawn(slot, relocate);
    });
    watchCollisions(wrap);
  };

  // 5 extra state-1 bubbles, hand-placed into the empty teal space just to the
  // LEFT of the purple plant (between the two dandelions, below their heads). They
  // are PINNED (no migration) so they stay exactly here, but still drift + fade
  // like the rest of the ambient field. Verified clear of both plants and tails.
  const EXTRA1 = [
    { x: 57.0, y: 62.0, s: 3.8 },
    { x: 55.0, y: 67.0, s: 3.4 },
    { x: 53.0, y: 69.0, s: 2.8 },
    { x: 54.0, y: 72.0, s: 3.0 },
    { x: 50.0, y: 74.0, s: 3.6 },
  ];
  const addFixed = (wrap, layout) => {
    const sizeScales = shuffledSizeScales(layout.length);
    layout.forEach((b, i) => {
      const slot = document.createElement("div");
      slot.className = "bubble-slot";
      const dur = 11 + (i % 5) * 0.9;
      const frac = (i * 0.61803398875) % 1;
      const ang = i * 2.399963;
      slot.style.setProperty("--bx", b.x + "%");
      slot.style.setProperty("--by", b.y + "%");
      slot.style.setProperty("--bs", (b.s * sizeScales[i]).toFixed(2) + "%");
      slot.style.setProperty("--ddur", dur.toFixed(1) + "s");
      slot.style.setProperty("--ddelay", (-frac * dur).toFixed(2) + "s");
      slot.style.setProperty("--dx", (Math.cos(ang) * 2.6).toFixed(2) + "cqw");
      slot.style.setProperty("--dy", (Math.sin(ang) * 2.6).toFixed(2) + "cqw");
      const img = document.createElement("img");
      img.className = "bubble";
      img.src = ASSETS[i % ASSETS.length];
      img.alt = "";
      img.decoding = "async";
      slot.appendChild(img);
      wrap.appendChild(slot);
    });
  };

  const build = () => {
    const app = document.querySelector(".app");
    if (!app || app.querySelector(".bubbles--purple")) return;

    // State-1 field: the ambient composition, kept off the plants by accept1.
    const wrap = document.createElement("div");
    wrap.className = "bubbles bubbles--drift bubbles--purple";
    wrap.setAttribute("aria-hidden", "true");
    fill(wrap, LAYOUT, accept1);
    fill(wrap, LAYOUT_HALO, acceptHalo); // the ring hugging the purple sub-branches
    addFixed(wrap, EXTRA1); // 5 extra bubbles in the empty space left of the purple plant
    app.prepend(wrap);

    // State-2 field: puff-motif bubbles hand-placed to the reference (with the
    // magenta ones), hidden until labels.js lights it. Static -- no drift/migration.
    const wrap2 = document.createElement("div");
    wrap2.className = "bubbles bubbles--motif bubbles--phase2 bubbles--phase2-purple";
    wrap2.setAttribute("aria-hidden", "true");
    fillMotif(wrap2, LAYOUT2, "#sub-purple-motif");
    app.prepend(wrap2);

    // State-3 field: the halo around the CENTRED purple plant, hidden until a purple
    // drill lights it (see the drill listeners below).
    const wrap3 = document.createElement("div");
    wrap3.className = "bubbles bubbles--drift bubbles--phase3 bubbles--phase3-purple";
    wrap3.setAttribute("aria-hidden", "true");
    fill(wrap3, LAYOUT3);
    app.prepend(wrap3);

    // Drill wiring: light the purple halo only while PURPLE is the drilled plant,
    // and only AFTER it has finished growing.
    // Light the purple halo the moment a PURPLE drill begins, so it is present and
    // STAYS while the plant grows into it (not faded out then back in after). A
    // green drill clears it; `grown` re-asserts as a safety net.
    const litPurple = (on) => wrap3.classList.toggle("is-lit", on);
    const setPurple = (e) => litPurple(!!e.detail && e.detail.color === "purple");
    document.addEventListener("dandelion:drillstart", setPurple);
    document.addEventListener("dandelion:grown", setPurple);
    document.addEventListener("dandelion:reset", () => litPurple(false));
    document.addEventListener("dandelion:undrill", () => litPurple(false));

    console.log(
      `[purple bubbles] ${LAYOUT.length} state-1 + ${LAYOUT2.length} state-2 + ${LAYOUT3.length} state-3 bubbles placed`
    );
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", build);
  else build();
})();
