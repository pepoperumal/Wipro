/* Drill-down interaction for the dandelion sub-branches.
 *
 * Click any green or purple sub-branch to drill into it:
 *   1. the clicked node is remembered;
 *   2. both dandelions and every bubble field fade out (background + intro copy
 *      are untouched -- they live outside the faded targets);
 *   3. once faded, the clicked node is re-spawned AS the new main dandelion, on
 *      its own colour's branch, with a STAGED entrance:
 *        a. the tail/stem grows up from the bottom,
 *        b. the main circle fades and scales in,
 *        c. its sub-branches appear one by one (staggered).
 *
 * Circles carry no text/labels for now -- every circle stays visually empty.
 *
 * The interaction is data-driven and recursive: `render()` + `drillTo()` work at
 * any depth, so every sub-branch can carry its own `children` and the same
 * staged spawn plays again one level down. Colour is preserved automatically
 * because a node is always rendered on the branch of its own colour.
 *
 * The staged spawn only ever animates FREE properties -- the stem's `clip-path`,
 * the head's `opacity`, and the branch's `scale` (pivoted at the head centre via
 * .is-centered, so the circle stays pinned at the exact centre of the screen and
 * the plant grows in place -- never sliding in from a side or its old position).
 * The idle sway / rise / bloom / drift animations use `rotate` / `scale`(stem,
 * head) / `translate`, so they keep running through the spawn with no conflict
 * and no hand-off jump.
 *
 * ONCE CENTRED, A PRESS NO LONGER REGROWS. The staged entrance is the transition
 * INTO the centred view, so it plays once. After that the plant is standing
 * there with its labels up, and pressing another sub-branch only changes which
 * sub-branch the card belongs to: the card moves to the pressed puff and that
 * label takes the green, while the plant, its labels and the whole scene stay
 * exactly as they are. See onSelect() -- .is-centered is what tells the two
 * cases apart.
 *
 * A `busy` guard blocks repeat clicks during a transition; clicks are inert
 * while the sub-branch editor (body.is-editing) is active. No click ring /
 * highlight / outline is drawn.
 */
