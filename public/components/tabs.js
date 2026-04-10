/**
 * Progressively enhances the tab navigation.
 *
 * Reads `role="tab"` buttons and their associated `role="tabpanel"` elements,
 * wiring up click handlers and keyboard navigation (Arrow keys, Home, End).
 * The active tab is persisted to sessionStorage so it survives page reloads.
 */
document.addEventListener('DOMContentLoaded', () => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

  const STORAGE_KEY = 'dev-log-active-tab';

  /**
   * Activates a tab by index, updating aria attributes, hidden state, and storage.
   *
   * @param {number} index
   */
  function activate(index) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute('aria-selected', String(active));
      panels[i].hidden = !active;
    });
    sessionStorage.setItem(STORAGE_KEY, String(index));
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(i));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') activate((i + 1) % tabs.length);
      if (e.key === 'ArrowLeft') activate((i - 1 + tabs.length) % tabs.length);
      if (e.key === 'Home') activate(0);
      if (e.key === 'End') activate(tabs.length - 1);
    });
  });

  // Restore last active tab
  const saved = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
  activate(saved < tabs.length ? saved : 0);
});
