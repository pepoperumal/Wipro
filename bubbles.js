/* Green bubble cluster.
 *
 * The layout below is a fixed table, resolved once and written out -- nothing
 * is placed at run time. Positions come from a phyllotaxis (golden-angle)
 * spiral over the green side, biased so the field crowds around the flower and
 * thins toward the top and bottom of the screen.
 *
 * Nothing touches anything on screen. The dandelion's circles, its stem and
 * every painted line of text are keep-outs, each widened by a safety gap. The
 * circles' gap also covers how far they travel while animating, and the text
 * is measured per line rather than per element -- a block heading reports its
 * whole container width even when the glyphs fill a third of it.
 *
 * Clearance was checked against the whole drift cycle, not just the resting
 * positions: a bubble swells to 1.06x and wanders up to DRIFT + LEAN from
 * home, so two neighbours can close on each other by twice that.
 *
 *   t  asset: 0 = SmallBubbleGreen1, 1 = SmallBubbleGreen2, 2 = 3.png
 *   x  centre, % of the scene's width
 *   y  centre, % of the scene's height
 *   s  diameter, % of the scene's width
 *   w  which wave it belongs to
 *
 * Percentages throughout, so the cluster holds its shape at any size.
 * The PNGs are drawn untouched -- no tint, no glow, no opacity scaling; only
 * the drift cycle's fade in and out touches their opacity.
 */
