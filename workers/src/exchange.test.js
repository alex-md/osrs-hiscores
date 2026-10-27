import test from "node:test";
import assert from "node:assert/strict";
import baseline from "../data/ge-baseline.js";
import { normalizeUser } from "./store.js";
import { valueBank } from "./economy.js";
import { exchangeMarket, clearExchange } from "./exchange.js";
const date = new Date("2026-10-26T19:00:00Z");
function population() {
  return Array.from({ length: 200 }, (_, index) => {
    const user = normalizeUser({ username: `Trader${index}`, activity: "ACTIVE", skills: {}, economy: { bankValue: 10_000_000 } });
    valueBank(user);
    user.economy.cash = 3_000_000;
    user.economy.holdings = Object.fromEntries(Object.entries(baseline).map(([id, item]) => [id, 100_000 / item.price]));
    valueBank(user);
    return user;
  });
}
const sum = (users, getter) => users.reduce((total, user) => total + getter(user.economy), 0);
test("GE matches actual accounts, conserves coins less tax and conserves every item", () => {
  const users = population();
  const cash = sum(users, e => e.cash), wealth = sum(users, e => e.bankValue);
  const quantities = Object.fromEntries(Object.keys(baseline).map(id => [id, sum(users, e => e.holdings[id] || 0)]));
  const exchange = clearExchange(users, date);
  assert.ok(exchange.fills > 100);
  assert.ok(exchange.turnover > 0);
  assert.ok(Math.abs(sum(users, e => e.cash) - (cash - exchange.tax)) < 0.01);
  assert.ok(Math.abs(sum(users, e => e.bankValue) - (wealth - exchange.tax)) <= users.length);
  for (const id of Object.keys(baseline)) assert.ok(Math.abs(sum(users, e => e.holdings[id] || 0) - quantities[id]) < 1e-6);
  for (const trade of exchange.tape) assert.notEqual(trade.buyer, trade.seller);
  for (const user of users) {
    assert.ok(user.economy.cash >= 0);
    assert.ok(Object.values(user.economy.holdings).every(value => value >= 0));
  }
});
test("empty, inactive and zero-time markets cannot invent trades; self trades do not fill", () => {
  for (const users of [[], population().map(user => ({ ...user, activity: "INACTIVE" })), population().slice(0, 1)]) {
    assert.equal(clearExchange(users, date).fills, 0);
  }
  assert.equal(clearExchange(population(), date, {}, { hours: 0 }).fills, 0);
});
test("free-floating prices and history stay finite, and bank accounting reconciles over many updates", () => {
  const users = population();
  const opening = new Map(users.map(user => [user.username, user.economy.bankValue - user.economy.revaluation]));
  let exchange = {};
  for (let tick = 0; tick < 200; tick++) {
    exchange = clearExchange(users, new Date(date.getTime() + tick * 900000), exchange);
    const market = exchangeMarket(exchange);
    for (const item of exchange.items) {
      assert.ok(Number.isFinite(market.prices[item.id]) && market.prices[item.id] >= 1);
      assert.ok(Math.abs(Math.log(market.prices[item.id] / item.price)) <= 0.02000001);
      assert.ok(item.history.length <= 24);
    }
  }
  for (const user of users) {
    const e = user.economy;
    assert.ok(Math.abs(e.bankValue - (opening.get(user.username) + e.earned - e.spent + e.revaluation)) < 201);
  }
});

test("persisted quotes do not reset at midnight or revert when there are no orders", () => {
  const prices = Object.fromEntries(Object.entries(baseline).map(([id, item]) => [id, item.price * 8]));
  let exchange = { prices };
  for (const at of ["2026-10-26T23:45:00Z", "2026-10-27T00:00:00Z", "2026-10-28T12:00:00Z"])
    exchange = clearExchange([], new Date(at), exchange);
  assert.deepEqual(exchange.prices, prices);
  assert.equal(exchange.fills, 0);
});

test("sustained backed supply can move a price beyond the old fifteen-percent band", () => {
  const users = population().slice(0, 20);
  for (const user of users) {
    user.economy.cash = 0;
    user.economy.holdings = { 4151: 1000 };
  }
  let exchange = {};
  for (let tick = 0; tick < 24; tick++)
    exchange = clearExchange(users, new Date(date.getTime() + tick * 900000), exchange);
  assert.ok(exchange.prices[4151] < baseline[4151].price * 0.7);
  assert.ok(exchange.items.find(item => item.id === "4151").history.length === 24);
});
