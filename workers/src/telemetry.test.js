import test from "node:test";
import assert from "node:assert/strict";
import { emitExchangeTelemetry } from "./telemetry.js";

test("catalog growth cannot exceed the Analytics Engine per-invocation point limit", () => {
  const points = [];
  const item = { price: 10, volume: 2, traded: 20, circulatingSupply: 5, buyUnits: 1, sellUnits: 3 };
  const exchange = { generatedAt: 123, turnover: 20, tax: 0, fills: 1,
    items: Array.from({ length: 300 }, (_, id) => ({ id: String(id), ...item })) };
  emitExchangeTelemetry({ EXCHANGE_ANALYTICS: { writeDataPoint: point => points.push(point) } },
    JSON.stringify(exchange), JSON.stringify({ generation: "test", totalPlayers: 5000 }));
  assert.equal(points.length, 250);
  assert.equal(points[0].blobs[1], "cycle");
  assert.equal(points.at(-1).blobs[2], "248");
});

test("no binding or no staged exchange requires no parsing or emission", () => {
  emitExchangeTelemetry({}, "invalid", "invalid");
  emitExchangeTelemetry({ EXCHANGE_ANALYTICS: { writeDataPoint() { assert.fail(); } } }, undefined, undefined);
});
