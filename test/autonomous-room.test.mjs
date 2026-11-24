import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {handleAction} from '../lib/agent-actions.mjs';
import {startDiscussion,runDiscussion} from '../lib/autonomous-room.mjs';
async function harness(t){const pg=new PGlite();t.after(()=>pg.close());for(const n of readdirSync(new URL('../netlify/database/migrations/',import.meta.url)).sort())await pg.exec(readFileSync(new URL('../netlify/database/migrations/'+n,import.meta.url),'utf8'));const query=async(s,p=[])=>{const r=await pg.query(s,p);return {...r,rowCount:r.rows.length||r.affectedRows||0};};const db={pool:{query,connect:async()=>({query,release(){}})}};return {db,query,call:(name,a)=>handleAction(db,name,a)};}
const text=(message,nextSpeakers=[],needsOwner=false,artifact=null)=>({message,nextSpeakers,needsOwner,artifact});
const fileStore={get:async()=>null};
test('Morgan hands off automatically; actual peers see earlier replies and saved draft versions without owner input',async t=>{
 const h=await harness(t);await h.call('append_messages',{messages:[{speakerId:'you',kind:'user',content:'Develop the opening scene.'}],idempotencyKey:'owner-start-0001'});
 const started=await startDiscussion(h.db,{requestKey:'discussion-start-0001'});assert.equal(started.session.status,'queued');
 const observed=[];
 await runDiscussion({db:h.db,sessionId:started.session.id,fileStore,async provider({context,session}){
  observed.push({id:session.current_advisor_id,history:context.history.map(m=>m.content),artifacts:context.artifacts});
  if(observed.length===1)return text('Jack, develop the opening; Mira, challenge its assumptions.',['jack','mira']);
  if(observed.length===2)return text('Here is my actual proposed opening.',[],false,{id:'chapter-1-test',title:'Chapter 1 candidate',kind:'chapter-draft',content:'Complete actual test chapter prose.',expectedVersion:0});
  if(observed.length===3)return text('Jack’s draft has a specific unresolved viewpoint choice.');
  return text('Dean, this consequential choice is unresolved: which narrator owns the chapter?',[],true);
 }});
 assert.deepEqual(observed.map(x=>x.id),['morgan','jack','mira','morgan']);
 assert.ok(observed[1].history.includes('Jack, develop the opening; Mira, challenge its assumptions.'));
 assert.ok(observed[2].history.includes('Here is my actual proposed opening.'));
 assert.equal(observed[2].artifacts[0].version,1);
 assert.equal(observed[2].artifacts[0].content,'Complete actual test chapter prose.');
 const s=(await h.query('SELECT * FROM tank_sessions WHERE id=$1',[started.session.id])).rows[0];assert.equal(s.stop_reason,'owner_input_needed');assert.equal(s.turn_count,4);
 assert.equal((await h.query('SELECT count(*)::int n FROM tank_inference_calls')).rows[0].n,4);
});
test('duplicate starts and background retries cannot repeat a paid turn',async t=>{
 const h=await harness(t),a={requestKey:'duplicate-start-0001'};const start=await startDiscussion(h.db,a),again=await startDiscussion(h.db,a),newRequest=await startDiscussion(h.db,{requestKey:'another-start-0001'});assert.equal(start.session.id,again.session.id);assert.equal(start.session.id,newRequest.session.id);
 let calls=0;const run=()=>runDiscussion({db:h.db,sessionId:start.session.id,fileStore,async provider(){calls++;return text('A real generated turn for this test.',[],true);}});await run();await run();assert.equal(calls,1);assert.equal((await startDiscussion(h.db,a)).created,false);
});
test('the shared daily budget stops an automatic chain before the next provider call',async t=>{
 const h=await harness(t),start=await startDiscussion(h.db,{requestKey:'budget-start-0001'});let calls=0;
 await runDiscussion({db:h.db,sessionId:start.session.id,fileStore,limit:2,async provider(){calls++;return text('Generated test reply '+calls,['jack','mira']);}});
 assert.equal(calls,2);const s=(await h.query('SELECT * FROM tank_sessions WHERE id=$1',[start.session.id])).rows[0];assert.equal(s.stop_reason,'budget');assert.equal((await h.query('SELECT calls FROM tank_daily_budget')).rows[0].calls,2);
});
test('pause cancels a queued job and blocks an in-flight late contribution',async t=>{
 const h=await harness(t),queued=await startDiscussion(h.db,{requestKey:'queued-pause-0001'});await h.call('set_room_control',{action:'pause'});await h.call('set_room_control',{action:'resume'});
 let calls=0;await runDiscussion({db:h.db,sessionId:queued.session.id,fileStore,async provider(){calls++;return text('Should never run');}});assert.equal(calls,0);
 const start=await startDiscussion(h.db,{requestKey:'inflight-pause-0001'});
 await runDiscussion({db:h.db,sessionId:start.session.id,fileStore,async provider(){calls++;await h.call('set_room_control',{action:'pause'});return text('A late reply that must not be saved');}});
 assert.equal(calls,1);assert.equal((await h.query('SELECT count(*)::int n FROM tank_messages')).rows[0].n,0);assert.equal((await h.query('SELECT calls FROM tank_daily_budget')).rows[0].calls,1);
});
test('an uncertain provider failure retains its reservation and is never automatically retried',async t=>{
 const h=await harness(t),start=await startDiscussion(h.db,{requestKey:'failed-provider-0001'});let calls=0;
 const run=()=>runDiscussion({db:h.db,sessionId:start.session.id,fileStore,async provider(){calls++;throw new Error('Uncertain upstream failure');}});
 await assert.rejects(run());await run();assert.equal(calls,1);assert.equal((await h.query('SELECT calls FROM tank_daily_budget')).rows[0].calls,1);assert.equal((await h.query('SELECT status FROM tank_inference_calls')).rows[0].status,'failed');
});
test('native scheduled work takes over from paid automatic work while preserving the transcript',async t=>{
 const h=await harness(t),start=await startDiscussion(h.db,{requestKey:'native-takeover-0001'});await h.call('open_session',{kind:'afternoon',idempotencyKey:'native-checkpoint-0001'});
 let calls=0;await runDiscussion({db:h.db,sessionId:start.session.id,fileStore,async provider(){calls++;return text('Should not run');}});assert.equal(calls,0);
 const s=(await h.query('SELECT * FROM tank_sessions WHERE id=$1',[start.session.id])).rows[0];assert.equal(s.stop_reason,'native_checkpoint');
});
