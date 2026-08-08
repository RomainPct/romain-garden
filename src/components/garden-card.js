import "./sticker-icon.js";

const TAG = "garden-card";

const styles = /* css */ `
  :host {
    display: block;
    width: 100%;
    max-width: 100%;
  }

  a.card,
  .card {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 32px;
    width: 100%;
    margin: 0;
    padding: 32px;
    border: none;
    border-radius: 16px;
    background: var(--rgn-background-z1);
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    transform: rotate(0deg) scale(1);
    transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  a.card:hover,
  a.card:focus-visible {
    transform: rotate(var(--card-hover-rotate, -2deg)) scale(1.01);
  }

  a.card:focus-visible {
    outline: 2px solid var(--rgn-brand-accent);
    outline-offset: 3px;
  }

  .icon {
    flex-shrink: 0;
  }

  .icon sticker-icon {
    --sticker-size: 80px;
  }

  .content {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    text-align: left;
  }

  .title {
    margin: 0;
    font-family: var(--rgn-text-large-title-font-family);
    font-weight: var(--rgn-text-large-title-font-weight);
    font-size: var(--rgn-text-large-title-font-size);
    letter-spacing: var(--rgn-text-large-title-letter-spacing);
    line-height: 32px;
    color: var(--rgn-foreground-primary);
    overflow-wrap: anywhere;
  }

  .subtitle {
    margin: 0;
    font-family: var(--rgn-text-body-font-family);
    font-weight: var(--rgn-text-body-font-weight);
    font-size: var(--rgn-text-body-font-size);
    letter-spacing: var(--rgn-text-body-letter-spacing);
    line-height: 22px;
    color: var(--rgn-foreground-secondary);
    overflow-wrap: anywhere;
  }

  .chevron {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 20px;
    color: var(--rgn-foreground-secondary);
  }

  .chevron-mark {
    display: block;
    width: 8px;
    height: 8px;
    border-right: 2px solid currentColor;
    border-top: 2px solid currentColor;
    transform: rotate(45deg);
  }

  .row {
    display: contents;
  }

  @media (max-width: 640px) {
    a.card,
    .card {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding: 24px;
    }

    .icon sticker-icon {
      --sticker-size: 48px;
    }

    .row {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      width: 100%;
    }

    .row .content {
      flex: 1 1 auto;
    }
  }
`;

function randomHoverRotationDeg() {
  return Math.random() * 6 - 3; // -3 … +3
}

export class GardenCard extends HTMLElement {
  static get observedAttributes() {
    return ["title", "subtitle", "href", "icon"];
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

  #refreshHoverRotation = () => {
    const card = this.#root.querySelector(".card");
    if (!card) return;
    card.style.setProperty(
      "--card-hover-rotate",
      `${randomHoverRotationDeg().toFixed(2)}deg`,
    );
  };

  get title() {
    return this.getAttribute("title") ?? "";
  }

  set title(value) {
    this.setAttribute("title", value ?? "");
  }

  get subtitle() {
    return this.getAttribute("subtitle") ?? "";
  }

  set subtitle(value) {
    this.setAttribute("subtitle", value ?? "");
  }

  get href() {
    return this.getAttribute("href") ?? "";
  }

  set href(value) {
    if (value) this.setAttribute("href", value);
    else this.removeAttribute("href");
  }

  get icon() {
    return this.getAttribute("icon") ?? "";
  }

  set icon(value) {
    if (value) this.setAttribute("icon", value);
    else this.removeAttribute("icon");
  }

  render() {
    const href = this.href;
    const tag = href ? "a" : "div";
    const hrefAttr = href ? ` href="${escapeAttr(href)}"` : "";
    const iconSrc = this.icon;

    const icon = iconSrc
      ? `<sticker-icon class="icon" src="${escapeAttr(iconSrc)}" alt="" size="80"></sticker-icon>`
      : `<span class="icon"><slot name="icon"></slot></span>`;

    const copy = `
      <div class="content" part="content">
        <p class="title" part="title">${escapeHtml(this.title)}</p>
        <p class="subtitle" part="subtitle">${escapeHtml(this.subtitle)}</p>
      </div>
    `;

    const chevron = `
      <span class="chevron" part="chevron" aria-hidden="true">
        <span class="chevron-mark"></span>
      </span>
    `;

    this.#root.innerHTML = `
      <style>${styles}</style>
      <${tag} class="card" part="card"${hrefAttr}>
        ${icon}
        <div class="row">
          ${copy}
          ${chevron}
        </div>
      </${tag}>
    `;

    const card = this.#root.querySelector(".card");
    card?.addEventListener("pointerenter", this.#refreshHoverRotation);
    card?.addEventListener("focus", this.#refreshHoverRotation);
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
  customElements.define(TAG, GardenCard);
}

export { TAG as GARDEN_CARD_TAG };
