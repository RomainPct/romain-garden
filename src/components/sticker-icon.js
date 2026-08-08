const TAG = "sticker-icon";

const styles = /* css */ `
  :host {
    display: inline-flex;
    flex-shrink: 0;
    line-height: 0;
  }

  .frame {
    position: relative;
    display: block;
    width: var(--sticker-size, 80px);
    height: var(--sticker-size, 80px);
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
  }
`;

export class StickerIcon extends HTMLElement {
  static get observedAttributes() {
    return ["src", "alt", "size"];
  }

  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
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
      ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(this.alt)}" width="100%" height="100%" />`
      : `<slot></slot>`;

    this.#root.innerHTML = `
      <style>${styles}</style>
      <span class="frame" part="frame">${img}</span>
    `;
  }
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
