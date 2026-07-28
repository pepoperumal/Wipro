/* Info-box popover -- the FINAL step of a drill-down.
 *
 * The card does NOT appear on click. Clicking a sub-branch runs drilldown.js:
 * the scene fades out, then the selected dandelion grows in the centre (tail ->
 * circle -> sub-branches, staggered). Only once that whole grow finishes does
 * drilldown.js fire `dandelion:grown`, and THAT is when this card pops up -- with
 * the PNG's circular part aligned over the CLICKED sub-branch's circle (its slot,
 * arranged around the grown head -- NOT the main head), so it reads as fitted and
 * attached to that sub-branch. `dandelion:drillstart` fires the instant a new
 * drill begins, clearing any existing card before the fade-out -- so the box is
 * never visible during the fade or during the grow.
 *
 * Green marks the selected sub-branch, and it appears WITH the card -- never
 * ahead of it. The labels all fade back in plain white after the grow; the green
 * wording arrives only as the card pops over the clicked circle.
 *
 * The rounded-rectangle body extends outward into free space; near the right edge
 * the card is mirrored so it opens the other way (and flipped vertically if it
 * would leave the top). The card fades + expands out of the circle, slow and soft.
 *
 * The PNG is used directly -- no shape is recreated in HTML/CSS. It scales with
 * the 9:20 layout because its size is derived from the circle's live on-screen
 * size; the asset's own transparency / border / gradient / proportions are
 * untouched (width drives the size, height stays auto -> no stretch or crop). The
 * card never catches input; no click ring / outline / ripple / debug is drawn.
 */
