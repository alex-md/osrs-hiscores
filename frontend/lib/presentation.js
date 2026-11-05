export const number = (value) =>
  new Intl.NumberFormat("en-US").format(Number(value) || 0);
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const xpScale = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
export const playerLink = (name) => `#user/${encodeURIComponent(name)}`;
export const date = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not recorded";
export const skillIcon = (skill) =>
  `<svg class="skill-symbol" aria-hidden="true" viewBox="0 0 16 16"><use href="skill-icons.svg#${skill}"></use></svg>`;
export const crest = `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 2 44 11v18C44 42 24 53 24 53S4 42 4 29V11Z"/><path d="m17 18 14 20m-14 0 14-20M12 34l9 7m6 0 9-7"/></svg>`;
