import { friendlyAchievementLabel as friendlyLabelFromCatalog } from '../constants/achievements.js';

function formatRelativeUnit(value, unit, future) {
  return future ? `in ${value}${unit}` : `${value}${unit} ago`;
}

export function describeRelativeTime(input, { allowFuture = false } = {}) {
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  const now = Date.now();
  let diff = now - value;
  if (!allowFuture && diff < 0) diff = 0;
  const abs = Math.abs(diff);
  const seconds = Math.round(abs / 1000);
  if (seconds < 5) return allowFuture && diff < 0 ? 'in moments' : 'just now';
  if (seconds < 60) return formatRelativeUnit(seconds, 's', diff < 0);
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatRelativeUnit(minutes, 'm', diff < 0);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatRelativeUnit(hours, 'h', diff < 0);
  const days = Math.round(hours / 24);
  if (days < 30) return formatRelativeUnit(days, 'd', diff < 0);
  const months = Math.round(days / 30);
  if (months < 12) return formatRelativeUnit(months, 'mo', diff < 0);
  const years = Math.round(days / 365);
  return formatRelativeUnit(years, 'y', diff < 0);
}

export function formatRelativeTime(value, options = {}) {
  const rel = describeRelativeTime(value, options);
  if (rel) return rel;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return new Date(numeric).toLocaleString();
}

export function formatSigned(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '±0';
  const formatted = Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 ? 1 : 0
  });
  return `${value > 0 ? '+' : '−'}${formatted}`;
}

export function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const format = (divisor, suffix, decimals) => `${(value / divisor).toFixed(decimals).replace(/\.0+$/, '')}${suffix}`;
  if (abs >= 1e9) return format(1e9, 'B', abs >= 1e10 ? 0 : 1);
  if (abs >= 1e6) return format(1e6, 'M', abs >= 1e7 ? 0 : 1);
  if (abs >= 1e3) return format(1e3, 'K', abs >= 1e4 ? 0 : 1);
  return value.toLocaleString();
}

export const friendlyAchievementLabel = friendlyLabelFromCatalog;
