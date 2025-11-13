import { $ } from './dom.js';

const storageKey = 'theme';

export function getTheme() {
  return localStorage.getItem(storageKey) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(storageKey, theme);
}

export function setTheme(theme) {
  if (!theme) return;
  applyTheme(theme);
  updateThemeToggle();
}

export function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
}

export function updateThemeToggle() {
  const btn = $('#themeToggle');
  if (!btn) return;
  btn.innerHTML = '';
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', getTheme() === 'light' ? 'moon' : 'sun');
  btn.appendChild(icon);
  if (window.lucide) window.lucide.createIcons();
}

export function initThemeToggle() {
  const btn = $('#themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => toggleTheme());
  updateThemeToggle();
}
