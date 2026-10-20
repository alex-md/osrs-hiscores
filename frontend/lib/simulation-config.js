// Shared by the Worker and browser so cadence, copy and quota bounds agree.
export const UPDATE_MINUTES = 15;
export const UPDATE_INTERVAL_MS = UPDATE_MINUTES * 60_000;
export const TICK_HOURS = UPDATE_MINUTES / 60;
export const MAX_PLAYERS = 5_000;
