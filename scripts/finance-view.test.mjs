import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryArticle } from '../frontend/lib/discovery-view.js';
import { playerFinances,financeSummary } from '../frontend/lib/finance-view.js';
import { number,escape,date,playerLink } from '../frontend/lib/presentation.js';
import { route } from '../frontend/lib/routes.js';
test('discovery evidence escapes names, preserves financial links and states the limits of attribution',()=>{
  const html=discoveryArticle({kind:'after-purchase',username:'<Ada>',itemId:20997,price:1,counterparty:'<Bea>',timestamp:1,purchasedAt:1,boss:'scurrius',kills:1},{number,escape,date,playerLink});
  assert.ok(!html.includes('<Ada>'));assert.ok(html.includes('&lt;Ada&gt;'));assert.ok(html.includes('?view=finances'));
  assert.ok(html.includes('without attributing'));
  const parsed=route(new URL('https://site/#user/Red%20Fox?view=finances'));
  assert.equal(parsed.username,'Red Fox');assert.equal(parsed.params.get('view'),'finances');
});
test('financial views explain missing observations rather than implying zero historical returns',()=>{
  assert.match(playerFinances({username:'Ada',economy:{bankValue:0,cash:0}}),/baseline/);
  assert.match(financeSummary(null),/next scheduled update/);
});
