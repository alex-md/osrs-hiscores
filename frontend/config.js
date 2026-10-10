// Cloudflare uses its same-origin API. The GitHub Pages publish script supplies
// the separate Worker URL, including when Pages uses a custom domain.
globalThis.HISCORES_CONFIG = Object.freeze({ apiBase: "" });
