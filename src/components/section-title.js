import "./sticker-icon.js";

const TAG = "section-title";
const MAX_ICONS = 3;

const styles = /* css */ `
  :host {
    display: block;
    width: 100%;
  }

  .root {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 38px;
    width: 100%;
  }

  .rule {
    width: 100%;
    height: 2px;
    background: var(--rgn-border-default);
    border: none;
    margin: 0;
  }

  .body {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 24px;
    width: 100%;
  }

  .content {
    margin: 0;
    flex: 0 1 auto;
    max-width: 100%;
    font-family: var(--rgn-text-huge-title-font-family);
    font-weight: var(--rgn-text-huge-title-font-weight);
    font-size: var(--rgn-text-huge-title-font-size);
    letter-spacing: var(--rgn-text-huge-title-letter-spacing);
    line-height: 1.2;
    color: var(--rgn-foreground-secondary);
    overflow-wrap: anywhere;
  }

  .icons {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-start;
  }

  .icons:not(:has(.sticker-slot)):not(:has(sticker-icon)) {
    display: none;
  }

  .sticker-slot {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 100px;
    height: 100px;
  }

  .sticker-slot:not(:first-child) {
    margin-left: -33px;
  }

  .sticker-slot--1 {
    z-index: 3;
    transform: rotate(-7.34deg);
  }

  .sticker-slot--2 {
    z-index: 1;
    transform: rotate(0deg);
  }

  .sticker-slot--3 {
    z-index: 2;
    transform: rotate(8.46deg);
  }

  .sticker-slot sticker-icon,
  .sticker-slot .sticker-fingerprint {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    --sticker-size: 100px;
  }

  .subtitle {
    margin: -30px 0 0;
    max-width: 42rem;
    font-family: var(--rgn-text-body-font-family);
    font-weight: var(--rgn-text-body-font-weight);
    font-size: var(--rgn-text-body-font-size);
    letter-spacing: var(--rgn-text-body-letter-spacing);
    line-height: 22px;
    color: var(--rgn-foreground-secondary);
  }

  @media (max-width: 640px) {
    .body {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }

    .content {
      width: 100%;
    }

    .subtitle {
      margin-top: -22px;
    }
  }
`;

export class SectionTitle extends HTMLElement {
  static get observedAttributes() {
    return ["content", "subtitle", "icon-1", "icon-2", "icon-3"];
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

  get content() {
    return this.getAttribute("content") ?? "";
  }

  set content(value) {
    this.setAttribute("content", value ?? "");
  }

  get subtitle() {
    return this.getAttribute("subtitle") ?? "";
  }

  set subtitle(value) {
    if (value) this.setAttribute("subtitle", value);
    else this.removeAttribute("subtitle");
  }

  getIcon(index) {
    return this.getAttribute(`icon-${index}`) ?? "";
  }

  setIcon(index, value) {
    const name = `icon-${index}`;
    if (value) this.setAttribute(name, value);
    else this.removeAttribute(name);
  }

  #attrIcons() {
    const icons = [];
    for (let i = 1; i <= MAX_ICONS; i += 1) {
      const src = this.getIcon(i);
      if (src) icons.push(src);
    }
    return icons;
  }

  render() {
    const attrIcons = this.#attrIcons();
    const iconsHtml =
      attrIcons.length > 0
        ? attrIcons
            .map(
              (src, index) =>
                `<span class="sticker-slot sticker-slot--${index + 1}"><sticker-icon src="${escapeAttr(src)}" alt="" size="100"></sticker-icon></span>`,
            )
            .join("")
        : `<slot name="icon"></slot>`;

    const text = this.content;
    const contentHtml = text ? escapeHtml(text) : `<slot></slot>`;
    const subtitle = this.subtitle;
    const subtitleHtml = subtitle
      ? `<p class="subtitle" part="subtitle">${escapeHtml(subtitle)}</p>`
      : "";

    this.#root.innerHTML = `
      <style>${styles}</style>
      <div class="root" part="root">
        <hr class="rule" part="rule" />
        <div class="body" part="body">
          <p class="content" part="content">${contentHtml}</p>
          <div class="icons" part="icons">${iconsHtml}</div>
        </div>
        ${subtitleHtml}
      </div>
    `;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, SectionTitle);
}

export { TAG as SECTION_TITLE_TAG };
