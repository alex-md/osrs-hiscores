export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function createElement(tag, className, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) node.appendChild(child);
  return node;
}

export function createText(value) {
  return document.createTextNode(value);
}

function ensureToastContainer() {
  let container = $('#toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'fixed top-4 right-4 flex flex-col gap-2 z-50';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', timeout = 3000) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = type === 'error' ? 'toast toast--error' : 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, timeout);
}

export function replaceChildren(target, children = []) {
  const node = typeof target === 'string' ? $(target) : target;
  if (!node) return null;
  node.innerHTML = '';
  for (const child of children) node.appendChild(child);
  return node;
}
