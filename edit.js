/* Sub-branch editor.
 *
 * Off by default: without edit mode this only reads localStorage and applies
 * saved offsets, so the normal experience is untouched.
 *
 *   enable   append ?edit to the URL, or press "e"
 *   click    select a sub (a dashed ring marks the active one)
 *   drag     move it anywhere around its circle
 *   wheel    resize the sub under the cursor
 *   arrows   nudge the selected sub (hold shift for larger steps)
 *   esc      leave edit mode
 *
 * Positions are stored in head-diameter units -- the same units the CSS
 * variables use, where the head spans 0..100 with its centre at (50,50). They
 * are therefore resolution independent: saved values stay correct at any
 * screen size, inside the 9:20 box.
 *
 * Note on hit testing: .app__content is a transparent full-bleed layer above
 * the branches, so it would otherwise swallow every click meant for a sub.
 * styles.css drops its pointer-events while .is-editing is set.
 */
(() => {
  "use strict";

  // Bumped to v2 once the dragged layout was baked into styles.css. The old v1
  // overrides would otherwise win over the stylesheet and mask it.
  const STORE_KEY = "dandelions.subs.v2";
  const FIELDS = ["left", "top", "size"];
  const STEP = 0.25; // arrow-key nudge, in head-diameter units
  const BIG_STEP = 2; // with shift
  const MIN_SIZE = 3;
  const MAX_SIZE = 40;
  const LOG = "[subs]";

  /** @returns {{el: SVGGElement, id: string, layer: SVGSVGElement}[]} */
  const subs = () =>
    [...document.querySelectorAll(".sub-slot")].map((el) => ({
      el,
      id: [...el.classList].find((c) => c.startsWith("sub-slot--")).slice(10),
      layer: el.closest(".subs"),
    }));

  const subFor = (el) => subs().find((s) => s.el === el);

  // ---------------------------------------------------------------- storage
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (err) {
      console.warn(LOG, "could not read saved positions:", err);
      return {};
    }
  };

  let saved = load();

  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.warn(LOG, "could not save:", err);
    }
  };

  /** Current value: saved override, else whatever the stylesheet says. */
  const get = (sub, field) => {
    const stored = saved[sub.id]?.[field];
    if (typeof stored === "number") return stored;
    return parseFloat(
      getComputedStyle(sub.layer).getPropertyValue(`--${sub.id}-${field}`)
    );
  };

  const set = (sub, field, value) => {
    saved[sub.id] = saved[sub.id] || {};
    saved[sub.id][field] = Math.round(value * 100) / 100;
    sub.layer.style.setProperty(`--${sub.id}-${field}`, saved[sub.id][field]);
  };

  const applySaved = () => {
    let n = 0;
    for (const sub of subs()) {
      const rec = saved[sub.id];
      if (!rec) continue;
      for (const f of FIELDS) {
        if (typeof rec[f] === "number") {
          sub.layer.style.setProperty(`--${sub.id}-${f}`, rec[f]);
          n++;
        }
      }
    }
    return n;
  };

  // ------------------------------------------------------------- edit mode
  let editing = false;
  let bar = null;
  let selected = null;
  let drag = null;

  /** Pointer position -> head-diameter units, via the layer's own box. */
  const toUnits = (layer, ev) => {
    const r = layer.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * 100,
      y: ((ev.clientY - r.top) / r.height) * 100,
    };
  };

  const report = () => {
    if (!bar) return;
    bar.querySelector("output").textContent = selected
      ? `${selected.id}  left ${get(selected, "left").toFixed(2)}  ` +
        `top ${get(selected, "top").toFixed(2)}  size ${get(selected, "size").toFixed(2)}`
      : `${subs().length} subs — click one, then drag / arrows / wheel`;
  };

  const select = (sub, { focus = true } = {}) => {
    if (selected?.el === sub?.el) return;
    for (const s of subs()) s.el.classList.remove("sub-slot--selected");
    selected = sub;
    if (sub) {
      sub.el.classList.add("sub-slot--selected");
      if (focus) sub.el.focus?.({ preventScroll: true });
      console.log(
        `${LOG} selected ${sub.id}`,
        FIELDS.reduce((o, f) => ((o[f] = get(sub, f)), o), {})
      );
    }
    report();
  };

  const cssText = () => {
    const out = [];
    for (const [group, ids] of [
      ["green", ["g1", "g2", "g3", "g4"]],
      ["purple", ["p1", "p2", "p3", "p4", "p5"]],
    ]) {
      out.push(`.branch--${group} .subs {`);
      for (const id of ids) {
        const sub = subs().find((s) => s.id === id);
        if (!sub) continue;
        const v = FIELDS.map((f) => get(sub, f).toFixed(2));
        out.push(`  --${id}-left: ${v[0]};  --${id}-top: ${v[1]};  --${id}-size: ${v[2]};`);
      }
      out.push("}");
    }
    return out.join("\n");
  };

  const buildBar = () => {
    bar = document.createElement("div");
    bar.className = "edit-bar";
    bar.innerHTML =
      '<output></output><button data-act="copy">Copy CSS</button>' +
      '<button data-act="reset">Reset</button><button data-act="done">Done</button>';
    bar.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    bar.addEventListener("click", async (ev) => {
      const act = ev.target.dataset.act;
      if (!act) return;
      if (act === "copy") {
        const text = cssText();
        try {
          await navigator.clipboard.writeText(text);
          ev.target.textContent = "Copied";
        } catch {
          console.log(text); // clipboard blocked -> fall back to the console
          ev.target.textContent = "In console";
        }
        setTimeout(() => (ev.target.textContent = "Copy CSS"), 1200);
      } else if (act === "reset") {
        for (const sub of subs()) {
          for (const f of FIELDS) sub.layer.style.removeProperty(`--${sub.id}-${f}`);
        }
        saved = {};
        save();
        select(null);
        console.log(`${LOG} reset to the stylesheet defaults`);
      } else if (act === "done") {
        setEditing(false);
      }
    });
    document.body.appendChild(bar);
  };

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("is-editing", on);
    if (on && !bar) buildBar();
    if (!on) {
      if (bar) {
        bar.remove();
        bar = null;
      }
      select(null);
    }
    console.log(`${LOG} edit mode ${on ? "ON" : "OFF"}`);
    if (on) {
      report();
      console.log(`${LOG} ${subs().length} slots:`, subs().map((s) => s.id).join(", "));
    }
  }

  // ---------------------------------------------------------------- pointer
  document.addEventListener("pointerdown", (ev) => {
    if (!editing) return;
    const slot = ev.target.closest?.(".sub-slot");
    if (!slot) {
      if (!ev.target.closest?.(".edit-bar")) select(null);
      return;
    }
    const sub = subFor(slot);
    select(sub);
    const p = toUnits(sub.layer, ev);
    drag = { sub, dx: get(sub, "left") - p.x, dy: get(sub, "top") - p.y, moved: false };
    slot.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
    console.log(`${LOG} pointerdown on ${sub.id} at`, {
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
    });
  });

  document.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const p = toUnits(drag.sub.layer, ev);
    set(drag.sub, "left", p.x + drag.dx);
    set(drag.sub, "top", p.y + drag.dy);
    if (!drag.moved) {
      drag.moved = true;
      console.log(`${LOG} dragging ${drag.sub.id}`);
    }
    report();
  });

  const endDrag = () => {
    if (!drag) return;
    save();
    console.log(`${LOG} drop ${drag.sub.id} ->`, {
      left: get(drag.sub, "left"),
      top: get(drag.sub, "top"),
    });
    drag = null;
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  // ------------------------------------------------------------------ wheel
  document.addEventListener(
    "wheel",
    (ev) => {
      if (!editing) return;
      const slot = ev.target.closest?.(".sub-slot");
      if (!slot) return;
      ev.preventDefault();
      const sub = subFor(slot);
      select(sub);
      const next = get(sub, "size") * (ev.deltaY < 0 ? 1.06 : 1 / 1.06);
      set(sub, "size", Math.min(MAX_SIZE, Math.max(MIN_SIZE, next)));
      save();
      report();
      console.log(`${LOG} wheel ${sub.id} size ->`, get(sub, "size"));
    },
    { passive: false } // required, otherwise preventDefault() is ignored
  );

  // --------------------------------------------------------------- keyboard
  const NUDGE = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  document.addEventListener("keydown", (ev) => {
    if (ev.target.matches?.("input, textarea")) return;

    if (ev.key === "e" || ev.key === "E") {
      setEditing(!editing);
      return;
    }
    if (!editing) return;
    if (ev.key === "Escape") {
      setEditing(false);
      return;
    }
    if (ev.key === "Tab") return; // let focus move between slots naturally

    const nudge = NUDGE[ev.key];
    if (!nudge) return;
    if (!selected) {
      console.log(`${LOG} ${ev.key} ignored — nothing selected, click a sub first`);
      return;
    }
    ev.preventDefault(); // stop the arrow keys scrolling the page
    const step = ev.shiftKey ? BIG_STEP : STEP;
    set(selected, "left", get(selected, "left") + nudge[0] * step);
    set(selected, "top", get(selected, "top") + nudge[1] * step);
    save();
    report();
    console.log(`${LOG} ${ev.shiftKey ? "shift+" : ""}${ev.key} ${selected.id} ->`, {
      left: get(selected, "left"),
      top: get(selected, "top"),
    });
  });

  // keep the ring in sync when slots are reached by Tab
  document.addEventListener("focusin", (ev) => {
    if (!editing) return;
    const slot = ev.target.closest?.(".sub-slot");
    if (slot) select(subFor(slot), { focus: false });
  });

  // ------------------------------------------------------------------- init
  const init = () => {
    const found = subs();
    const applied = applySaved(); // runs in every mode, so edits persist
    console.log(
      `${LOG} ready — ${found.length} sub-branches, ${applied} saved value(s) applied. ` +
        `Press "e" or add ?edit to the URL to edit.`
    );
    if (found.length !== 9) {
      console.warn(`${LOG} expected 9 sub-branches, found ${found.length}`);
    }
    if (new URLSearchParams(location.search).has("edit")) setEditing(true);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
