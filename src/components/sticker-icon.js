const TAG = "sticker-icon";

const DRAG_THRESHOLD = 3;
const SPRING = 150;
const DAMPING = 16;
const SETTLE_FRICTION = 6.5;
const MAX_TILT_DEG = 16;
const TILT_FROM_VELOCITY = 0.045;
const STACK_Z_BASE = 100;

/** Monotonic z-index so the last moved sticker always sits on top. */
let stickerStackZ = STACK_Z_BASE;

const styles = /* css */ `
  :host {
    display: inline-flex;
    flex-shrink: 0;
    line-height: 0;
    width: var(--sticker-size, 80px);
    height: var(--sticker-size, 80px);
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    position: relative;
    z-index: 1;
  }

  :host(:active),
  :host([data-dragging]) {
    cursor: grabbing;
  }

  .frame {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .frame ::slotted(img),
  .frame > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
  }

  :host([data-collecting]) .frame > img {
    object-fit: contain;
  }
`;

function docPointFromClient(clientX, clientY) {
  return {
    x: clientX + window.scrollX,
    y: clientY + window.scrollY,
  };
}

export class StickerIcon extends HTMLElement {
  static get observedAttributes() {
    return ["src", "alt", "size"];
  }

  #root;
  #bound = false;
  #dragging = false;
  #moved = false;
  #leftHome = false;
  #pointerId = null;
  #offsetX = 0;
  #offsetY = 0;
  #currentX = 0;
  #currentY = 0;
  #targetX = 0;
  #targetY = 0;
  #vx = 0;
  #vy = 0;
  #raf = 0;
  #lastTs = 0;
  #baseRotateDeg = 0;
  #fingerprint = null;
  #onClickCapture = null;
  #suppressDisconnect = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (!this.#root.querySelector(".frame")) this.render();

