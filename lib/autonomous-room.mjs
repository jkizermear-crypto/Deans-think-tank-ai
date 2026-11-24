import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ADVISOR_IDS,buildAdvisorPrompt} from './advisors.mjs';
import {ActionError} from './agent-actions.mjs';
export const startSchema=z.object({requestKey:z.string().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/),advisorId:z.enum(ADVISOR_IDS).default('morgan'),triggerSeq:z.number().int().min(0).optional()}).strict();
export const turnSchema=z.object({
 message:z.string().trim().min(1).max(30000),
 nextSpeakers:z.array(z.enum(ADVISOR_IDS)).max(5),
 needsOwner:z.boolean(),
 artifact:z.object({id:z.string().min(1).max(120).regex(/^[a-zA-Z0-9._:-]+$/),title:z.string().min(1).max(200),kind:z.enum(['chapter-draft','story-bible']),content:z.string().min(1).max(90000),expectedVersion:z.number().int().min(0)}).strict().nullable()
}).strict();
export const responseSchema={type:'object',additionalProperties:false,required:['message','nextSpeakers','needsOwner','artifact'],properties:{
 message:{type:'string'},nextSpeakers:{type:'array',items:{type:'string',enum:[...ADVISOR_IDS]}},needsOwner:{type:'boolean'},artifact:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['id','title','kind','content','expectedVersion'],properties:{id:{type:'string'},title:{type:'string'},kind:{type:'string',enum:['chapter-draft','story-bible']},content:{type:'string'},expectedVersion:{type:'integer'}}}]}
}};
const stopMessages={budget:'Daily AI call limit reached. Saved discussion is preserved.',owner_input_needed:'Morgan identified a specific decision that needs Dean’s input.',checkpoint:'This background working checkpoint ended. Saved work is ready to continue.',paused:'The room was paused or redirected.',failed:'The discussion stopped after an error. Saved contributions remain available.'};
async function transaction(db,fn){const c=await db.pool.connect();try{await c.query('BEGIN');const control=(await c.query('SELECT * FROM tank_controls WHERE id=1 FOR UPDATE')).rows[0];if(!control)throw new ActionError(503,'Room unavailable');const result=await fn(c,control);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
function usable(control,session){return !control.paused&&control.active_topic_id===session.topic_id&&new Date(session.expires_at)>new Date();}
export async function startDiscussion(db,input){
 const a=startSchema.parse(input);
 return transaction(db,async(c,control)=>{
  if(control.paused)throw new ActionError(409,'The writers’ room is paused.');
  const topic=(await c.query('SELECT status FROM tank_topics WHERE id=$1',[control.active_topic_id])).rows[0];if(topic?.status!=='active')throw new ActionError(409,'Select an active topic.');
  await c.query("UPDATE tank_sessions SET status='cancelled',stop_reason='checkpoint',updated_at=now() WHERE kind='autonomous' AND status IN ('queued','running') AND expires_at<=now()");
  const prior=(await c.query('SELECT * FROM tank_sessions WHERE request_key=$1',['autonomous:'+a.requestKey])).rows[0];if(prior)return {session:prior,created:false};
  const running=(await c.query("SELECT * FROM tank_sessions WHERE topic_id=$1 AND status IN ('queued','running') AND expires_at>now() ORDER BY created_at DESC LIMIT 1",[control.active_topic_id])).rows[0];if(running)return {session:running,created:false,nativeSession:running.kind!=='autonomous'};
  const r=await c.query("INSERT INTO tank_sessions(id,topic_id,status,kind,request_key,expires_at,current_advisor_id,trigger_seq) VALUES($1,$2,'queued','autonomous',$3,now()+interval '14 minutes',$4,$5) RETURNING *",[randomUUID(),control.active_topic_id,'autonomous:'+a.requestKey,a.advisorId,a.triggerSeq??null]);return {session:r.rows[0],created:true};
 });
}
export async function claimDiscussion(db,id,token){return transaction(db,async(c,control)=>{
 const session=(await c.query("SELECT * FROM tank_sessions WHERE id=$1 AND kind='autonomous' FOR UPDATE",[id])).rows[0];if(!session||session.status!=='queued')return null;
 if(!usable(control,session)){await c.query("UPDATE tank_sessions SET status='cancelled',stop_reason='paused' WHERE id=$1",[id]);return null;}
 const r=await c.query("UPDATE tank_sessions SET status='running',runner_token=$2,updated_at=now() WHERE id=$1 AND status='queued' RETURNING *",[id,token]);return r.rows[0]||null;
});}
async function finish(db,id,token,reason){return transaction(db,async(c)=>{await c.query("UPDATE tank_sessions SET status=$3,stop_reason=$4,summary=$5,updated_at=now() WHERE id=$1 AND runner_token=$2 AND status='running'",[id,token,reason==='failed'?'failed':'completed',reason,stopMessages[reason]]);});}
function chicagoDay(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=k=>p.find(x=>x.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;}
async function reserve(db,id,token,limit){return transaction(db,async(c,control)=>{
 const session=(await c.query('SELECT * FROM tank_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!session||session.status!=='running'||session.runner_token!==token||!usable(control,session))return null;
 const topic=(await c.query('SELECT status FROM tank_topics WHERE id=$1',[session.topic_id])).rows[0];if(topic?.status!=='active')return null;
 const day=chicagoDay();await c.query('INSERT INTO tank_daily_budget(day,calls,max_calls) VALUES($1,0,$2) ON CONFLICT(day) DO NOTHING',[day,limit]);
 const used=(await c.query('SELECT calls FROM tank_daily_budget WHERE day=$1 FOR UPDATE',[day])).rows[0].calls;
 if(used>=limit){await c.query("UPDATE tank_sessions SET status='completed',stop_reason='budget',summary=$2,updated_at=now() WHERE id=$1",[id,stopMessages.budget]);return null;}
 const callId=randomUUID();await c.query("INSERT INTO tank_inference_calls(id,session_id,turn_index,advisor_id,status) VALUES($1,$2,$3,$4,'reserved')",[callId,id,session.turn_count,session.current_advisor_id]);
 await c.query('UPDATE tank_daily_budget SET calls=calls+1,max_calls=$2 WHERE day=$1',[day,limit]);await c.query('UPDATE tank_sessions SET updated_at=now() WHERE id=$1',[id]);return {session,callId};
});}
async function loadContext(db,session,fileStore,cache){
 const q=(s,p=[])=>db.pool.query(s,p);
 const [a,h,brief,art,files]=await Promise.all([
  q('SELECT profile FROM tank_advisors WHERE id=$1',[session.current_advisor_id]),q('SELECT speaker_id AS "speakerId",content,seq FROM tank_messages WHERE topic_id=$1 ORDER BY seq DESC LIMIT 40',[session.topic_id]),
  q("SELECT content FROM tank_artifacts WHERE kind='author-brief' ORDER BY created_at DESC LIMIT 1"),q("SELECT DISTINCT ON(id) id,version,title,kind,content FROM tank_artifacts WHERE kind IN ('chapter-draft','story-bible') ORDER BY id,version DESC LIMIT 5"),
  q("SELECT content FROM tank_messages WHERE origin='file-extract' ORDER BY seq DESC LIMIT 2")
 ]);
 const documents=[];let remaining=400000;
 for(const f of files.rows){const id=f.content.match(/id: ([0-9a-f-]{36})/)?.[1];if(!id)continue;if(!cache.has(id))cache.set(id,await fileStore.get('text/'+id));const full=cache.get(id);if(typeof full!=='string')continue;const text=full.slice(0,remaining);remaining-=text.length;documents.push({fileId:id,totalCharacters:full.length,suppliedCharacters:text.length,complete:text.length===full.length,text});}
 if(!a.rows[0])throw new Error('Advisor profile unavailable');
 return {advisor:a.rows[0].profile,history:h.rows.reverse(),authorBrief:brief.rows[0]?.content||'',artifacts:art.rows,documents};
}
export function autonomousPrompt(context,session){return buildAdvisorPrompt({advisor:context.advisor,history:context.history,topic:session.topic_id})+`\n\nThis is an active autonomous writers’ room. Dean has already authorized the work; do not wait for another owner message to make progress. Read the actual peer messages supplied, respond to their specific reasoning, revise an idea, contribute scene prose, or improve the current draft. Never script or impersonate other participants. Each separate call authors only this participant’s actual turn. Do not repeat setup introductions or ask permission for already authorized work.\nMorgan facilitates and chooses the next 1–5 participants using nextSpeakers. Peers read Morgan and each actual prior peer message and contribute; after that queue Morgan reviews and assigns the next useful exchange. There is no single-round cutoff. Peers should return nextSpeakers=[]. Morgan should return a new queue unless a consequential missing owner decision truly prevents further useful work; only then set needsOwner=true and state the exact question. Do not stop merely to ask whether to continue.\nUse the confirmed author brief as creative direction. The manuscript documents indicate whether their entire text was supplied; never claim a full read of incomplete material. Existing saved artifacts are real current versions. Develop an alternative rewrite chapter by chapter, preserving the original and general story arc, science fiction first with an underlying allegory. Produce actual prose when the discussion has enough direction. Put a complete proposed chapter or story-bible revision in artifact, with an honest expectedVersion from the supplied record (0 for a new item), not in fabricated peer messages. Do not overwrite the author brief or archive. Do not advance chapters or claim consensus unless all six actual saved contributions approve the same complete draft version. Do not invent external research, tests, actions or author instructions.\nReturn only JSON matching the required schema. message is your actual conversational contribution. artifact is null unless this turn authors a complete draft or story-bible version. needsOwner should normally be false.\nConfirmed author brief:\n${context.authorBrief}`;}
async function saveTurn(db,id,token,reservation,turn){return transaction(db,async(c,control)=>{
 const s=(await c.query('SELECT * FROM tank_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!s||s.status!=='running'||s.runner_token!==token||!usable(control,s)){await c.query("UPDATE tank_inference_calls SET status='cancelled' WHERE id=$1",[reservation.callId]);return false;}
 const topic=(await c.query('SELECT status FROM tank_topics WHERE id=$1',[s.topic_id])).rows[0];if(topic?.status!=='active')return false;
 if(turn.artifact){const a=turn.artifact,old=(await c.query('SELECT version,kind FROM tank_artifacts WHERE id=$1 ORDER BY version DESC LIMIT 1',[a.id])).rows[0];if((old?.version||0)!==a.expectedVersion||(old&&!['chapter-draft','story-bible'].includes(old.kind)))throw new ActionError(409,'The saved draft changed during this turn. Reread it before revising.');await c.query('INSERT INTO tank_artifacts(id,version,title,kind,content) VALUES($1,$2,$3,$4,$5)',[a.id,a.expectedVersion+1,a.title,a.kind,a.content]);}
 await c.query("INSERT INTO tank_messages(message_id,speaker_id,kind,content,topic_id,origin,session_id) VALUES($1,$2,$3,$4,$5,'netlify-ai',$6)",[id+':turn:'+s.turn_count,s.current_advisor_id,s.current_advisor_id==='morgan'?'supervisor':'advisor',turn.message,s.topic_id,id]);
 let queue=Array.isArray(s.handoff_queue)?[...s.handoff_queue]:[];
 if(s.current_advisor_id==='morgan')queue=[...new Set(turn.nextSpeakers.filter(x=>x!=='morgan'))];
 const waiting=s.current_advisor_id==='morgan'&&turn.needsOwner;
 if(!waiting&&queue.length===0&&s.current_advisor_id==='morgan')queue=['jack','mira','rowan','tess','eli'];
 const next=queue.shift()||'morgan';
 await c.query('UPDATE tank_sessions SET turn_count=turn_count+1,current_advisor_id=$3,handoff_queue=$4,status=$5,stop_reason=$6,summary=$7,updated_at=now() WHERE id=$1 AND runner_token=$2',[id,token,next,JSON.stringify(queue),waiting?'completed':'running',waiting?'owner_input_needed':null,waiting?stopMessages.owner_input_needed:null]);
 await c.query("UPDATE tank_inference_calls SET status='completed' WHERE id=$1",[reservation.callId]);return true;
});}
export async function runDiscussion({db,sessionId,fileStore,provider,limit=30,timeLimitMs=13*60*1000,now=()=>Date.now()}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>30)throw new Error('Invalid daily call limit');
 const token=randomUUID(),claimed=await claimDiscussion(db,sessionId,token);if(!claimed)return {claimed:false};
 const deadline=now()+timeLimitMs,cache=new Map();let reservation;
 try{
  while(now()<deadline){
   const s=(await db.pool.query('SELECT * FROM tank_sessions WHERE id=$1',[sessionId])).rows[0];if(!s||s.status!=='running')break;
   const context=await loadContext(db,s,fileStore,cache);
   reservation=await reserve(db,sessionId,token,limit);if(!reservation)break;
   const turn=turnSchema.parse(await provider({context,session:reservation.session,prompt:autonomousPrompt(context,reservation.session)}));
   if(!await saveTurn(db,sessionId,token,reservation,turn))break;
   reservation=null;
  }
  await finish(db,sessionId,token,'checkpoint');
 }catch(error){if(reservation)await db.pool.query("UPDATE tank_inference_calls SET status='failed' WHERE id=$1 AND status='reserved'",[reservation.callId]).catch(()=>{});await finish(db,sessionId,token,'failed');throw error;}
 return {claimed:true};
}
