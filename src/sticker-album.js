const NEAR_PX = 88;
const HIDE_DELAY_MS = 2000;
const SLOT_SIZE = 48;
const EDGE_REVEAL_PX = 36;
/** Cap density so the static overlay stays smooth (canvas batch draw). */
const FINALE_COUNT = 400;
const FINALE_BITMAP_SIZE = 128;
const FINALE_BURST_MS = 1400;

const finaleBitmapCache = new Map();
let finaleBitmapWarm = null;

/**
 * Left-side sticker collection tray.
 * Appears on grab, proximity-bounces matching empty slots, collects on drop.
 * After ≥1 collect, peek-reveals when the cursor enters the left safe edge.
 */
export function initStickerAlbum() {
  const album = ensureAlbum();
  const state = {
    open: false,
    celebrating: false,
    peek: false,
    activeSticker: null,
    hideTimer: 0,
    filled: new Set(),
    finaleDone: false,
  };

  seedKnownSources();
  syncSlots(album, state.filled);
  // Warm sticker bitmaps in the background for a snappier finale (esp. Safari).
  void warmFinaleBitmaps(uniqueStickerSources());

  document.addEventListener("sticker-grab-start", (event) => {
    const sticker = event.detail?.sticker;
    if (!(sticker instanceof HTMLElement)) return;

    clearHideTimer(state);
    state.celebrating = false;
    state.peek = false;
    album.classList.remove("is-flash");
    state.activeSticker = sticker;
    seedKnownSources();
    // Avoid wiping the panel DOM while it's visible — only append missing slots.
    syncSlots(album, state.filled);
    showAlbum(album, state);
  });

  document.addEventListener("sticker-drag", (event) => {
    if (!state.open || state.celebrating) return;
    const { sticker, rect, src } = event.detail ?? {};
    if (sticker !== state.activeSticker || !rect || !src) return;
    updateCallingSlots(album, src, rect, state.filled);
  });

  document.addEventListener("sticker-grab-end", (event) => {
    const { sticker, rect, src } = event.detail ?? {};
    if (sticker !== state.activeSticker) return;

    state.activeSticker = null;
    clearCalling(album);

    if (state.celebrating) return;

    const slot = findNearEmptySlot(album, src, rect, state.filled);
    if (slot && typeof sticker.collectInto === "function") {
      event.preventDefault();
      void completeCollection({ album, state, sticker, slot, src });
      return;
    }

    hideAlbum(album, state);
  });

  document.addEventListener("pointermove", (event) => {
    if (state.filled.size === 0 || state.finaleDone) return;
    if (state.activeSticker || state.celebrating) return;

    const inEdge = event.clientX <= EDGE_REVEAL_PX;
    const overAlbum = isPointOverAlbum(album, event.clientX, event.clientY);

    if (inEdge || overAlbum) {
      if (!state.open) {
        state.peek = true;
        seedKnownSources();
        syncSlots(album, state.filled);
        showAlbum(album, state);
      }
      return;
    }

    if (state.peek && state.open) {
      state.peek = false;
      hideAlbum(album, state);
    }
  });
}

async function completeCollection({ album, state, sticker, slot, src }) {
  state.celebrating = true;
  state.peek = false;
  state.filled.add(normalizeSrc(src));
  discoveredSources.add(normalizeSrc(src));
  slot.classList.add("is-calling");

  const target = insetRect(slot.getBoundingClientRect(), 0.06);

  try {
    await sticker.collectInto(target);
  } catch {
    /* still complete collection visually */
  }

  fillSlot(slot, src);
  sticker.remove();
  slot.classList.remove("is-calling");
  slot.classList.add("is-filled", "is-landed");
  triggerCollectFx(album, slot);

  const allCollected =
    discoveredSources.size > 0 && state.filled.size >= discoveredSources.size;
  const debugFinale =
    window.location.hash === "#debug" && state.filled.size >= 1;

  if ((allCollected || debugFinale) && !state.finaleDone) {
    state.finaleDone = true;
    const sources = [...discoveredSources];
    // Warm bitmaps + kick off cascade immediately on last drop (don't wait for album hide).
    void warmFinaleBitmaps(sources);
    playFinale(sources);
  }

  state.hideTimer = window.setTimeout(() => {
    album.classList.remove("is-flash");
    state.celebrating = false;
    if (state.activeSticker) return;
    hideAlbum(album, state);
  }, HIDE_DELAY_MS);
}

