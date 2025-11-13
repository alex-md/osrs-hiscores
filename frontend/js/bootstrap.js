import { $, $$, showToast } from './core/dom.js';
import { initThemeToggle, updateThemeToggle } from './core/theme.js';
import { populateSkillLinks } from './components/skill-links.js';
import { applyTickerMotion, initTickerListeners, scheduleTickerRefresh } from './core/ticker.js';
import { getApiBase, setApiBase, clearApiBase, onApiBaseChange } from './core/api.js';

let tickerInitialized = false;

function initTickerWrappers() {
  $$('.hero-ticker').forEach((wrapper) => {
    const track = wrapper.querySelector('.ticker-track');
    if (track) applyTickerMotion(wrapper, track);
  });
  scheduleTickerRefresh();
}

function bindApiBaseControls() {
  const changeButtons = $$('[data-action="change-api-base"]');
  const resetButtons = $$('[data-action="reset-api-base"]');
  changeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = window.prompt('Enter API base URL:', getApiBase());
      if (!next) return;
      const updated = setApiBase(next);
      showToast(`API base set to ${updated}. Reloading…`);
      setTimeout(() => window.location.reload(), 400);
    });
  });
  resetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const updated = clearApiBase();
      showToast('API base override cleared. Reloading…');
      setTimeout(() => window.location.reload(), 400);
    });
  });
}

function updateApiBaseDisplay() {
  const span = $('#currentApiBase');
  if (!span) return;
  const base = getApiBase();
  span.textContent = base === window.location.origin ? 'Same-origin' : base;
}

export function initCommonUi() {
  if (window.lucide) window.lucide.createIcons();
  initThemeToggle();
  updateThemeToggle();
  populateSkillLinks('#sidebarSkillList');
  bindApiBaseControls();
  updateApiBaseDisplay();
  const unsubscribe = onApiBaseChange(() => updateApiBaseDisplay());
  if (!tickerInitialized) {
    initTickerListeners();
    tickerInitialized = true;
  }
  initTickerWrappers();
  document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
    updateThemeToggle();
    initTickerWrappers();
  });
  return () => unsubscribe();
}
