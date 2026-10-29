// Build an auditable, fixed one-time compensation plan; no production writes.
// node scripts/build-progress-recovery.mjs /tmp/public-snapshot.json
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { progressUser } from '../workers/src/simulation.js';
import { clearExchange, exchangeMarket } from '../workers/src/exchange.js';
import { advanceTrainingClimate } from '../workers/src/training-dynamics.js';
import { SKILLS } from '../workers/src/constants.js';
import { BOSSES } from '../frontend/lib/activities.js';
import { allocateDeficit } from '../workers/src/recovery-math.js';
const source = await readFile(process.argv[2]);
const snapshot = JSON.parse(source);
const legacyRevision = 'cc08c5ada59d8a87daa7298e8c31cde77e1f9357';
const root = await mkdtemp(join(tmpdir(), 'osrs-legacy-recovery-'));
const hash = text => createHash('sha256').update(text).digest('hex');
function random(key) {
  let state = Number.parseInt(hash(key).slice(0,8),16);
  return () => ((state = (Math.imul(state,1664525)+1013904223)>>>0)/2**32);
}
try {
  const archive=execFileSync('git',['archive',legacyRevision,'package.json','workers/src','workers/data','frontend'],{maxBuffer:20*1024*1024});
  execFileSync('tar',['-x','-C',root],{input:archive});
  const oldSim=await import(pathToFileURL(join(root,'workers/src/simulation.js')));
  const oldExchange=await import(pathToFileURL(join(root,'workers/src/exchange.js')));
  const endAt=snapshot.exchange.generatedAt, startAt=endAt-12*3600000;
  const startingExchange={...snapshot.exchange,prices:Object.fromEntries(snapshot.exchange.items.map(i=>[i.id,i.price]))};
  const climates=[];let climate;
  for(let tick=0;tick<48;tick++) {
    const at=new Date(startAt+(tick+1)*900000);
    climate=advanceTrainingClimate(climate,at,random(`climate:${tick}`));climates.push(climate);
  }
  function replay(advance,clear) {
    const users=structuredClone(snapshot.users);let exchange=structuredClone(startingExchange);
    const savedRandom=Math.random;
    try {
      for(let tick=0;tick<48;tick++) {
        const at=new Date(startAt+(tick+1)*900000),market=exchangeMarket(exchange);
        for(const user of users) {
          const hours=Math.max(0,Math.min(.25,(+at-Math.max(startAt,user.createdAt||startAt))/3600000));
          const rng=random(`session:${tick}:${user.username.toLowerCase()}`);
          Math.random=rng;
          advance(user,at,{rng,hours,market,climate:climates[tick]});
        }
        exchange=clear(users,at,exchange);
      }
    } finally {Math.random=savedRandom;}
    return users;
  }
  const broken=replay(oldSim.progressUser,oldExchange.clearExchange);
  const repaired=replay(progressUser,clearExchange);
  const rows=[];const skills=Array(SKILLS.length).fill(0),bosses=Array(BOSSES.length).fill(0);
  let xp=0,kills=0;
  for(let i=0;i<repaired.length;i++) {
    const before=snapshot.users[i],old=broken[i],fixed=repaired[i];
    const skillDeltas=allocateDeficit(SKILLS.map(s=>fixed.skills[s].xp-old.skills[s].xp));
    const bossDeltas=allocateDeficit(BOSSES.map(b=>fixed.bosses[b.key]-old.bosses[b.key]));
    const gained=skillDeltas.reduce((a,b)=>a+b,0),kc=bossDeltas.reduce((a,b)=>a+b,0);
    if(!gained&&!kc)continue;
    rows.push([before.username,before.createdAt,before.totalXP,skillDeltas,bossDeltas]);
    xp+=gained;kills+=kc;
    skillDeltas.forEach((n,j)=>skills[j]+=n);bossDeltas.forEach((n,j)=>bosses[j]+=n);
  }
  const plan={id:'2026-10-28-12h-v1',estimated:true,startAt,endAt,hours:12,
    method:'paired-replay-net-deficit',legacyRevision,inputSha256:hash(source),
    skillKeys:SKILLS,bossKeys:BOSSES.map(b=>b.key),cohort:snapshot.users.length,totals:{players:rows.length,xp,kills,skills,bosses},rows};
  await writeFile(new URL('../workers/data/progress-recovery-2026-10-28.js',import.meta.url),`// One-time estimated compensation, explicitly authorized by the world owner.\nexport default ${JSON.stringify(plan)};\n`);
  console.log(JSON.stringify({...plan,rows:undefined},null,2));
} finally {await rm(root,{recursive:true,force:true});}
