import "@romainpct/romain-garden-ds/tokens.css";
import "@romainpct/romain-garden-ds/text-styles.css";
import "@romainpct/romain-garden-ds";
import "./components/index.js";
import "./styles.css";

function getNav() {
  return document.querySelector("romain-garden-nav");
}

function openContact() {
  getNav()?.openContact();
}

function setupHeaderMenu() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const panel = document.querySelector("[data-menu-panel]");
  if (!(toggle instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
    return () => {};
  }

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(panel.hidden);
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (panel.hidden) return;
    if (panel.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  return () => setOpen(false);
}

const closeMenu = setupHeaderMenu();

document.querySelectorAll("[data-open-contact]").forEach((el) => {
  el.addEventListener("click", () => {
    closeMenu();
    openContact();
  });
});