function triggerCollectFx(album, slot) {
  album.classList.remove("is-flash");
  void album.offsetWidth;
  album.classList.add("is-flash");

  const sparks = album.querySelector(".sticker-album__sparks");
  if (!sparks) return;
  sparks.replaceChildren();

  const slotRect = slot.getBoundingClientRect();
  const albumRect = album.getBoundingClientRect();
  const ox = slotRect.left + slotRect.width / 2 - albumRect.left;
  const oy = slotRect.top + slotRect.height / 2 - albumRect.top;

  for (let i = 0; i < 12; i += 1) {
    const spark = document.createElement("span");
    spark.className = "sticker-album__spark";
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.35;
    const dist = 28 + Math.random() * 36;
    spark.style.left = `${ox}px`;
    spark.style.top = `${oy}px`;
    spark.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    spark.style.animationDelay = `${i * 18}ms`;
    sparks.appendChild(spark);
  }

  window.setTimeout(() => {
    sparks.replaceChildren();
  }, 900);
}

function insetRect(rect, ratio) {
  const inset = Math.max(2, Math.min(rect.width, rect.height) * ratio);
  const size = Math.max(8, Math.min(rect.width, rect.height) - inset * 2);
  return {
    left: rect.left + (rect.width - size) / 2,
    top: rect.top + (rect.height - size) / 2,
    width: size,
    height: size,
  };
}

function ensureAlbum() {
  let album = document.querySelector(".sticker-album");
  if (album) return album;

  album = document.createElement("aside");
  album.className = "sticker-album";
  album.setAttribute("aria-hidden", "true");
  album.innerHTML = `
    <div class="sticker-album__shell">
      <div class="sticker-album__sparks" aria-hidden="true"></div>
      <div class="sticker-album__panel">
        <div class="sticker-album__slots"></div>
      </div>
    </div>
  `;
  document.body.appendChild(album);
  return album;
}

function isPointOverAlbum(album, x, y) {
  if (!album.classList.contains("is-open")) return false;
  const rect = album.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Sync slots without remounting existing ones (prevents panel flicker). */
function syncSlots(album, filled = new Set()) {
  const slotsRoot = album.querySelector(".sticker-album__slots");
  if (!slotsRoot) return;

  const sources = uniqueStickerSources();
  const existing = new Map(
    [...slotsRoot.querySelectorAll(".sticker-album__slot")].map((slot) => [
      slot.dataset.src,
      slot,
    ]),
  );

  sources.forEach((src) => {
    let slot = existing.get(src);
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "sticker-album__slot";
      slot.dataset.src = src;
      slot.style.setProperty("--slot-size", `${SLOT_SIZE}px`);
      slot.innerHTML = `
        <img class="sticker-album__ghost" src="${escapeAttr(src)}" alt="" draggable="false" />
        <img class="sticker-album__full" src="${escapeAttr(src)}" alt="" draggable="false" />
      `;
      slotsRoot.appendChild(slot);
    }

    if (filled.has(src)) {
      slot.classList.add("is-filled");
    }
  });
}

const discoveredSources = new Set();
/** Stable shuffled slot order, randomized once at load (new finds insert randomly). */
let slotOrder = [];
let slotOrderSeeded = false;

function seedKnownSources() {
  for (const sticker of findAllStickers(document)) {
    const src = normalizeSrc(sticker.getAttribute("src") || "");
    if (src) discoveredSources.add(src);
  }

  document.querySelectorAll("section-title").forEach((el) => {
    for (const name of ["icon-1", "icon-2", "icon-3"]) {
      const src = normalizeSrc(el.getAttribute(name) || "");
      if (src) discoveredSources.add(src);
    }
  });

  document.querySelectorAll("garden-card").forEach((el) => {
    const src = normalizeSrc(el.getAttribute("icon") || "");
    if (src) discoveredSources.add(src);
  });
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function uniqueStickerSources() {
  seedKnownSources();

  if (!slotOrderSeeded) {
    slotOrder = shuffleInPlace([...discoveredSources]);
    slotOrderSeeded = true;
    return slotOrder.slice();
  }

  const known = new Set(slotOrder);
  for (const src of discoveredSources) {
    if (known.has(src)) continue;
    const idx = Math.floor(Math.random() * (slotOrder.length + 1));
    slotOrder.splice(idx, 0, src);
    known.add(src);
  }

  return slotOrder.filter((src) => discoveredSources.has(src));
}

function createSourcePicker(sources) {
  const bag = shuffleInPlace(sources.slice());
  let index = 0;
  let last = "";

  return () => {
    if (!bag.length) return "";
    if (index >= bag.length) {
      shuffleInPlace(bag);
      index = 0;
      if (bag.length > 1 && bag[0] === last) {
        const swap = 1 + Math.floor(Math.random() * (bag.length - 1));
        const tmp = bag[0];
        bag[0] = bag[swap];
        bag[swap] = tmp;
      }
    }
    last = bag[index];
    index += 1;
    return last;
  };
}

function findAllStickers(root) {
  const list = [...root.querySelectorAll("sticker-icon")];
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) list.push(...findAllStickers(el.shadowRoot));
  }
  return list;
}

