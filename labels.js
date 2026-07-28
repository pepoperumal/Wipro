/* Space-to-bloom transition (labelled dandelion view).
 *
 * Press Space once:
 *   1. the ambient bubbles STAY on screen, untouched (no fade-out/fade-in swap);
 *   2. both main dandelions stay fully visible;
 *   3. each dandelion blooms ONCE: its sub-branches (the "petals") first pull
 *      inward to the head centre, then open outward -- staggered -- to their
 *      normal places, and hold there (no replay). The main circle stays put and
 *      the stem is never touched;
 *   4. ONLY once every petal has reached its final place does a centred white
 *      label fade + gently scale into every circle (main head + subs).
 *
 * ATTACHMENT: every label is an SVG <text> that is a TRUE CHILD of its circle --
 * a sub label lives inside its sub-slot <g>; a head label lives at the centre of
 * the .subs layer (which already blooms / lifts / sways exactly with the head).
 * So a label inherits its circle's transforms natively and moves + scales with it
 * with zero lag, zero separate motion and no per-frame re-pinning. Nothing is
 * ever stretched: petals (and therefore labels) ride pure position + UNIFORM
 * scale -- never scaleX/scaleY -- so circles stay perfectly round, and at full
 * open the petal transform equals the authored CSS placement exactly.
 *
 * The only thing driven per frame is the petal bloom (a uniform scale + translate
 * on each sub-SLOT); the labels simply come along for the ride. Everything eases
 * with ease-in-out for smooth, natural motion.
 *
 * Space is guarded so it cannot retrigger while running; a drill-down clears
 * everything so nothing lingers. preventDefault() stops the page scrolling.
 */
