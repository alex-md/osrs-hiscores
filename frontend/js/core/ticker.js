const trackedTickers = new Set();
let tickerRefreshRaf = null;
const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function applyTickerMotion(wrapper, track, { skipTrackRegister = false } = {}) {
  if (!wrapper || !track) return;
  if (!skipTrackRegister) trackedTickers.add(track);
  const reduceMotion = motionQuery ? motionQuery.matches : false;
  const items = Array.from(track.querySelectorAll('.ticker-item'));
  const baseItems = items.filter((node) => node.dataset.duplicate !== 'true');
  const measuredItems = baseItems.length ? baseItems : items;
  const shouldStatic = reduceMotion || measuredItems.length <= 1;
  wrapper.classList.toggle('paused', shouldStatic);
  wrapper.classList.toggle('ticker--static', shouldStatic);
  if (shouldStatic) {
    track.style.animation = 'none';
    track.style.justifyContent = 'center';
    track.style.removeProperty('--ticker-duration');
    return;
  }
  track.style.animation = '';
  track.style.justifyContent = '';
  track.style.removeProperty('--ticker-duration');
  const measure = () => {
    if (!wrapper.isConnected || !track.isConnected) {
      trackedTickers.delete(track);
      return;
    }
    const wrapperWidth = wrapper.getBoundingClientRect().width;
    if (!wrapperWidth) {
      requestAnimationFrame(measure);
      return;
    }
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
    const totalWidth = measuredItems.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0) + Math.max(0, measuredItems.length - 1) * gap;
    const distance = totalWidth + wrapperWidth;
    const pixelsPerSecond = 110;
    const duration = Math.max(14, distance / pixelsPerSecond);
    track.style.setProperty('--ticker-duration', `${duration.toFixed(2)}s`);
  };
  requestAnimationFrame(measure);
}

export function refreshTickers() {
  trackedTickers.forEach((track) => {
    const wrapper = track?.parentElement;
    if (!wrapper || !track.isConnected) {
      trackedTickers.delete(track);
      return;
    }
    applyTickerMotion(wrapper, track, { skipTrackRegister: true });
  });
}

export function scheduleTickerRefresh() {
  if (typeof requestAnimationFrame !== 'function') {
    refreshTickers();
    return;
  }
  if (tickerRefreshRaf) cancelAnimationFrame(tickerRefreshRaf);
  tickerRefreshRaf = requestAnimationFrame(() => {
    refreshTickers();
    tickerRefreshRaf = null;
  });
}

export function initTickerListeners() {
  window.addEventListener('resize', scheduleTickerRefresh);
  if (motionQuery) {
    const handler = () => scheduleTickerRefresh();
    if (typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', handler);
    else if (typeof motionQuery.addListener === 'function') motionQuery.addListener(handler);
  }
}
