import { SKILLS, getSkillIcon } from '../constants/skills.js';
import { createElement, createText } from '../core/dom.js';

export function populateSkillLinks(root) {
  const container = typeof root === 'string' ? document.querySelector(root) : root;
  if (!container) return;
  container.innerHTML = '';
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const active = params.get('skill') || hashParams.get('skill');
  for (const skill of SKILLS) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `skill-hiscores.html?skill=${skill}`;
    link.className = 'flex-items-center gap-2 hover:text-accent';
    if (active === skill) link.classList.add('text-accent', 'font-semibold');
    const iconSrc = getSkillIcon(skill);
    if (iconSrc) {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = skill;
      img.className = 'skill-icon skill-icon--xs';
      link.appendChild(img);
    }
    const span = createElement('span', null, [createText(skill.charAt(0).toUpperCase() + skill.slice(1))]);
    link.appendChild(span);
    li.appendChild(link);
    container.appendChild(li);
  }
}
