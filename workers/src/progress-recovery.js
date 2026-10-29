import plan from '../data/progress-recovery-2026-10-28.js';
import { SKILLS } from './constants.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import { allUsers, normalizeUser, readJSON, writeJSON } from './store.js';
import { publishSnapshot } from './snapshots.js';
import { levelFromXp, totalLevel, totalXP } from './utils.js';
import { HttpError } from './http.js';
export const RECOVERY_ID=plan.id;
export const RECOVERY_KEY=`system:progress-recovery:${RECOVERY_ID}`;

// The only available grant is the reviewed, bundled plan. No API-provided XP,
// boss counts, dates or usernames can expand this one-time operation.
export function applyRecoveryToUsers(users, at=Date.now(), recovery=plan) {
  if (JSON.stringify(recovery.skillKeys)!==JSON.stringify(SKILLS)
    || JSON.stringify(recovery.bossKeys)!==JSON.stringify(BOSSES.map(b=>b.key))) throw new Error('Recovery catalog mismatch');
  const byName=new Map(recovery.rows.map(row=>[row[0].toLowerCase(),row]));
  const summary={id:recovery.id,estimated:true,method:recovery.method,inputSha256:recovery.inputSha256,
    startAt:recovery.startAt,endAt:recovery.endAt,hours:12,players:0,xp:0,levels:0,kills:0,
    skills:Object.fromEntries(SKILLS.map(s=>[s,0])),bosses:Object.fromEntries(BOSSES.map(b=>[b.key,0])),skipped:[]};
  const backups=[];
  const updated=users.map(original=>{
    const row=byName.get(original.username.toLowerCase());
    if(!row)return original;
    if(original.createdAt!==row[1] || original.totalXP<row[2]) {
      summary.skipped.push({username:original.username,reason:'Account identity or progression changed'});return original;
    }
    if(original.recoveries?.[recovery.id]) {
      summary.skipped.push({username:original.username,reason:'Already compensated'});return original;
    }
    if(row[3].length!==SKILLS.length||row[4].length!==BOSSES.length||[...row[3],...row[4]].some(n=>!Number.isSafeInteger(n)||n<0)) throw new Error('Invalid recovery award');
    const user=structuredClone(original),skills={},bosses={};let xp=0,kills=0;
    SKILLS.forEach((skill,i)=>{
      const stat=user.skills[skill],amount=Math.min(row[3][i],200000000-stat.xp);
      stat.xp+=amount;stat.level=levelFromXp(stat.xp);skills[skill]=amount;xp+=amount;summary.skills[skill]+=amount;
    });
    BOSSES.forEach((boss,i)=>{
      const amount=Math.min(row[4][i],1000000000000-(user.bosses[boss.key]||0));
      user.bosses[boss.key]=(user.bosses[boss.key]||0)+amount;bosses[boss.key]=amount;kills+=amount;summary.bosses[boss.key]+=amount;
    });
    if(!xp&&!kills)return original;
    user.totalXP=totalXP(user.skills);user.totalLevel=totalLevel(user.skills);
    user.progress={...user.progress,earnedXP:(user.progress?.earnedXP||0)+xp,recoveredXP:(user.progress?.recoveredXP||0)+xp};
    // No invented play session, retroactive timestamps, wealth or trade records.
    user.updatedAt=at;
    user.recoveries={...user.recoveries,[recovery.id]:{estimated:true,appliedAt:at,startAt:recovery.startAt,endAt:recovery.endAt,xp,kills,skills,bosses}};
    summary.players++;summary.xp+=xp;summary.kills+=kills;summary.levels+=user.totalLevel-original.totalLevel;
    backups.push(original);
    return normalizeUser(user);
  });
  return {users:updated,backups,summary};
}
export async function recoverProgress(env,{dryRun=true}={}) {
  const completed=await readJSON(env,RECOVERY_KEY);
  if(completed)return {...completed,dryRun,alreadyApplied:true};
  const users=await allUsers(env);
  const {users:updated,backups,summary}=applyRecoveryToUsers(users);
  if(dryRun)return {...summary,dryRun:true};
  if(!backups.length)throw new HttpError(409,'No eligible uncompensated accounts match this fixed recovery plan.');
  const prefix=`backup:progress-recovery:${RECOVERY_ID}`;
  for(let i=0;i<backups.length;i+=125)await writeJSON(env,`${prefix}:players:${i/125}`,backups.slice(i,i+125));
  for(const key of ['snapshot:current','history:meta']) {
    const value=await readJSON(env,key);if(value)await writeJSON(env,`${prefix}:${key}`,value);
  }
  const snapshot=await publishSnapshot(env,updated);
  const record={...summary,appliedAt:Date.now(),generation:snapshot.generation,backupShards:Math.ceil(backups.length/125)};
  await writeJSON(env,RECOVERY_KEY,record);
  return {...record,dryRun:false};
}