(() => {
  "use strict";

  const PNG = "InfoBox.png"; // exact on-disk filename (case-sensitive-safe)
  // circle centre + diameter as fractions of the PNG (measured from the asset)
  const CX = 0.139, CY = 0.832, CD = 0.274;
  const RATIO = 375 / 453;        // PNG height / width

  // How much of the sub-branch the card's circle covers, as a fraction of the
  // PUFF'S OWN RADIUS. The motif is authored with its glow circle at r=1, so
  // this reads directly against the puff's geometry:
  //
  //     0.629 / 0.757 / 0.886   the three rings of dots
  //     0.911                   the outer edge of the outermost dots
  //     1.0                     the glow's own edge, by then faded to almost nothing
  //
  // The circle has to COVER the whole sub-branch, so it is sized past the last
  // ring of dots with a little air: nothing of the puff is left sticking out
  // around it, and no ring is sliced through the middle by its edge.
  //
  // This is the ONE number that sets the card's scale -- the PNG's circle is a
  // fixed 27.4% of its width, so the whole card is derived from it. Raising it
  // grows the card body too; that ratio is baked into the asset.
  const SUB_FIT = 0.95;
  // The pop is a simple fade + soft scale-up, driven in CSS (@keyframes
  // infobox-pop). The wording is the one thing still timed here, so it can arrive
  // a beat after the card settles.
  const TEXT_DELAY_MS = 60;       // the wording comes in with the circle, not after it
  const TEXT_MS = 500;
  // Gentle ease-out for the wording's small lift into place (no overshoot).
  const EASE_SOFT = "cubic-bezier(0.33, 1, 0.68, 1)";
  const MARGIN = 8;               // keep this far inside the screen edges

  let current = null;
  let track = null; // { target, W, H, vcx, vcy } -- keeps the card glued to the circle
  let raf = 0;
  let hiddenLabel = null; // the original sub-branch label, hidden while the box shows it

  const appEl = () => document.querySelector(".app");

  // Re-pin the card's circle onto the puff every frame, so it stays attached as
  // the flower sways and drifts. Only position is tracked; the size is fixed at
  // spawn, which is correct here -- the puff's rendered size does not change once
  // it has settled. Scale/opacity belong to the pop.
  //
  // Position is written to `translate`, NEVER to left/top. left/top are layout
  // properties: setting them every frame forces the whole page through layout,
  // which is what caps a follower like this somewhere around 60fps and makes it
  // stutter whenever anything else is animating. `translate` is a transform, so
  // the frame costs a compositor update and nothing else -- and it composes with
  // the `transform: scale()` the pop rides on instead of fighting it (individual
  // transform properties apply in order translate -> rotate -> scale -> transform,
  // all about the same transform-origin).
  //
  // One read then one write, once per frame: never interleaved, so the layout
  // flush the rect read needs can't turn into read/write thrashing.
  function follow() {
    if (!current || !track) { raf = 0; return; }
    const a = appEl();
    if (a) {
      const appRect = a.getBoundingClientRect();
      // The motif, not the slot: the slot's box also contains the label <text>,
      // which would drag both the centre and the width off the puff itself.
      const r = track.motif.getBoundingClientRect();
      const cx = r.left + r.width / 2 - appRect.left;
      const cy = r.top + r.height / 2 - appRect.top;
      const x = cx - track.vcx * track.W;
      const y = cy - track.vcy * track.H;
      // Skip the write when nothing moved a visible amount -- during the pop the
      // flower is nearly still, and a no-op write still dirties the frame.
      if (Math.abs(x - track.x) > 0.05 || Math.abs(y - track.y) > 0.05) {
        track.x = x;
        track.y = y;
        current.style.translate = x + "px " + y + "px";
      }
    }
    raf = requestAnimationFrame(follow);
  }

  function stopFollow() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    track = null;
  }

  // Remove the card immediately (no fade), so nothing lingers into a fade-out.
  function clearNow() {
    stopFollow();
    if (current) { current.remove(); current = null; }
    if (hiddenLabel) {
      hiddenLabel.style.visibility = "";
      hiddenLabel.classList.remove("dlabel-selected"); // back to plain white
      hiddenLabel = null;
    }
  }

  // Spawn the card with its circle aligned over `target`'s circle (diameter =
  // target box * fit), fading + expanding out of that circle. `lines`/`color`
  // render the selected wording as a green overlay ABOVE the PNG.
  function spawn(target, fit, lines, color, origLabel) {
    const a = appEl();
    if (!a) return;
    const appRect = a.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2 - appRect.left; // circle centre, px within .app
    const cy = r.top + r.height / 2 - appRect.top;

    // Measure the MOTIF, not the slot. The slot's box grows to fit everything in
    // it, and one of those things is the label <text> -- a sibling of the motif,
    // not part of the puff. A long label (purple's run to four lines) would push
    // that box out and silently inflate the circle with it. The <use> is exactly
    // the puff and nothing else, so it is the honest ruler.
    const motif = target.querySelector("use");
    const pr = motif ? motif.getBoundingClientRect() : r;
    const D = pr.width * fit;      // PNG-circle diameter, covering the puff
    const W = D / CD;              // -> full PNG width
    const H = W * RATIO;

    // Open into free space: the card is large next to a sub-branch, so a fixed
    // direction can cover the OTHER sub-branches of the grown dandelion. Collect
    // the sibling sub-branch boxes, then score all four open directions (mirror x
    // / flip y) and keep the one that covers those siblings the least while still
    // staying on screen. The anchored circle never moves -- only the body swings
    // to the empty side -- so the card no longer sits on top of a sub-branch.
    const branch = target.closest(".branch");
    const siblings = branch
      ? [...branch.querySelectorAll(".sub-slot")]
          .filter((s) => s !== target && !s.classList.contains("sub-hidden"))
          .map((s) => {
            const rr = s.getBoundingClientRect();
            return {
              l: rr.left - appRect.left, t: rr.top - appRect.top,
              r: rr.right - appRect.left, b: rr.bottom - appRect.top,
            };
          })
      : [];

    const scoreDir = (fx, fy) => {
      const l = cx - (fx ? 1 - CX : CX) * W;
      const t = cy - (fy ? 1 - CY : CY) * H;
      const rt = l + W, bt = t + H;
      // off-screen overflow first (weighted heavily -- a clipped card is worse
      // than a little overlap), then the area that covers sibling sub-branches.
      const off =
        Math.max(0, MARGIN - l) + Math.max(0, rt - (appRect.width - MARGIN)) +
        Math.max(0, MARGIN - t) + Math.max(0, bt - (appRect.height - MARGIN));
      let ov = 0;
      for (const s of siblings) {
        const w = Math.min(rt, s.r) - Math.max(l, s.l);
        const h = Math.min(bt, s.b) - Math.max(t, s.t);
        if (w > 0 && h > 0) ov += w * h;
      }
      return off * 100000 + ov;
    };

    let flipX = false, flipY = false, best = Infinity;
    for (const fx of [false, true]) {
      for (const fy of [false, true]) {
        const sc = scoreDir(fx, fy);
        if (sc < best) { best = sc; flipX = fx; flipY = fy; }
      }
    }

    const vcx = flipX ? 1 - CX : CX; // visual circle centre within the card
    const vcy = flipY ? 1 - CY : CY;

    clearNow(); // never stack two cards

    const fx = document.createElement("div");
    fx.className = "infobox-fx";
    // left/top stay at 0 (see the stylesheet); the card is placed entirely by
    // `translate`, so every later reposition is a compositor update rather than
    // a layout pass. See follow().
    const x0 = cx - vcx * W;
    const y0 = cy - vcy * H;
    fx.style.translate = x0 + "px " + y0 + "px";
    fx.style.width = W + "px";
    fx.style.height = H + "px";
    // Simple, smooth pop: the whole card fades in and eases up from a small scale,
    // anchored on its circle (transform-origin set inline, vcx/vcy already fold in
    // the open direction) so it grows gently out of the clicked sub-branch. One
    // clean motion -- no clip, no stages. The scale rides `transform`, which
    // composes with the `translate` follow() re-pins to the swaying flower.
    fx.style.transformOrigin = vcx * 100 + "% " + vcy * 100 + "%";

    // Flip the PNG toward the open direction; the scale flip lives on the img so
    // the fx scale-pop and the mirror never collide (and the wording, a child of
    // fx, is never mirrored).
    const img = document.createElement("img");
    img.className = "infobox-img";
    img.src = PNG;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.style.scale = (flipX ? -1 : 1) + " " + (flipY ? -1 : 1);
    fx.appendChild(img);

    // The selected wording, as a SEPARATE overlay placed AFTER the image in the
    // DOM and given a higher layer -- so it always sits ABOVE the PNG, centred on
    // the circular part. It rides the same parent's grow, so it stays on top
    // throughout the animation. (The img is z-index 20, this is z-index 30.)
    if (lines && lines.length) {
      const label = document.createElement("div");
      label.className = "infobox-label";
      const cd = CD * W; // the PNG circle's diameter, px
      label.style.left = vcx * W + "px";
      label.style.top = vcy * H + "px";
      label.style.width = cd * 1.15 + "px";
      label.style.fontSize = cd * (color === "purple" ? 0.088 : 0.12) + "px";
      lines.forEach((ln, i) => {
        if (i) label.appendChild(document.createElement("br"));
        label.appendChild(document.createTextNode(ln));
      });
      // Hidden and sitting a little low, ready for the second beat below.
      label.style.opacity = "0";
      label.style.translate = "0 6%";
      fx.appendChild(label);
    }

    // Hide the sub-branch's ORIGINAL label so the same text is not duplicated
    // (the overlay above now carries it); clearNow() restores it. Marking it
    // selected here -- with the card, never before it -- keeps the label
    // underneath in the same state as the wording on top, so whichever one is
    // on screen says the same thing about which sub-branch is selected.
    if (hiddenLabel) hiddenLabel.style.visibility = "";
    hiddenLabel = origLabel || null;
    if (hiddenLabel) {
      hiddenLabel.style.visibility = "hidden";
      hiddenLabel.classList.add("dlabel-selected");
    }

    a.appendChild(fx);
    current = fx;

    // Keep the card's circle pinned to the puff as it gently moves. Track the
    // motif, not the slot -- same reason it is the ruler for the size.
    track = { motif: motif || target, W, H, vcx, vcy, x: x0, y: y0 };
    raf = requestAnimationFrame(follow);

    // The bloom itself needs no arming here: the CSS `animation` on .infobox-fx
    // runs the moment the fresh element is inserted, and `both` fill paints the
    // 0% pose (hidden, clipped to nothing) before the first frame -- so there is
    // no flash and no forced reflow. The card blooms in one continuous gesture.
    //
    // The wording is the only thing still timed in JS, so it can lift into place
    // exactly as the body finishes unfurling -- a small fade + rise, no overshoot.
    // The card's bloom is a CSS animation (needs no arming), but the label rides a
    // CSS *transition*, which on a freshly-inserted node would be coalesced away
    // unless its start pose is committed first -- so one forced reflow arms it. It
    // costs a single synchronous layout, once, at spawn (not per frame).
    const label = fx.querySelector(".infobox-label");
    if (label) {
      void fx.offsetWidth;
      label.style.transition =
        `opacity ${TEXT_MS / 1000}s ease-out ${TEXT_DELAY_MS / 1000}s, ` +
        `translate ${TEXT_MS / 1000}s ${EASE_SOFT} ${TEXT_DELAY_MS / 1000}s`;
      label.style.opacity = "1";
      label.style.translate = "0 0";
    }
  }

  // Show the card once the drill's grow has fully finished, attached to the
  // CLICKED sub-branch's circle (its slot, arranged around the grown head) --
  // never the main head. drilldown.js passes the clicked slot suffix.
  function onGrown(ev) {
    const d = ev.detail || {};
    if (!d.color) return;
    const branch = document.querySelector(`.branch--${d.color}`);
    if (!branch) return;
    // the exact clicked sub-branch; fall back to the first visible sub so the
    // anchor is always a sub-branch circle, never the main head.
    let target = d.slot && branch.querySelector(`.sub-slot--${d.slot}`);
    if (!target || target.classList.contains("sub-hidden")) {
      target = [...branch.querySelectorAll(".sub-slot")]
        .find((s) => !s.classList.contains("sub-hidden")) || null;
    }
    if (target) {
      const origLabel = target.querySelector(".dlabel-svg");
      spawn(target, SUB_FIT, d.lines || null, d.color, origLabel);
    }
  }

  function init() {
    // Purely reactive to the drill lifecycle -- this never handles the click
    // itself, so the drill-down runs untouched and the box is the last beat.
    document.addEventListener("dandelion:drillstart", clearNow); // gone before the fade
    // Shown only after the grow AND the label fade-in have finished (labels.js
    // fires this once the selected dandelion's labels are fully in view).
    document.addEventListener("dandelion:labelsshown", onGrown);
    // The scene returns to state 1 (10s idle / empty-space click): close the card.
    document.addEventListener("dandelion:reset", clearNow);
    // Stepping one level back (state 3 -> state 2) also closes the card.
    document.addEventListener("dandelion:undrill", clearNow);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
