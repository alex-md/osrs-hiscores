import test from 'node:test';
import assert from 'node:assert/strict';
import plan from '../data/progress-recovery-2026-10-28.js';
import { allocateDeficit } from './recovery-math.js';
import { applyRecoveryToUsers } from './progress-recovery.js';
import { normalizeUser } from './store.js';
import { SKILLS } from './constants.js';
import { progressUser } from './simulation.js';
import { BOSSES } from '../../frontend/lib/activities.js';
export function recoveryFixture(row=plan.rows[0]) {
  const xp=Math.floor(row[2]/SKILLS.length);
  return normalizeUser({username:row[0],createdAt:row[1],updatedAt:123,skills:Object.fromEntries(SKILLS.map((s,i)=>[s,{xp:xp+(i===0?row[2]-xp*SKILLS.length:0)}])),
    economy:{bankValue:1000,cash:1000,holdings:{4151:1},inventoryVersion:2},achievements:{legacy:123},
    progress:{sessions:9,earnedXP:5000,bestSessionXP:2000,lastSession:{timestamp:123,gainedXP:1000}}});
}
test('net deficit removes skill/boss substitution noise without rounding inflation',()=>{
  assert.deepEqual(allocateDeficit([100,-90,0]),[10,0,0]);
  assert.deepEqual(allocateDeficit([9,7,-8]),[5,3,0]);
  assert.deepEqual(allocateDeficit([-100,50]),[0,0]);
  assert.deepEqual(allocateDeficit([3,5,0]),[3,5,0]);
  for(let i=0;i<100;i++) {
    const a=[i,30-i,-20,0],r=allocateDeficit(a);
    assert.equal(r.reduce((n,x)=>n+x,0),Math.max(0,a.reduce((n,x)=>n+x,0)));
    assert.ok(r.every((n,j)=>Number.isSafeInteger(n)&&n>=0&&n<=Math.max(0,a[j])));
  }
});
test('bundled plan has a bounded twelve-hour window and exact integer totals',()=>{
  assert.equal(plan.endAt-plan.startAt,12*3600000);
  assert.equal(new Set(plan.rows.map(r=>r[0].toLowerCase())).size,plan.rows.length);
  assert.ok(plan.rows.length<=plan.cohort);
  let xp=0,kills=0;
  for(const row of plan.rows) {
    assert.equal(row[3].length,SKILLS.length);assert.equal(row[4].length,BOSSES.length);
    assert.ok([...row[3],...row[4]].every(n=>Number.isSafeInteger(n)&&n>=0));
    xp+=row[3].reduce((a,b)=>a+b,0);kills+=row[4].reduce((a,b)=>a+b,0);
  }
  assert.equal(xp,plan.totals.xp);assert.equal(kills,plan.totals.kills);
});
test('recovery recalculates levels while preserving wealth, sessions, achievements and existing progress',()=>{
  const user=recoveryFixture(),saved=structuredClone(user);
  const result=applyRecoveryToUsers([user],999);
  const updated=result.users[0];
  assert.deepEqual(user,saved);
  assert.ok(result.summary.xp>0||result.summary.kills>0);
  assert.equal(updated.totalXP-user.totalXP,result.summary.xp);
  assert.equal(updated.totalLevel-user.totalLevel,result.summary.levels);
  assert.deepEqual(updated.economy,user.economy);
  assert.deepEqual(updated.achievements,user.achievements);
  assert.equal(updated.progress.sessions,user.progress.sessions);
  assert.equal(updated.progress.bestSessionXP,user.progress.bestSessionXP);
  assert.deepEqual(updated.progress.lastSession,user.progress.lastSession);
  assert.equal(updated.recoveries[plan.id].estimated,true);
  const repeat=applyRecoveryToUsers(result.users,1000);
  assert.equal(repeat.summary.xp,0);assert.equal(repeat.summary.kills,0);
  assert.deepEqual(repeat.users,result.users);
});
test('recovery skips replaced/missing accounts and clamps gains at XP caps',()=>{
  const wrong=recoveryFixture();wrong.createdAt++;
  assert.equal(applyRecoveryToUsers([wrong]).summary.players,0);
  const capped=recoveryFixture();
  for(const stat of Object.values(capped.skills)) {stat.xp=200000000;stat.level=99;}
  capped.totalXP=SKILLS.length*200000000;capped.totalLevel=SKILLS.length*99;
  const result=applyRecoveryToUsers([capped]);
  assert.equal(result.summary.xp,0);assert.equal(result.summary.levels,0);
  assert.ok(result.users[0].totalXP<=4800000000);
});

test('ordinary progression retains the recovery audit counters and one-time marker',t=>{
  t.mock.method(Math,'random',()=>.999);
  const recovered=applyRecoveryToUsers([recoveryFixture()],Date.parse('2026-10-29T06:56:00Z')).users[0];
  const audit=structuredClone(recovered.recoveries),xp=recovered.progress.recoveredXP;
  progressUser(recovered,new Date('2026-10-29T07:00:00Z'),{rng:()=>.5});
  assert.equal(recovered.progress.recoveredXP,xp);
  assert.deepEqual(recovered.recoveries,audit);
  assert.ok(recovered.progress.earnedXP>=xp);
});
