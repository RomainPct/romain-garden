const NEAR_PX = 88;
const HIDE_DELAY_MS = 2000;
const SLOT_SIZE = 48;
const EDGE_REVEAL_PX = 36;
const FINALE_COUNT = 1100;
const FINALE_STAGGER_MS = 5;

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

  state.hideTimer = window.setTimeout(() => {
    album.classList.remove("is-flash");
    state.celebrating = false;
    if (state.activeSticker) return;

    if (allCollected && !state.finaleDone) {
      state.finaleDone = true;
      hideAlbum(album, state);
      playFinale([...discoveredSources]);
      return;
    }

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

function uniqueStickerSources() {
  seedKnownSources();
  return [...discoveredSources];
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

  const finale = document.createElement("div");
  finale.className = "sticker-finale";
  finale.innerHTML = `
    <div class="sticker-finale__rain" aria-hidden="true"></div>
    <div class="sticker-finale__message">
      <p class="sticker-finale__yeah rgn-text-huge-title-visual">Yeaaaaaaah!</p>
      <button type="button" class="sticker-finale__cta rgn-text-action">
        Contact Romain to tell him something
      </button>
    </div>
  `;
  document.body.appendChild(finale);

  const rain = finale.querySelector(".sticker-finale__rain");
  const cta = finale.querySelector(".sticker-finale__cta");

  requestAnimationFrame(() => finale.classList.add("is-on"));

  for (let i = 0; i < FINALE_COUNT; i += 1) {
    const img = document.createElement("img");
    img.className = "sticker-finale__piece";
    img.src = sources[i % sources.length];
    img.alt = "";
    img.draggable = false;
    const size = 48 + Math.random() * 120;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const rot = -48 + Math.random() * 96;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.left = `${x}%`;
    img.style.top = `${y}%`;
    img.style.setProperty("--rot", `${rot}deg`);
    img.style.animationDelay = `${i * FINALE_STAGGER_MS}ms`;
    rain.appendChild(img);
  }

  const coverMs = FINALE_COUNT * FINALE_STAGGER_MS + 700;

  window.setTimeout(() => {
    finale.classList.add("is-message");
  }, coverMs + 200);

  cta?.addEventListener("click", () => {
    document.querySelector("romain-garden-nav")?.openContact();
  });
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
