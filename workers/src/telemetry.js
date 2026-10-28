// Observational only: call after the SQLite commit. Analytics delivery is best
// effort and must never make a committed simulation appear to have failed.
export function emitExchangeTelemetry(env, exchangeJSON, snapshotJSON) {
  if (!env.EXCHANGE_ANALYTICS || !exchangeJSON) return;
  try {
    const exchange = JSON.parse(exchangeJSON);
    const snapshot = JSON.parse(snapshotJSON);
    const blobs = ["exchange-v1", "cycle", "", snapshot.generation];
    env.EXCHANGE_ANALYTICS.writeDataPoint({
      indexes: ["cycle"], blobs,
      doubles: [exchange.generatedAt, exchange.turnover, exchange.tax, exchange.fills, snapshot.totalPlayers],
    });
    // 250 points/invocation maximum, including the cycle summary. The catalog
    // currently has 159 items; cap future growth without affecting simulation.
    for (const item of exchange.items.slice(0, 249)) {
      env.EXCHANGE_ANALYTICS.writeDataPoint({
        indexes: [String(item.id)],
        blobs: ["exchange-v1", "item", String(item.id), snapshot.generation],
        doubles: [exchange.generatedAt, item.price, item.volume, item.traded,
          item.circulatingSupply, item.buyUnits, item.sellUnits],
      });
    }
  } catch (error) {
    console.error("Exchange telemetry skipped; world commit preserved:", error);
  }
}