(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const BUBBLES = ".bubbles--green, .bubbles--purple";
  const PHASE2 = ".bubbles--phase2"; // the sparse bloom-time bubble fields

  // Light (or dim) the 2nd-state bubble fields. They belong to the bloomed view
  // only: lit as the bloom settles, dimmed on the drill (state 3) and on the
  // return to state 1. The CSS 0.8s opacity transition makes both eases smooth.
  const litPhase2 = (on) =>
    document
      .querySelectorAll(PHASE2)
      .forEach((el) => el.classList.toggle("is-lit", on));

  // Full wording (unchanged).
  const LABELS = {
    green: {
      head: "ECO ENERGY",
      subs: {
        g1: "Bold bets on Ecology", g2: "Deeper analytics",
        g3: "Accolades", g4: "Solutions",
      },
    },
    purple: {
      head: "ECO EYE",
      subs: {
        p1: "Help Customers Become Green", p2: "Widen Circle of Influence",
        p3: "Transparent Reporting & Risk Planning",
        p4: "Make Wipro A Ecologically Surplus Organisation",
        p5: "Wipro Launches Eco Chapters",
      },
    },
  };

  // The SAME words, split across lines to sit cleanly inside a round circle (each
  // array joins with a single space back to the exact original wording).
  const LINES = {
    green: {
      head: ["ECO", "ENERGY"],
      subs: {
        g1: ["Bold bets", "on Ecology"],
        g2: ["Deeper", "analytics"],
        g3: ["Accolades"],
        g4: ["Solutions"],
      },
    },
    purple: {
      head: ["ECO EYE"],
      subs: {
        p1: ["Help", "Customers", "Become", "Green"],
        p2: ["Widen", "Circle of", "Influence"],
        p3: ["Transparent", "Reporting &", "Risk Planning"],
        p4: ["Make Wipro A", "Ecologically", "Surplus", "Organisation"],
        p5: ["Wipro", "Launches Eco", "Chapters"],
      },
    },
  };

  // Font sizes. Head: in the .subs 0..100 viewBox units. Subs: in each sub-slot's
  // own local units (the motif radius = 1), so they scale with the petal. Purple
  // subs are SMALLER than green -- their wording is longer -- so the text fits
  // and reads cleanly.
  const FS = { head: 10.5, subGreen: 0.235, subPurple: 0.235 };
  const LH = 1.14; // line-height factor

  // Bloom timing (ms), slightly different per colour so the two never march in
  // lock-step. inward = pull to centre; outward = open to normal; stagger = gap
  // between successive petals; cycle = the gentle breathing period.
  // `inward` (the sub-branches gathering to the head centre) is deliberately slow
  // -- a gentle draw-in reads far more premium than a quick snap. `openDone` is
  // derived from these (see follow()), so the label reveal auto-tracks the timing;
  // a slower inward just lands the whole entrance a touch later.
  const BLOOM = {
    green:  { inward: 2600, outward: 4800, stagger: 325, cycle: 4500 },
    purple: { inward: 2800, outward: 5300, stagger: 360, cycle: 5000 },
  };
  const REVEAL_GAP = 200; // pause after the last petal lands before the driver stops
  const REVEAL_LEAD = 0;   // reveal only after the final petal has landed, so a
                            // sub-label never appears mid-flight
  const TEXT_MS = 1300;   // CSS label reveal (fade + scale) duration -- see styles.css
  const IDLE_MS = 10000;  // after the bloom settles, revert to state 1 after this
                          // long with no interaction
  // The state-2 -> state-1 exit is a plain cross-fade (no fold/bloom-close): the
  // dandelions fade out, reset while hidden, then fade back in. This matches the
  // CSS `.branch { transition: opacity 0.8s }` so the fade-out is complete before
  // we hand the petals back.
  const FADE_MS = 800;
  const HEAD = { x: 50, y: 50 }; // head centre in the subs' 0..100 viewBox
  const SMIN = 0.12;             // petal scale when fully collapsed at the centre

  const easeInOut = (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  // Openness of one petal at time t (ms since bloom start): 1 = normal place,
  // 0 = collapsed at centre. All petals pull in together; each opens on its own
  // staggered clock; then holds fully open.
  function openness(cfg, i, t, startO) {
    // Collapse from wherever the petal currently is (startO). On the bloom this is
    // 1 (petals begin at their normal place); a drill-down may freeze it mid-way.
    if (t < cfg.inward) return startO * (1 - easeInOut(t / cfg.inward)); // pull inward
    const openStart = cfg.inward + i * cfg.stagger;
    if (t < openStart) return 0;                               // wait, collapsed (stagger)
    const openEnd = openStart + cfg.outward;
    if (t < openEnd) return easeInOut((t - openStart) / cfg.outward); // open outward
    return 1; // fully open -- hold at the normal place (bloom plays once, no replay)
  }

  let busy = false;
  let bloomed = false;
  let revealed = false;
  let petals = []; // { target, color, i, L, T, S }
  let texts = [];  // every created <text>, for reveal + cleanup
  let raf = 0;
  let bloomStart = 0;
  let openDone = 0;  // when the last petal has finished opening
  let readyDispatched = false; // fire 'labelsready' once the bloom settles
  let idleTimer = 0; // countdown to the auto-revert (armed once the bloom settles)
  let closing = false; // true while the closing motion plays (guards re-entry)
  let drillActive = false; // a sub-branch was pressed -> state 3; suspends the idle
                           // auto-revert (a committed state never times out on its own)

  const subParams = (slot, id) => {
    const cs = getComputedStyle(slot.closest(".subs"));
    return {
      L: parseFloat(cs.getPropertyValue(`--${id}-left`)),
      T: parseFloat(cs.getPropertyValue(`--${id}-top`)),
      S: parseFloat(cs.getPropertyValue(`--${id}-size`)),
    };
  };

  // Build one centred, multi-line SVG label as a child of `parent`, at (cx,cy) in
  // the parent's own coordinate system. text-anchor:middle + a per-line y keeps
  // every line horizontally centred and the whole block vertically centred.
  function makeText(parent, lines, fs, kind, cx, cy) {
    const text = document.createElementNS(NS, "text");
    text.setAttribute("class", "dlabel-svg dlabel-svg--" + kind);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("alignment-baseline", "middle");
    text.setAttribute("font-size", fs);
    const lh = fs * LH;
    const n = lines.length;
    lines.forEach((ln, k) => {
      const ts = document.createElementNS(NS, "tspan");
      ts.setAttribute("x", cx);
      ts.setAttribute("y", cy + (k - (n - 1) / 2) * lh);
      ts.setAttribute("dominant-baseline", "central");
      ts.textContent = ln;
      text.appendChild(ts);
    });
    parent.appendChild(text);
    texts.push(text);
    return text;
  }

  function buildLabels() {
    petals = [];
    texts = [];
    openDone = 0;
    for (const color of ["green", "purple"]) {
      // head label -> child of the .subs layer, at its centre (rides the head's
      // own bloom / lift / sway, which .subs shares)
      const subsSvg = document.querySelector(`.branch--${color} .subs`);
      if (subsSvg) makeText(subsSvg, LINES[color].head, FS.head, "main", HEAD.x, HEAD.y);

      // sub labels -> child of each sub-slot <g>, centred on its motif (0,0)
      const fs = color === "green" ? FS.subGreen : FS.subPurple;
      let i = 0;
      for (const id in LABELS[color].subs) {
        const slot = document.querySelector(`.sub-slot--${id}`);
        if (slot && !slot.classList.contains("sub-hidden")) {
          const p = subParams(slot, id);
          makeText(slot, LINES[color].subs[id], fs, "sub", 0, 0);
          petals.push({
            target: slot, color, i, L: p.L, T: p.T, S: p.S,
            startO: 1, lastO: 1,
            // The puff's <g>, and the last --petal-open written to it. The var
            // goes on the .sub rather than the slot so an INLINE value always
            // wins over the .sub-reveal rule a previous drill-down may have
            // left on the same element (see follow()).
            sub: slot.querySelector(".sub"),
            lastQ: -1,
          });
          const cfg = BLOOM[color];
          openDone = Math.max(openDone, cfg.inward + i * cfg.stagger + cfg.outward);
        }
        i++;
      }
    }
    if (!raf) raf = requestAnimationFrame(follow);
  }

  // Drive ONLY the petal bloom (sub-slots). Each label is a child of its circle,
  // so it moves + scales with it automatically -- nothing to re-pin.
  function follow(ts) {
    if (!petals.length) { raf = 0; return; }
    if (!bloomStart) bloomStart = ts;
    const t = ts - bloomStart;

    for (const p of petals) {
      const cfg = BLOOM[p.color];
      const o = openness(cfg, p.i, t, p.startO);
      p.lastO = o;
      const tx = HEAD.x + o * (p.L - HEAD.x);
      const ty = HEAD.y + o * (p.T - HEAD.y);
      const sc = p.S * (SMIN + (1 - SMIN) * o); // UNIFORM scale -> circle stays round
      p.target.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
      // Hand the same eased openness to the puff's rings (styles.css reads
      // --petal-open inside the motif, which is how it crosses into the <use>
      // shadow tree). The rings unfurl from the middle outward on exactly this
      // curve, so the dots inside a petal open WITH it instead of riding along
      // as a rigid disc. Quantised to 1% and written only on change: the value
      // is inherited by every dot in the motif, so a per-frame write would
      // re-style thousands of circles for a difference no one can see.
      const q = Math.round(o * 100) / 100;
      if (p.sub && q !== p.lastQ) {
        p.lastQ = q;
        p.sub.style.setProperty("--petal-open", q);
      }
      // Petal opacity rides the same eased openness: it softly fades OUT as the
      // petal gathers inward (o -> 0) and softly fades IN as it opens outward
      // (o -> 1). Once fully open it is held solid at 1. This only adds a fade --
      // position, scale, timing and path are unchanged, so circles stay round.
      const openEnd = cfg.inward + p.i * cfg.stagger + cfg.outward;
      p.target.style.opacity = t >= openEnd ? "1" : o.toFixed(3);
    }
    // Fade the labels in a little BEFORE every petal has fully landed -- by now
    // they are essentially open, so the text arrives promptly instead of feeling
    // late. The driver below keeps running so the petals still finish settling.
    if (!revealed && t > openDone - REVEAL_LEAD) {
      revealed = true;
      busy = false;
      texts.forEach((el) => el.classList.add("dlabel-shown"));
      // Sub-branch clicking is enabled now (drilldown.js listens for this).
      if (!readyDispatched) {
        readyDispatched = true;
        document.dispatchEvent(new CustomEvent("dandelion:labelsready"));
      }
      // 2nd state is live: mark the app so the puff rings spin slowly (CSS),
      // signalling the sub-branches are now clickable.
      const app = document.querySelector(".app");
      if (app) app.classList.add("subs-live");
    }
    // Once every petal has actually reached its final place, stop the driver so
    // it settles and holds -- no replay. The head's own idle breathing (CSS on
    // .subs) keeps the puff gently alive underneath.
    if (t > openDone + REVEAL_GAP) {
      armIdle(); // start the 10s no-interaction countdown back to state 1
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(follow);
  }

  function clearLabels() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    const app = document.querySelector(".app");
    if (app) app.classList.remove("subs-live"); // rings stop spinning outside state 2
    litPhase2(false); // the bloom-time bubbles belong to state 2 only
    for (const p of petals) {
      p.target.style.transform = ""; // hand petals back to CSS
      p.target.style.opacity = "";   // and drop the bloom fade
      if (p.sub) p.sub.style.removeProperty("--petal-open"); // rings fully open
      p.lastQ = -1;
    }
    for (const el of texts) el.remove();
    petals = [];
    texts = [];
    bloomStart = 0;
    bloomed = false;
    revealed = false;
    readyDispatched = false;
    busy = false;
  }

  // --- auto-revert to state 1 -----------------------------------------------
  // Once the bloom has fully settled, a 10s countdown runs; any user interaction
  // restarts it (see init). When it elapses -- or the user clicks empty space --
  // the scene returns to state 1. From the bloomed view this is a plain cross-fade
  // (the dandelions fade out and back in -- no fold/bloom-close); from a drilled-in
  // plant it recentres to its corner and its info card closes.
  function armIdle() {
    window.clearTimeout(idleTimer);
    // drillActive marks the drill-down GROW in progress -- a moving entrance, not
    // a settled view -- so the countdown stays off until the drilled plant has
    // fully arrived and its card is up (releaseBox clears it). It then runs in
    // both settled states: state 2 (bloomed) and state 3 (drilled + card). In
    // either, 10s of no interaction returns all the way to state 1 (revert()
    // recentres a drilled plant on the way).
    if (drillActive) return;
    if (bloomed && revealed) idleTimer = window.setTimeout(revert, IDLE_MS);
  }

  // Hand everything back to CSS and clear the state so Space can bloom afresh.
  function finishRevert(dying) {
    for (const p of petals) {
      p.target.style.transform = "";
      p.target.style.opacity = "";
      if (p.sub) p.sub.style.removeProperty("--petal-open");
      p.lastQ = -1;
    }
    dying.forEach((el) => el.remove());
    petals = [];
    texts = [];
    bloomStart = 0;
    bloomed = false;
    revealed = false;
    readyDispatched = false;
    busy = false;
    closing = false;
    drillActive = false; // back to state 1 -- a future bloom can idle-revert again
    raf = 0;
  }

  function revert() {
    if (!bloomed || closing) return;
    closing = true;
    revealed = false; // stop the idle timer re-arming while the close plays
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // Back to state 1: stop the "clickable" ring spin.
    const app = document.querySelector(".app");
    if (app) app.classList.remove("subs-live");
    litPhase2(false);

    // Drop the labels: they fade out with the dandelion as it cross-fades below.
    const dying = texts.slice();
    dying.forEach((el) => { el.style.transition = ""; el.classList.remove("dlabel-shown"); });

    // If a sub-branch was drilled into, the plant is standing centred and those
    // petals are driven by the drill, not the bloom -- don't fold them; just hand
    // the scene back to state 1.
    const drilled = !!document.querySelector(".branch.is-centered");
    if (drilled || !petals.length) {
      document.dispatchEvent(new CustomEvent("dandelion:reset"));
      window.setTimeout(() => finishRevert(dying), TEXT_MS + 80);
      return;
    }

    // NO fold/bloom-close, and the MAIN dandelions (head + stem) stay put -- only
    // the SUB-BRANCHES fade. The .subs layer holds every puff and every label, so
    // fading just that layer out drops the sub-branches while leaving the heads and
    // stems fully visible. Reset the petals while hidden (so the sub-branches never
    // travel back to the centre or re-bloom), then fade the .subs layer back in.
    // Bubbles and the main plants are left untouched.
    const subsLayers = document.querySelectorAll(".branch--green .subs, .branch--purple .subs");
    subsLayers.forEach((s) => s.classList.add("is-faded")); // fade the subs out (CSS 0.8s)
    window.setTimeout(() => {
      // hand the petals + labels back to CSS while hidden -- no visible jump
      finishRevert(dying);
      subsLayers.forEach((s) => s.classList.remove("is-faded")); // fade the subs back in
      // state-1 housekeeping (re-arm the drill-down for later). The main plants and
      // bubbles never faded, so this changes nothing visible on them.
      document.dispatchEvent(new CustomEvent("dandelion:reset"));
    }, FADE_MS + 40); // once the fade-out has finished
  }

  // One level back, driven by an empty-space click:
  //   state 3 (a sub drilled in) -> state 2 (the bloomed view)
  //   state 2 (bloomed)          -> state 1 (initial, via the fold-close)
  function stepBack() {
    if (!bloomed || closing) return;
    if (document.querySelector(".branch.is-centered")) backToBloom(); // 3 -> 2
    else revert();                                                    // 2 -> 1
  }

  // State 3 -> state 2. Un-centre the plant and restore the other dandelion, but
  // KEEP the bubbles hidden and the labels up -- this is one step back, not a full
  // reset. The bloom labels that the drill hid (the non-selected dandelion's) fade
  // back in, and the 10s idle countdown restarts now that we sit in state 2 again.
  function backToBloom() {
    drillActive = false;
    texts.forEach((el) => {
      el.style.transition = "";
      el.style.opacity = "";
      el.classList.add("dlabel-shown");
    });
    // Back in the bloomed view: state 2 keeps its bubbles, so bring the ambient
    // field (which the drill faded out) back in -- matching the Space bloom, which
    // now leaves the bubbles up throughout.
    document.querySelectorAll(BUBBLES).forEach((el) => el.classList.remove("is-faded"));
    document.dispatchEvent(new CustomEvent("dandelion:undrill"));
    armIdle();
  }

  function activate() {
    if (busy || bloomed) return; // no retrigger while running / already bloomed
    busy = true;
    bloomed = true;
    revealed = false;
    readyDispatched = false;
    drillActive = false; // fresh bloom from state 1 -- idle-revert applies again
    bloomStart = 0;
    // 1. the bubbles STAY exactly as they are -- only the dandelions bloom. (They
    //    used to fade out here while a sparser field faded in later; that
    //    disappear-then-reappear is gone -- the ambient field is left untouched.)
    // 2. build the labels (hidden); 3. the bloom runs in follow(), and the labels
    //    fade + scale in only once every petal has landed (see the reveal check).
    buildLabels();
  }

  // A sub-branch was clicked (drilldown.js fires this). Freeze the bloom, hand the
  // petals back to CSS so the growth can run, and IMMEDIATELY hide every label so
  // nothing shows during the growth. The labels stay attached (they ride the
  // growth, invisible).
  //
  // The clicked label is deliberately NOT pre-marked green here. Green means "this
  // is the one the card is about", so it may not appear before the card does --
  // the label comes back in plain white with the rest, and infobox.js marks it
  // green at the moment it spawns the card over that circle.
  function onSelectStart(ev) {
    // Entering state 3: commit to the drill-down and cancel the state-2 idle
    // countdown so it can never fire mid-grow and yank the scene back to state 1.
    drillActive = true;
    // State 3 is still: the puff ring animation belongs to state 2 only, and so
    // do the bloom-time bubbles -- dim them as the drill takes over.
    const app = document.querySelector(".app");
    if (app) app.classList.remove("subs-live");
    litPhase2(false);
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const p of petals) {
      p.target.style.transform = "";
      p.target.style.opacity = "";
      // Drop the bloom's ring openness too, so the drill-down's own reveal
      // (which sets --petal-open on the .sub) starts from a clean slate.
      if (p.sub) p.sub.style.removeProperty("--petal-open");
      p.lastQ = -1;
    }
    // instant hide (no fade) -- inline wins over the .dlabel-shown class
    texts.forEach((el) => {
      el.classList.remove("dlabel-shown");
      el.style.transition = "none";
      el.style.opacity = "0";
    });
    // Clear any previous selection so nothing carries green over from the last
    // drill; the new one is marked later, by the card.
    texts.forEach((el) => el.classList.remove("dlabel-selected"));
  }

  // The selected dandelion's growth has fully finished. Now -- and only now --
  // fade + scale its labels back into view -- ALL of them plain white, including
  // the clicked one. Once they have fully appeared, tell infobox.js it may attach
  // the card to the clicked sub; the card is what marks that label green, after it
  // has finished popping.
  // Hand one sub-branch's own wording to the info box, which renders it as an
  // overlay ABOVE the PNG (and hides this original so the text never doubles).
  function releaseBox(color, slot) {
    const lines = (LINES[color] && LINES[color].subs && LINES[color].subs[slot]) || null;
    document.dispatchEvent(
      new CustomEvent("dandelion:labelsshown", { detail: { color, slot, lines } })
    );
    // The drilled view is now fully presented (the card is popping) -- state 3 is
    // settled. Clear the grow flag and start the idle countdown, so 10s of no
    // interaction here returns to state 1.
    drillActive = false;
    armIdle();
  }

  function onGrown(ev) {
    const d = ev.detail || {};
    if (!d.color) return;
    const sel = document.querySelectorAll(`.branch--${d.color} .dlabel-svg`);
    sel.forEach((el) => { el.style.transition = ""; el.style.opacity = ""; }); // back to CSS
    void document.body.offsetWidth; // commit the hidden (opacity 0) state first
    sel.forEach((el) => el.classList.add("dlabel-shown")); // smooth fade + scale in
    window.setTimeout(() => releaseBox(d.color, d.slot), TEXT_MS + 60);
  }

  // A sub-branch was pressed while the plant is ALREADY standing in the centre
  // with its labels up (drilldown.js decides that; see .is-centered there).
  // Nothing needs to fade in or grow -- the labels are already on screen -- so the
  // card is released straight away, on the newly pressed slot. Same event and the
  // same single spawn path as the grow above; only the wait is gone.
  function onReselect(ev) {
    const d = ev.detail || {};
    if (!d.color) return;
    releaseBox(d.color, d.slot);
  }

  function onKey(ev) {
    if (ev.code !== "Space" && ev.key !== " ") return;
    const t = ev.target;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    ev.preventDefault(); // never let Space scroll the page
    if (document.body.classList.contains("is-editing")) return; // don't fight the editor
    activate();
  }

  function init() {
    document.addEventListener("keydown", onKey);
    // A sub-branch click freezes the bloom and hides every label (they stay
    // attached, invisible).
    document.addEventListener("dandelion:drillstart", onSelectStart);
    // Once the growth fully finishes, fade + scale the selected labels back in,
    // then release the info box.
    document.addEventListener("dandelion:grown", onGrown);
    // A press on another sub-branch once the plant is already centred: move the
    // card, leave the plant and its labels exactly where they are.
    document.addEventListener("dandelion:reselect", onReselect);

    // Any user interaction restarts the 10s idle countdown. armIdle only arms the
    // timer once the bloom has settled, so these fire harmlessly in state 1 and
    // during the bloom itself.
    ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((t) =>
      document.addEventListener(t, armIdle, { passive: true })
    );
    // A click on empty space -- anything that is not a sub-branch or the info card
    // -- steps ONE level back: state 3 -> state 2, or state 2 -> state 1.
    document.addEventListener("click", (ev) => {
      if (!bloomed) return; // nothing to step back from in state 1
      if (document.body.classList.contains("is-editing")) return; // leave the editor alone
      const t = ev.target;
      if (t && t.closest && (t.closest(".sub-slot") || t.closest(".infobox-fx"))) return;
      stepBack();
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
