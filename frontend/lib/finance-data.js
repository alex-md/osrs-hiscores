// Compact canonical history keeps 35 daily observations within SQLite budgets.
const keys=['day','from','at','bank','cash','change','market','flows','earned','spent','trades','observedMs'];
const unpack = row => Array.isArray(row) ? Object.fromEntries(keys.map((key,i)=>[key,row[i]])) : row;
export const financeDays = finance => (finance?.days || []).map(unpack);
export const latestFinanceDay = finance => unpack(finance?.days?.at(-1));
export const packFinanceDays = days => days.map(row=>keys.map(key=>row[key] ?? 0));