(() => {
  "use strict";

  /* Three assets, mixed on a fixed nine-step walk so no type repeats twice
     running: green1 is a soft halo, green2 an open ring, 3.png a solid disc.
     3.png carries far more ink than the other two, so it is placed smaller --
     at matched sizes it reads as a blob rather than a bubble. */
  const ASSETS = ["SmallBubbleGreen1.png", "SmallBubbleGreen2.png", "3.png"];

  const DRIFT = 0.5;   // travel, in cqw
  const LEAN = 0.5;    // extra upward bias; DRIFT + LEAN is the clearance budget

  /* Three designed patterns take the screen in turn -- top arc, then the
     crescent around the flower, then the bottom flow -- each fading up and
     away before the next arrives. `w` in the table is which pattern a bubble
     belongs to; sharing a delay is what makes a pattern read as one shape
     rather than a drizzle.
     STEP is a pattern's whole turn; the keyframes only keep it visible for
     the first ~40% of that, which is the gap between one pattern leaving and
     the next arriving. */
  const WAVES = 3;
  const STEP = 5;
  const CYCLE = WAVES * STEP;
  // Softens a pattern's edge so it eases in rather than switching on as one
  // block. Kept small: it extends the visible window, which must stay inside
  // one pattern's turn or two patterns end up on screen at once.
  const JITTER = 0.25;

  const LAYOUT = [
    { t: 0, x: 6.30, y: 9.77, s: 3.20, w: 0 },
    { t: 1, x: 11.51, y: 9.42, s: 2.40, w: 0 },
    { t: 0, x: 13.72, y: 6.57, s: 3.90, w: 0 },
    { t: 1, x: 19.54, y: 7.26, s: 2.80, w: 0 },
    { t: 0, x: 28.67, y: 5.83, s: 3.20, w: 0 },
    { t: 1, x: 33.53, y: 6.79, s: 2.40, w: 0 },
    { t: 0, x: 42.97, y: 6.66, s: 2.80, w: 0 },
    { t: 1, x: 52.46, y: 7.27, s: 3.20, w: 0 },
    { t: 0, x: 55.78, y: 9.15, s: 2.40, w: 0 },
    { t: 1, x: 62.29, y: 8.52, s: 3.90, w: 0 },
    { t: 2, x: 8.02, y: 44.52, s: 2.52, w: 0 },
    { t: 0, x: 13.74, y: 44.90, s: 2.50, w: 0 },
    { t: 1, x: 17.92, y: 42.18, s: 4.00, w: 0 },
    { t: 0, x: 23.80, y: 43.55, s: 2.90, w: 0 },
    { t: 1, x: 34.20, y: 44.05, s: 2.50, w: 0 },
    { t: 0, x: 39.97, y: 42.07, s: 4.00, w: 0 },
    { t: 1, x: 44.69, y: 44.19, s: 2.90, w: 0 },
    { t: 0, x: 54.20, y: 46.05, s: 2.50, w: 0 },
    { t: 1, x: 61.16, y: 44.97, s: 4.00, w: 0 },
    { t: 0, x: 7.06, y: 53.76, s: 3.80, w: 1 },
    { t: 1, x: 3.68, y: 56.18, s: 2.70, w: 1 },
    { t: 2, x: 8.80, y: 58.86, s: 3.18, w: 1 },
    { t: 0, x: 4.73, y: 61.42, s: 3.10, w: 1 },
    { t: 1, x: 4.34, y: 66.60, s: 2.70, w: 1 },
    { t: 0, x: 10.55, y: 68.78, s: 4.30, w: 1 },
    { t: 1, x: 7.70, y: 71.64, s: 3.10, w: 1 },
    { t: 0, x: 9.81, y: 76.75, s: 2.70, w: 1 },
    { t: 1, x: 58.01, y: 52.74, s: 3.60, w: 1 },
    { t: 0, x: 62.30, y: 54.97, s: 2.60, w: 1 },
    { t: 1, x: 62.72, y: 60.36, s: 3.00, w: 1 },
    { t: 0, x: 61.41, y: 63.02, s: 3.60, w: 1 },
    { t: 1, x: 63.98, y: 65.72, s: 2.60, w: 1 },
    { t: 2, x: 58.02, y: 68.03, s: 3.11, w: 1 },
    { t: 0, x: 61.09, y: 70.89, s: 3.00, w: 1 },
    { t: 1, x: 58.26, y: 73.29, s: 3.60, w: 1 },
    { t: 0, x: 59.16, y: 76.20, s: 2.60, w: 1 },
    { t: 1, x: 29.94, y: 94.53, s: 3.60, w: 2 },
    { t: 0, x: 35.39, y: 91.40, s: 4.20, w: 2 },
    { t: 1, x: 41.51, y: 91.70, s: 3.00, w: 2 },
    { t: 0, x: 48.80, y: 89.34, s: 2.60, w: 2 },
    { t: 1, x: 47.17, y: 86.18, s: 4.20, w: 2 },
    { t: 0, x: 53.25, y: 85.88, s: 3.00, w: 2 },
    { t: 1, x: 59.31, y: 82.95, s: 2.60, w: 2 },
    { t: 2, x: 56.51, y: 79.96, s: 3.11, w: 2 },
    { t: 0, x: 62.41, y: 79.22, s: 3.00, w: 2 },
    { t: 1, x: 36.22, y: 87.69, s: 3.00, w: 2 },
    { t: 0, x: 38.33, y: 85.07, s: 4.00, w: 2 },
    { t: 1, x: 47.62, y: 82.02, s: 3.00, w: 2 },
    { t: 0, x: 48.40, y: 79.23, s: 4.00, w: 2 },
    { t: 1, x: 56.33, y: 75.46, s: 3.00, w: 2 },
    { t: 0, x: 56.26, y: 72.64, s: 4.00, w: 2 },
  ];

  /* Drift, duration and delay are derived from each bubble's index, so the
     motion varies from one to the next but is identical on every reload. */
  const mulberry = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const build = () => {
    const app = document.querySelector(".app");
    if (!app) return console.warn("[bubbles] no .app to attach to");
    if (app.querySelector(".bubbles")) return;

    const layer = document.createElement("div");
    layer.className = "bubbles";
    layer.setAttribute("aria-hidden", "true");

    LAYOUT.forEach((b, i) => {
      const rng = mulberry(0x9e3779b9 + i * 7919);
      const dir = rng() * Math.PI * 2;
      const len = DRIFT * (0.45 + rng() * 0.55);

      const img = document.createElement("img");
      img.className = "bubble";
      img.src = ASSETS[b.t];
      img.alt = "";
      img.decoding = "async";
      img.style.cssText = [
        `--bx:${b.x}%`,
        `--by:${b.y}%`,
        `--bs:${b.s}%`,
        `--bdx:${(Math.cos(dir) * len).toFixed(2)}cqw`,
        /* A gentle upward lean, so the cluster feels buoyant rather than inert.
           It is capped at LEAN because it adds to the drift, and the layout's
           clearance was computed against DRIFT + LEAN -- an unbudgeted lean
           will quietly push neighbours into each other. */
        `--bdy:${(Math.sin(dir) * len * 0.8 - LEAN * (0.3 + rng() * 0.7)).toFixed(2)}cqw`,
        `--brot:${((rng() - 0.5) * 34).toFixed(1)}deg`,
        `--bdur:${CYCLE}s`,
        // the wave sets when this bubble rises; the jitter keeps its own
        // group from snapping on as one block
        `--bdelay:${(-(b.w * STEP + rng() * JITTER)).toFixed(3)}s`,
      ].join(";");
      layer.appendChild(img);
    });

    app.prepend(layer); // first child, so it paints behind the dandelions
    console.log(`[bubbles] ${LAYOUT.length} green bubbles placed`);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