function showAlbum(album, state) {
  state.open = true;
  album.classList.add("is-open");
  album.setAttribute("aria-hidden", "false");
}

function hideAlbum(album, state) {
  if (state.activeSticker) return;
  clearHideTimer(state);
  state.open = false;
  state.celebrating = false;
  state.peek = false;
  album.classList.remove("is-open", "is-flash");
  album.setAttribute("aria-hidden", "true");
  clearCalling(album);
}

function clearHideTimer(state) {
  if (state.hideTimer) {
    window.clearTimeout(state.hideTimer);
    state.hideTimer = 0;
  }
}

function clearCalling(album) {
  album
    .querySelectorAll(".sticker-album__slot.is-calling")
    .forEach((slot) => slot.classList.remove("is-calling"));
}

function updateCallingSlots(album, src, rect, filled) {
  const key = normalizeSrc(src);
  clearCalling(album);
  if (filled.has(key)) return;

  const slot = findNearEmptySlot(album, src, rect, filled);
  if (slot) slot.classList.add("is-calling");
}

function findNearEmptySlot(album, src, rect, filled) {
  if (!rect) return null;
  const key = normalizeSrc(src);
  if (filled.has(key)) return null;

  const stickerCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };

  let best = null;
  let bestDist = NEAR_PX;

  for (const slot of album.querySelectorAll(".sticker-album__slot")) {
    if (normalizeSrc(slot.dataset.src || "") !== key) continue;
    if (slot.classList.contains("is-filled")) continue;

    const slotRect = slot.getBoundingClientRect();
    const dist = Math.hypot(
      stickerCenter.x - (slotRect.left + slotRect.width / 2),
      stickerCenter.y - (slotRect.top + slotRect.height / 2),
    );
    if (dist <= bestDist) {
      bestDist = dist;
      best = slot;
    }
  }

  return best;
}

function fillSlot(slot, src) {
  slot.classList.add("is-filled");
  slot.dataset.src = normalizeSrc(src);
  const full = slot.querySelector(".sticker-album__full");
  const ghost = slot.querySelector(".sticker-album__ghost");
  if (full) full.src = src;
  if (ghost) ghost.src = src;
}

function playFinale(sources) {
  if (!sources.length) return;
  if (document.querySelector(".sticker-finale")) return;

  const finale = document.createElement("div");
  finale.className = "sticker-finale";
  finale.innerHTML = `
    <canvas class="sticker-finale__rain" aria-hidden="true"></canvas>
    <div class="sticker-finale__message">
      <article class="sticker-finale__card" aria-label="Title unlocked">
        <img
          class="sticker-finale__trophy"
          src="/assets/Icon/trophy-sticker.png"
          alt=""
          width="200"
          height="200"
          decoding="async"
          fetchpriority="high"
          draggable="false"
        />
        <div class="sticker-finale__copy">
          <div class="sticker-finale__titles">
            <p class="sticker-finale__eyebrow rgn-text-action">Title unlocked</p>
            <p class="sticker-finale__title rgn-text-large-title">Magnificent gardener</p>
          </div>
          <p class="sticker-finale__body rgn-text-body">
            The garden is proud of you!
          </p>
        </div>
        <button type="button" class="sticker-finale__share rgn-text-action">
          Share
        </button>
        <button type="button" class="sticker-finale__back rgn-text-body">
          Go back to my garden
        </button>
      </article>
    </div>
  `;
  document.body.appendChild(finale);
  lockPageForFinale();

  const canvas = finale.querySelector(".sticker-finale__rain");
  const shareBtn = finale.querySelector(".sticker-finale__share");
  const closeBtn = finale.querySelector(".sticker-finale__back");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Safari pays heavily for huge canvases; keep pixel buffer modest.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.floor(vw * dpr));
  canvas.height = Math.max(1, Math.floor(vh * dpr));
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;

  // Force canvas buffer allocation now (warmup) before first paint.
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);

  // Reveal as soon as the frame after canvas warmup.
  requestAnimationFrame(() => finale.classList.add("is-on", "is-painted"));

  const pickSrc = createSourcePicker(sources);
  const pieces = [];
  for (let i = 0; i < FINALE_COUNT; i += 1) {
    const size = (36 + Math.random() * 88) * 1.5;
    const bleed = size * 0.35;
    pieces.push({
      src: pickSrc(),
      size,
      x: -bleed + Math.random() * (vw + bleed * 2),
      y: -bleed + Math.random() * (vh + bleed * 2),
      rot: ((-50 + Math.random() * 100) * Math.PI) / 180,
      // Stagger appear times so stickers pop in one-by-one across the burst.
      at: Math.random() * FINALE_BURST_MS,
    });
  }
  pieces.sort((a, b) => a.at - b.at);

  void (async () => {
    const unique = [...new Set(sources)];
    const bitmaps = unique.every((src) => finaleBitmapCache.has(src))
      ? finaleBitmapCache
      : await warmFinaleBitmaps(sources);

    let drawn = 0;
    const startedAt = performance.now();

    const drawBatch = (now) => {
      const elapsed = now - startedAt;
      while (drawn < pieces.length && pieces[drawn].at <= elapsed) {
        const piece = pieces[drawn];
        drawn += 1;
        const bmp = bitmaps.get(piece.src);
        if (!bmp) continue;
        const half = piece.size / 2;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rot);
        ctx.drawImage(bmp, -half, -half, piece.size, piece.size);
        ctx.restore();
      }

      if (drawn < pieces.length) {
        requestAnimationFrame(drawBatch);
        return;
      }

      window.setTimeout(() => {
        finale.classList.add("is-message");
      }, 300);
    };

    requestAnimationFrame(drawBatch);
  })();

  shareBtn?.addEventListener("click", () => {
    void shareFinale();
  });

  closeBtn?.addEventListener("click", () => {
    closeFinale(finale);
  });
}

