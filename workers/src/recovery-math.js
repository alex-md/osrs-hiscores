// Credit only the net positive total deficit, distributed over positive metric
// differences. A shift between skills/bosses must not inflate the total award.
export function allocateDeficit(differences) {
  const budget=Math.max(0,differences.reduce((sum,n)=>sum+n,0));
  const positive=differences.map(n=>Math.max(0,n));
  const total=positive.reduce((sum,n)=>sum+n,0);
  if(!total||!budget)return positive.map(()=>0);
  const exact=positive.map(n=>n*budget/total),result=exact.map(Math.floor);
  let remainder=budget-result.reduce((sum,n)=>sum+n,0);
  const order=exact.map((n,i)=>({i,fraction:n-result[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
  for(const {i} of order)if(remainder>0&&positive[i]) {result[i]++;remainder--;}
  return result;
}