(() => {
  "use strict";

  const HIDE = "is-faded";
  const FADE_SELECTORS =
    ".branch--green, .branch--purple, .bubbles--green, .bubbles--purple";

  // Slow, premium timeline (ms), measured from the end of the fade-out. Each
  // stage waits for the previous one to FINISH (plus a clear gap), so the tail,
  // the circle and the subs never grow together -- they arrive strictly in turn.
  // The staged grow is halved from the original slower timeline so the info box /
  // text pops in ~2x earlier: the tail, circle and subs all arrive at double speed,
  // so `dandelion:grown` (which hands off to the label fade + card pop) fires about
  // twice as soon. FADE_MS is left matched to the shared 0.8s CSS fade-out so the
  // old dandelions have fully faded before the new plant starts growing.
  const FADE_MS = 800;         // matches the CSS opacity transition (fade-out)
  const STEM_MS = 1500;        // (a) tail draws up from its fixed bottom anchor (1.5s)
  const HEAD_DELAY_MS = 1650;  // circle waits until the tail has finished (+150ms gap)
  const HEAD_MS = 1000;        // (b) main circle grows/eases in at the centre (1s)
  const BRANCH_MS = 2650;      // gentle overall grow, ending exactly as the circle lands
  const SUBS_START_MS = 2825;  // (c) subs begin only after the circle finishes (+175ms gap)
  const REVEAL_LEAD_MS = 75;   // small pause before the first sub
  const REVEAL_STEP_MS = 250;  // 0.25s stagger between successive subs
  // After the grow: labels.js fades the labels in (~1.3s) then the info box pops
  // (~1s). Stay guarded for that whole tail so nothing can retrigger early.
  const POST_GROW_MS = 2600;
  // A reselect inside the third state moves only the card, so it needs nothing
  // like that guard -- just enough to swallow a double-tap.
  const RESELECT_MS = 320;

  // Compact centred size. Scaling about the head centre (see .is-centered) keeps
  // the circle exactly centred; a sub-1 resting size keeps the tail short so the
  // whole plant reads as "at the centre" rather than rising from the bottom edge.
  const START_SCALE = 0.5;     // pre-grow size
  const RESTING_SCALE = 1.0;   // final size = the dandelion's original size (no resize)
  const EASE = "ease-in-out"; // smooth, symmetric acceleration for every stage

  // ---- content tree ------------------------------------------------------
  // Each node: { title, children:[...] }. `title` is retained for structure /
  // future labels but is NOT rendered right now. A node's children map, in
  // order, onto the sub-slots of its colour's branch (max 4 green, 5 purple).
  // Give any node a richer `children` array to deepen the drill-down -- the
  // interaction is fully recursive, so no code changes are needed to add a level.
  //
  // The second level below is sample structure so the staged reveal is
  // demonstrable today; swap in the real child-branch data per node.
  const kids = (color, n) =>
    Array.from({ length: n }, (_, i) => ({ title: color + "-" + i, children: [] }));

  const TREE = {
    green: {
      color: "green",
      title: "ECO ENERGY",
      children: [
        { title: "Bold Bets on Ecology", children: kids("green", 4) },
        { title: "Deeper Analytics",      children: kids("green", 4) },
        { title: "Accolades",             children: kids("green", 4) },
        { title: "Solutions",             children: kids("green", 4) },
      ],
    },
    purple: {
      color: "purple",
      title: "ECO EYE",
      children: [
        { title: "Help Customers Become Green",           children: kids("purple", 5) },
        { title: "Widen Circle of Influence",             children: kids("purple", 5) },
        { title: "Make Wipro Ecologically Surplus",       children: kids("purple", 5) },
        { title: "Transparent Reporting & Risk Planning", children: kids("purple", 5) },
        { title: "Wipro Launches Eco Chapters",           children: kids("purple", 5) },
      ],
    },
  };

  // sub-slot class suffixes per colour, in child order
  const SLOTS = { green: ["g1", "g2", "g3", "g4"], purple: ["p1", "p2", "p3", "p4", "p5"] };

  let busy = false;
  let ready = false; // true only after Space -> full bloom + label reveal has finished

  const branchEl = (c) => document.querySelector(`.branch--${c}`);
  const slotEl = (s) => document.querySelector(`.sub-slot--${s}`);

  // Configure a branch to represent `node`: decide which sub-slots exist for
  // this node's children and arm the visible ones in the hidden "pre-reveal"
  // pose. No labels are drawn. Reusable at any depth.
  function render(color, node) {
    const b = branchEl(color);
    if (!b) return;
    b._node = node;
    SLOTS[color].forEach((s, i) => {
      const slot = slotEl(s);
      if (!slot) return;
      const child = (node.children && node.children[i]) || null;
      slot._child = child;
      slot.classList.remove("sub-reveal");
      const sub = slot.querySelector(".sub");
      if (sub) sub.style.transitionDelay = "";
      if (child) {
        slot.classList.remove("sub-hidden");
        slot.classList.add("sub-prereveal");
      } else {
        slot.classList.add("sub-hidden");
        slot.classList.remove("sub-prereveal");
      }
    });
  }

  // (a)+(b): the tail grows from the bottom; then, ONLY once it has finished, the
  // circle scales up from 0 to full; then (c) the subs spawn once the circle lands.
  function spawn(color) {
    const b = branchEl(color);
    if (!b) return;
    const stem = b.querySelector(".branch__stem");
    const head = b.querySelector(".branch__head");

    // pre-spawn poses, applied instantly (no transition), while still hidden.
    // .is-centered relocates the box AND pivots transform-origin at the head
    // centre, so the circle sits at the exact centre from the very first frame.
    b.style.transition = "none";
    b.classList.add("is-centered");
    b.classList.remove(HIDE);              // container visible; children staged
    b.style.scale = String(START_SCALE);   // start compact, about the head centre
    if (stem) { stem.style.transition = "none"; stem.style.clipPath = "inset(100% 0 0 0)"; }
    if (head) {
      // The circle starts as a POINT (scale 0), not faded. Its idle `bloom`
      // animation drives the CSS `scale` too, and an animation overrides an inline
      // scale -- so suspend the head's animations for the grow, then finishSpawn
      // hands them back. Opacity stays 1: the scale-from-0 is the whole reveal.
      head.style.transition = "none";
      head.style.animation = "none";
      head.style.opacity = "1";
      head.style.scale = "0";
    }
    void b.offsetWidth;                    // commit the pre-spawn frame

    // run the staged transitions -- all slow, all eased with the same soft settle
    b.style.transition = `scale ${BRANCH_MS / 1000}s ${EASE}`;
    b.style.scale = String(RESTING_SCALE); // grow in place, pinned at the centre
    if (stem) {
      stem.style.transition = `clip-path ${STEM_MS / 1000}s ${EASE}`;
      stem.style.clipPath = "inset(0 0 0 0)"; // (a) tail draws upward from the bottom
    }
    if (head) {
      // (b) the circle scales up from 0 -> full, but only AFTER the tail has drawn
      // (HEAD_DELAY_MS > STEM_MS). It grows about its own 50%/78% origin, so it
      // stays joined to the tail tip as it blooms open.
      head.style.transition = `scale ${HEAD_MS / 1000}s ${EASE} ${HEAD_DELAY_MS / 1000}s`;
      head.style.scale = "1";
    }

    // (c): subs pop in one by one, after the circle has arrived
    window.setTimeout(() => revealSubs(color), SUBS_START_MS);
  }

  function revealSubs(color) {
    SLOTS[color].forEach((s, i) => {
      const slot = slotEl(s);
      if (!slot || slot.classList.contains("sub-hidden")) return;
      const sub = slot.querySelector(".sub");
      if (sub) sub.style.transitionDelay = (REVEAL_LEAD_MS + i * REVEAL_STEP_MS) / 1000 + "s";
      slot.classList.remove("sub-prereveal");
      slot.classList.add("sub-reveal");
    });
  }

  // Clear the inline spawn overrides, handing the final look back to the idle
  // animations (and restoring the CSS opacity transition for the next fade-out).
  function finishSpawn(color) {
    const b = branchEl(color);
    if (!b) return;
    const stem = b.querySelector(".branch__stem");
    const head = b.querySelector(".branch__head");
    b.style.transition = "";
    // Keep b.style.scale at RESTING_SCALE (1.0 = original size): the branch has
    // no idle scale animation to hand back to (only sway/rotate).
    if (stem) { stem.style.transition = ""; stem.style.clipPath = ""; }
    // Clear the grow overrides AND restore the head's idle bloom/lift (we set
    // animation:none for the scale-from-0). scale:"" hands `scale` back to bloom,
    // which resumes seamlessly at scale 1.
    if (head) { head.style.transition = ""; head.style.opacity = ""; head.style.scale = ""; head.style.animation = ""; }
  }

  // The core transition. Identical for the first drill and every one after it,
  // so drilling deeper just calls it again.
  function drillTo(color, node, slot) {
    busy = true;
    // A new drill has begun: clear any existing info box NOW, so it is never on
    // screen during the fade-out or the grow that follows.
    document.dispatchEvent(new CustomEvent("dandelion:drillstart", { detail: { color, slot } }));
    document.querySelectorAll(FADE_SELECTORS).forEach((el) => el.classList.add(HIDE));

    window.setTimeout(() => {
      render(color, node);   // arm subs while everything is invisible
      spawn(color);          // staged entrance: stem -> circle -> subs
      const n = SLOTS[color].length;
      // Cover the last sub's start + its reveal, plus a buffer. The reveal is
      // the LONGEST of the three transitions on .sub-reveal (styles.css): the
      // pop is 0.62s but --petal-open -- the rings unfurling inside the puff --
      // runs 0.85s (both halved with the timeline), so the wait is measured
      // against that, not the pop.
      const total = SUBS_START_MS + REVEAL_LEAD_MS + n * REVEAL_STEP_MS + 925;
      window.setTimeout(() => {
        finishSpawn(color);
        // The whole grow (tail -> circle -> subs) is finished. This hands off to
        // labels.js, which fades the labels in and THEN releases the info box.
        document.dispatchEvent(new CustomEvent("dandelion:grown", { detail: { color, slot } }));
        // Stay guarded through the label fade-in + info-box pop, so no click or
        // Space can retrigger until the whole sequence has fully settled.
        window.setTimeout(() => { busy = false; }, POST_GROW_MS);
      }, total);
    }, FADE_MS + 40);
  }

  // Third state: the plant is already standing in the centre with its labels up,
  // so a click on another sub-branch is not a new drill -- it is just a change of
  // WHICH sub-branch the card belongs to. Nothing fades, nothing regrows; the
  // card simply moves to the sub that was pressed and that label takes the green.
  //
  // labels.js owns the wording, so it turns this into the same
  // `dandelion:labelsshown` the grow path ends with -- one code path spawns the
  // card, whether it arrived by growing or by reselecting.
  function reselect(color, slot) {
    busy = true;
    document.dispatchEvent(new CustomEvent("dandelion:reselect", { detail: { color, slot } }));
    // Only long enough to swallow a double-tap on the same puff; the card's own
    // pop is what the eye waits on, and it is free to be interrupted.
    window.setTimeout(() => { busy = false; }, RESELECT_MS);
  }

  function onSelect(color, index) {
    const b = branchEl(color);
    if (!b || !b._node) return;
    const slot = SLOTS[color][index];
    // .is-centered is set by spawn() and only ever true once this dandelion has
    // been drilled into -- i.e. it IS the "are we in the third state" flag.
    if (b.classList.contains("is-centered")) {
      reselect(color, slot);
      return;
    }
    // First drill, from the bloomed view: grow the plant into the centre (same
    // node -> its own subs + labels are preserved). The clicked slot is
    // remembered so its label greens and the box attaches to it.
    drillTo(color, b._node, slot);
  }

  function init() {
    // Enable sub-branch clicking only after Space -> the full bloom + label reveal
    // has completed (labels.js fires this).
    document.addEventListener("dandelion:labelsready", () => { ready = true; });

    for (const color of ["green", "purple"]) {
      const b = branchEl(color);
      if (!b) continue;
      b._node = TREE[color];
      SLOTS[color].forEach((s, i) => {
        const slot = slotEl(s);
        if (!slot) return;
        const trigger = (ev) => {
          if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
          if (!ready) return; // clicking is enabled only after the Space bloom + reveal
          if (busy) return; // block repeat clicks mid-transition
          if (document.body.classList.contains("is-editing")) return; // don't fight the editor
          ev.preventDefault();
          onSelect(color, i);
        };
        slot.addEventListener("click", trigger);
        slot.addEventListener("keydown", trigger); // slots carry tabindex="0"
      });
    }

    // Programmatic reset to the two root dandelions. Used by the Back UI and by
    // labels.js's auto-revert (10s idle / empty-space click) via `dandelion:reset`.
    window.dandelions = {
      reset() {
        busy = false;
        ready = false; // clicking is disabled again until the next Space bloom
        for (const color of ["green", "purple"]) {
          const b = branchEl(color);
          if (!b) continue;
          finishSpawn(color);
          b.style.scale = "";                  // drop the compact resting scale
          b.classList.remove("is-centered");   // back to the original corner position
          b._node = TREE[color];
          SLOTS[color].forEach((s) => {
            const slot = slotEl(s);
            if (!slot) return;
            slot.classList.remove("sub-hidden", "sub-prereveal", "sub-reveal");
            const sub = slot.querySelector(".sub");
            if (sub) sub.style.transitionDelay = "";
          });
        }
        document
          .querySelectorAll(FADE_SELECTORS)
          .forEach((el) => el.classList.remove(HIDE));
      },
    };

    // labels.js requests a full return to state 1 (bubbles back, plant recentred).
    document.addEventListener("dandelion:reset", () => window.dandelions.reset());

    // labels.js requests ONE step back: state 3 (drilled) -> state 2 (bloom).
    // Glide the drilled plant back to its corner and fade the other dandelion
    // back in, but leave the bubbles hidden and the labels up (labels.js re-shows
    // them). This is deliberately NOT a full reset -- the bubbles stay faded.
    document.addEventListener("dandelion:undrill", () => {
      busy = false;
      ready = true; // still in the bloomed view -> sub-branches remain clickable
      for (const color of ["green", "purple"]) {
        const b = branchEl(color);
        if (!b) continue;
        finishSpawn(color);
        if (b.classList.contains("is-centered")) {
          // ease the drilled plant sideways back to its corner rather than snapping
          b.style.transition =
            "left 0.55s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.8s ease-in-out";
          window.setTimeout(() => { b.style.transition = ""; }, 620);
        }
        b.style.scale = "";
        b.classList.remove("is-centered"); // -> corner (left eases back)
        b.classList.remove(HIDE);          // the non-drilled dandelion fades back in
        SLOTS[color].forEach((s) => {
          const slot = slotEl(s);
          if (!slot) return;
          slot.classList.remove("sub-hidden", "sub-prereveal", "sub-reveal");
          const sub = slot.querySelector(".sub");
          if (sub) sub.style.transitionDelay = "";
        });
      }
      // bubbles are intentionally left with `is-faded` -- state 2 has no bubbles.
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