function warmFinaleBitmaps(sources) {
  const unique = [...new Set(sources)];
  const missing = unique.filter((src) => !finaleBitmapCache.has(src));
  if (!missing.length) {
    return Promise.resolve(finaleBitmapCache);
  }

  if (!finaleBitmapWarm) {
    finaleBitmapWarm = Promise.all(missing.map((src) => loadFinaleBitmap(src))).then(() => {
      finaleBitmapWarm = null;
      return finaleBitmapCache;
    });
  }

  return finaleBitmapWarm.then(() => {
    const stillMissing = unique.filter((src) => !finaleBitmapCache.has(src));
    if (!stillMissing.length) return finaleBitmapCache;
    return Promise.all(stillMissing.map((src) => loadFinaleBitmap(src))).then(
      () => finaleBitmapCache,
    );
  });
}

function loadFinaleBitmap(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const finish = (bitmap) => {
        finaleBitmapCache.set(src, bitmap);
        resolve(bitmap);
      };

      if (typeof createImageBitmap === "function") {
        createImageBitmap(img, {
          resizeWidth: FINALE_BITMAP_SIZE,
          resizeHeight: FINALE_BITMAP_SIZE,
          resizeQuality: "high",
        })
          .then(finish)
          .catch(() => finish(img));
        return;
      }

      finish(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function shareFinale() {
  const payload = {
    title: "Romain's Garden",
    text: "I discovered all the stickers in Romain's Garden!",
    url: window.location.href.replace(/#.*$/, ""),
  };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return;
    } catch {
      /* dismissed or unavailable — fall through */
    }
  }

  try {
    await navigator.clipboard.writeText(payload.url);
  } catch {
    /* ignore */
  }
}

function closeFinale(finale) {
  if (!(finale instanceof HTMLElement)) return;
  finale.classList.remove("is-message", "is-painted");
  finale.classList.add("is-leaving");
  const remove = () => {
    finale.remove();
    unlockPageFromFinale();
  };
  finale.addEventListener("transitionend", remove, { once: true });
  window.setTimeout(remove, 400);
}

function lockPageForFinale() {
  if (document.documentElement.classList.contains("is-finale-open")) return;
  const scrollY = window.scrollY;
  document.documentElement.dataset.finaleScrollY = String(scrollY);
  document.documentElement.classList.add("is-finale-open");
  document.body.style.top = `-${scrollY}px`;
}

function unlockPageFromFinale() {
  if (!document.documentElement.classList.contains("is-finale-open")) return;
  const scrollY = Number(document.documentElement.dataset.finaleScrollY || 0);
  document.documentElement.classList.remove("is-finale-open");
  document.body.style.top = "";
  delete document.documentElement.dataset.finaleScrollY;
  window.scrollTo(0, scrollY);
}

function normalizeSrc(src) {
  if (!src) return "";
  try {
    return new URL(src, window.location.href).pathname;
  } catch {
    return src;
  }
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