    if (!this.#bound) {
      this.#bound = true;
      this.addEventListener("pointerdown", this.#onPointerDown);
      this.#onClickCapture = (event) => {
        if (this.#moved || this.#dragging) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
      this.addEventListener("click", this.#onClickCapture, true);
    }
  }

  disconnectedCallback() {
    if (this.#suppressDisconnect) return;
    this.#teardownDragListeners();
    this.#stopLoop();
  }

  attributeChangedCallback() {
    if (this.isConnected && !this.#dragging && !this.#leftHome) this.render();
  }

  get src() {
    return this.getAttribute("src") ?? "";
  }

  set src(value) {
    if (value) this.setAttribute("src", value);
    else this.removeAttribute("src");
  }

  get alt() {
    return this.getAttribute("alt") ?? "";
  }

  set alt(value) {
    this.setAttribute("alt", value ?? "");
  }

  get size() {
    return this.getAttribute("size") ?? "";
  }

  set size(value) {
    if (value) this.setAttribute("size", String(value));
    else this.removeAttribute("size");
  }

  render() {
    const size = this.size;
    if (size) this.style.setProperty("--sticker-size", `${size}px`);
    else this.style.removeProperty("--sticker-size");

    const src = this.src;
    const img = src
      ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(this.alt)}" width="100%" height="100%" draggable="false" />`
      : `<slot></slot>`;

    this.#root.innerHTML = `
      <style>${styles}</style>
      <span class="frame" part="frame">${img}</span>
    `;
  }

  #emit(name, extra = {}) {
    return this.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
        cancelable: name === "sticker-grab-end",
        detail: {
          sticker: this,
          src: this.src,
          rect: this.getBoundingClientRect(),
          ...extra,
        },
      }),
    );
  }

  /**
   * Animate this sticker into a target client rect (collection slot), then settle.
   * @param {DOMRect | { left: number, top: number, width: number, height: number }} rect
   */
  collectInto(rect) {
    return new Promise((resolve) => {
      this.#teardownDragListeners();
      this.#stopLoop();
      this.#dragging = false;
      delete this.dataset.dragging;
      this.dataset.collecting = "";

      const from = this.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const start = {
        x: from.left + scrollX,
        y: from.top + scrollY,
        w: from.width,
        h: from.height,
      };
      const end = {
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        w: rect.width,
        h: rect.height,
      };

      this.#prepareAbsolute(start.w, start.h);
      this.#bringToFront();
      this.style.setProperty("--sticker-size", `${start.w}px`);
      this.style.transition =
        "left 480ms cubic-bezier(0.22, 1, 0.36, 1), top 480ms cubic-bezier(0.22, 1, 0.36, 1), width 480ms cubic-bezier(0.22, 1, 0.36, 1), height 480ms cubic-bezier(0.22, 1, 0.36, 1), transform 480ms cubic-bezier(0.22, 1, 0.36, 1)";
      this.style.left = `${start.x}px`;
      this.style.top = `${start.y}px`;
      this.style.width = `${start.w}px`;
      this.style.height = `${start.h}px`;
      this.style.transform = this.#baseRotateDeg
        ? `rotate(${this.#baseRotateDeg}deg)`
        : "none";

      requestAnimationFrame(() => {
        this.style.setProperty("--sticker-size", `${end.w}px`);
        this.style.left = `${end.x}px`;
        this.style.top = `${end.y}px`;
        this.style.width = `${end.w}px`;
        this.style.height = `${end.h}px`;
        this.style.transform = "rotate(0deg) scale(1)";
      });

      const done = () => {
        this.removeEventListener("transitionend", onEnd);
        this.style.transition = "";
        resolve();
      };
      const onEnd = (event) => {
        if (event.propertyName === "left" || event.propertyName === "width") {
          done();
        }
      };
      this.addEventListener("transitionend", onEnd);
      window.setTimeout(done, 560);
    });
  }

  #onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    if (this.#dragging) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = this.getBoundingClientRect();
    const width = this.offsetWidth || rect.width;
    const height = this.offsetHeight || rect.height;
    const startClientX = rect.left + (rect.width - width) / 2;
    const startClientY = rect.top + (rect.height - height) / 2;
    const start = docPointFromClient(startClientX, startClientY);
    const pointer = docPointFromClient(event.clientX, event.clientY);

    this.#pointerId = event.pointerId;
    this.#offsetX = pointer.x - start.x;
    this.#offsetY = pointer.y - start.y;
    this.#currentX = start.x;
    this.#currentY = start.y;
    this.#targetX = start.x;
    this.#targetY = start.y;
    this.#vx = 0;
    this.#vy = 0;
    this.#moved = false;
    this.#baseRotateDeg = this.#readRotateDeg();
    this.#bringToFront();

    if (!this.#leftHome) {
      this.#leaveHomeFingerprint(width, height);
      this.#relocateToBody(start.x, start.y, width, height);
      this.#leftHome = true;
    } else {
      this.#prepareAbsolute(width, height);
      this.#applyPose(this.#currentX, this.#currentY, 0);
    }

    this.#dragging = true;
    this.dataset.dragging = "";
    this.dataset.placed = "";

    try {
      this.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    window.addEventListener("pointermove", this.#onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.#onPointerUp);
    window.addEventListener("pointercancel", this.#onPointerUp);

    this.#lastTs = performance.now();
    this.#startLoop();
    this.#emit("sticker-grab-start");
  };

  #onPointerMove = (event) => {
    if (!this.#dragging) return;
    if (this.#pointerId != null && event.pointerId !== this.#pointerId) return;

    event.preventDefault();

    const pointer = docPointFromClient(event.clientX, event.clientY);
    this.#targetX = pointer.x - this.#offsetX;
    this.#targetY = pointer.y - this.#offsetY;

    if (
      !this.#moved &&
      (Math.hypot(this.#targetX - this.#currentX, this.#targetY - this.#currentY) >
        DRAG_THRESHOLD)
    ) {
      this.#moved = true;
    }
  };

  #onPointerUp = (event) => {
    if (!this.#dragging) return;
    if (this.#pointerId != null && event.pointerId !== this.#pointerId) return;

    const pointer = docPointFromClient(event.clientX, event.clientY);
    this.#targetX = pointer.x - this.#offsetX;
    this.#targetY = pointer.y - this.#offsetY;

    this.#dragging = false;
    delete this.dataset.dragging;
    this.dataset.placed = "";
    this.#pointerId = null;
    this.#teardownDragListeners();

    const collected = !this.#emit("sticker-grab-end");

    try {
      this.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (collected) return;

    // Keep the physics loop running so release has inertia, then settle.
    this.#lastTs = performance.now();
    if (!this.#raf) this.#startLoop();
  };

  #teardownDragListeners() {
    window.removeEventListener("pointermove", this.#onPointerMove);
    window.removeEventListener("pointerup", this.#onPointerUp);
    window.removeEventListener("pointercancel", this.#onPointerUp);
  }

  #startLoop() {
    this.#stopLoop();
    const tick = (ts) => {
      const dt = Math.min(0.032, Math.max(0.001, (ts - this.#lastTs) / 1000));
      this.#lastTs = ts;

      if (this.#dragging) {
        this.#stepSpring(dt);
      } else {
        this.#stepInertia(dt);
      }

      const speed = Math.hypot(this.#vx, this.#vy);
      const tilt = clamp(this.#vx * TILT_FROM_VELOCITY, -MAX_TILT_DEG, MAX_TILT_DEG);
      this.#applyPose(this.#currentX, this.#currentY, tilt);

      const settled =
        !this.#dragging &&
        speed < 4 &&
        Math.hypot(this.#targetX - this.#currentX, this.#targetY - this.#currentY) < 0.4;

      if (settled) {
        this.#vx = 0;
        this.#vy = 0;
        this.#currentX = this.#targetX;
        this.#currentY = this.#targetY;
        this.#applyPose(this.#currentX, this.#currentY, 0);
        this.#raf = 0;
        return;
      }

      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
  }

  #stopLoop() {
    if (this.#raf) {
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
    }
  }

  #stepSpring(dt) {
    const ax = (this.#targetX - this.#currentX) * SPRING - this.#vx * DAMPING;
    const ay = (this.#targetY - this.#currentY) * SPRING - this.#vy * DAMPING;
    this.#vx += ax * dt;
    this.#vy += ay * dt;
    this.#currentX += this.#vx * dt;
    this.#currentY += this.#vy * dt;
  }

  #stepInertia(dt) {
    // Soft pull toward release target, then friction — feels like letting go of paper.
    const ax = (this.#targetX - this.#currentX) * (SPRING * 0.35) - this.#vx * DAMPING;
    const ay = (this.#targetY - this.#currentY) * (SPRING * 0.35) - this.#vy * DAMPING;
    this.#vx += ax * dt;
    this.#vy += ay * dt;
    this.#vx *= Math.exp(-SETTLE_FRICTION * dt);
    this.#vy *= Math.exp(-SETTLE_FRICTION * dt);
    this.#currentX += this.#vx * dt;
    this.#currentY += this.#vy * dt;
  }

  #applyPose(x, y, tiltDeg) {
    const rotate = this.#baseRotateDeg + tiltDeg;
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    this.style.transform = rotate ? `rotate(${rotate}deg)` : "none";
    if (this.#dragging) this.#emit("sticker-drag");
  }

  #bringToFront() {
    stickerStackZ += 1;
    this.style.zIndex = String(stickerStackZ);
  }

  #prepareAbsolute(width, height) {
    this.style.position = "absolute";
    this.style.width = `${width}px`;
    this.style.height = `${height}px`;
    this.style.margin = "0";
    this.style.right = "auto";
    this.style.bottom = "auto";
    this.style.willChange = "left, top, transform";
  }

  #relocateToBody(x, y, width, height) {
    this.#prepareAbsolute(width, height);
    this.#applyPose(x, y, 0);
    this.#suppressDisconnect = true;
    document.body.appendChild(this);
    this.#suppressDisconnect = false;
  }

  #leaveHomeFingerprint(width, height) {
    const parent = this.parentNode;
    if (!parent) return;

    const slot =
      parent instanceof Element && parent.classList.contains("sticker-slot")
        ? parent
        : null;
    const computed = getComputedStyle(this);
    const fingerprint = document.createElement("span");
    fingerprint.className = "sticker-fingerprint";
    fingerprint.setAttribute("aria-hidden", "true");
    fingerprint.setAttribute("inert", "");
    fingerprint.tabIndex = -1;

    const inertStyles = {
      pointerEvents: "none",
      userSelect: "none",
      webkitUserSelect: "none",
      webkitUserDrag: "none",
      touchAction: "none",
      cursor: "default",
    };

    if (slot) {
      // Slot owns spacing/rotation — trace only fills the home cell.
      Object.assign(fingerprint.style, inertStyles, {
        boxSizing: "border-box",
        display: "block",
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        margin: "0",
        zIndex: "0",
      });
    } else {
      Object.assign(fingerprint.style, inertStyles, {
        boxSizing: "border-box",
        display: "inline-flex",
        flexShrink: "0",
        lineHeight: "0",
        verticalAlign: "top",
        width: `${width}px`,
        height: `${height}px`,
        marginTop: computed.marginTop,
        marginRight: computed.marginRight,
        marginBottom: computed.marginBottom,
        marginLeft: computed.marginLeft,
        transform: computed.transform === "none" ? "none" : computed.transform,
        transformOrigin: computed.transformOrigin,
        zIndex: "0",
      });
    }

    const frame = document.createElement("span");
    frame.className = "sticker-fingerprint__frame";
    Object.assign(frame.style, {
      position: "relative",
      display: "block",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      pointerEvents: "none",
      userSelect: "none",
    });

    const src = this.src;
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.draggable = false;
      img.setAttribute("draggable", "false");
      Object.assign(img.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: "grayscale(1) contrast(0.85) brightness(1.15)",
        opacity: "0.38",
        pointerEvents: "none",
        userSelect: "none",
        webkitUserSelect: "none",
        webkitUserDrag: "none",
      });
      frame.appendChild(img);
    } else {
      Object.assign(frame.style, {
        background:
          "color-mix(in srgb, var(--rgn-foreground-secondary, #605d56) 28%, transparent)",
        borderRadius: "8px",
      });
    }

    fingerprint.appendChild(frame);
    parent.insertBefore(fingerprint, this);
    this.#fingerprint = fingerprint;
  }

  #readRotateDeg() {
    const sources = [this];
    if (this.parentElement?.classList.contains("sticker-slot")) {
      sources.unshift(this.parentElement);
    }

    for (const el of sources) {
      const transform = getComputedStyle(el).transform;
      if (!transform || transform === "none") continue;
      try {
        const matrix = new DOMMatrixReadOnly(transform);
        const deg = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
        if (Math.abs(deg) > 0.01) return deg;
      } catch {
        /* try next */
      }
    }
    return 0;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, StickerIcon);
}

export { TAG as STICKER_ICON_TAG };
