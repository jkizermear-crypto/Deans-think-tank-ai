import { createHash, randomUUID } from 'node:crypto';
import { actionSchemas } from './agent-schemas.mjs';
import { aiConfiguration } from './ai-config.mjs';
const iso = value => value instanceof Date ? value.toISOString() : value;
export class ActionError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail = (message,status=409) => { throw new ActionError(status,message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const messageFrom = m => ({id:m.message_id,seq:Number(m.seq),speakerId:m.speaker_id,kind:m.kind,content:m.content,topicId:m.topic_id,origin:m.origin,createdAt:iso(m.created_at),...(m.session_id?{sessionId:m.session_id}:{}),...(m.imported_from?{importedFrom:m.imported_from}:{})});
const sessionFrom = s => ({...s,topicId:s.topic_id,createdAt:iso(s.created_at),expiresAt:iso(s.expires_at),updatedAt:iso(s.updated_at)});
export const PROTOCOL = `Dean’s shared writers’ room lives at https://deans-think-tank-ai.netlify.app/.
This Netlify database is the sole current transcript, controls, profiles, sessions, manuscript access and versioned drafts. The older ChatGPT-hosted room is a read-only archive and entrance to this room. ChatGPT scheduled sessions and email digests use this same record through the page’s authenticated WebMCP tools. Never create a second conversation to fill a briefing.
Use six actual separate agent sessions for Jack, Mira, Rowan, Tess, Eli and Morgan; never impersonate missing agents. Give them their saved profiles and actual text, independent first views, then real peer responses. Morgan facilitates and contributes; retain dissent. Read the current saved author-brief artifact before writing. Preserve the original manuscript. Produce an alternative rewrite chapter by chapter, with complete versioned chapter drafts and a story bible. Advance only after all six explicitly agree on the actual current version. Dean can redirect, stop or veto.
Prioritize compelling slow-burn alien science fiction. Deeper meaning should emerge through story and consequences. Distinguish confirmed author direction from suggestions and inference. Ask about consequential unknowns; do not invent missing text, author instructions, research, biographies or work.
Read room controls before generating and before each saved contribution. Pause/park cancel sessions and block late messages. Open sessions with stable run-specific keys; created=false is a replay, not an invitation to regenerate. End sessions honestly. Elapsed idle time is not active work. Scheduled checkpoints remain noon, 1 and 2 p.m. America/Chicago; the existing morning digest and special-session email report only actual persisted work. No new schedules or unsolicited outreach.
Native ChatGPT agent work uses no paid provider calls. Website automatic discussion runs through a server-side background session: Morgan selects subsequent speakers, each reads the actual saved replies, and another Morgan checkpoint starts the next useful exchange without another owner message. It stops for owner pause/park/redirect, a genuine missing owner decision, the existing daily call cap, an error or the platform working checkpoint. A native scheduled session takes priority over the paid automatic session. Website live replies use the existing Netlify Gateway and the shared daily cap, never purchases or auto-recharge. Do not call the paid generation endpoint during background sessions. A model response must not claim evidence or reviewed manuscript sections it did not inspect.
Save actual drafts, author brief, story bible, reflections and digest delivery checkpoints with version checks and idempotency. Preserve earlier versions and original authors/timestamps on imports. Private content and credentials must never enter the public source repository. Read exact manuscript text with get_attachment_text pagination until hasMore=false before claiming a full read.
Morning and special emails go only to the verified owner mailbox under the existing email protocol and schedule. Keep the existing private Page delivery checkpoint, reconcile uncertain sends and exact-subject SENT duplicates before sending, and link this Netlify room. Do not email during an afternoon session. Unrelated projects and schedules remain untouched.`;

export async function handleAction(db,action,input,{fileStore,env=process.env}={}) {
  const schema=actionSchemas[action];if(!schema)fail('Unknown action',400);
  const parsed=schema.safeParse(input||{});if(!parsed.success)fail(parsed.error.issues.map(x=>x.message).join('; '),400);
  const a=parsed.data;
  const query=(sql,args=[])=>db.pool.query(sql,args);
  if(action==='get_room_state') {
    const [c,ad,t,m,s,art,att]=await Promise.all([
      query('SELECT * FROM tank_controls WHERE id=1'),query('SELECT id,profile,version FROM tank_advisors ORDER BY id'),query('SELECT * FROM tank_topics ORDER BY id'),
      a.afterSeq===undefined ? query('SELECT * FROM (SELECT * FROM tank_messages ORDER BY seq DESC LIMIT $1) recent ORDER BY seq',[a.limit+1]) : query('SELECT * FROM tank_messages WHERE seq>$1 ORDER BY seq LIMIT $2',[a.afterSeq,a.limit+1]),
      query('SELECT * FROM tank_sessions ORDER BY created_at DESC LIMIT 20'),query('SELECT DISTINCT ON(id) id,version,title,kind,created_at FROM tank_artifacts ORDER BY id,version DESC'),query("SELECT message_id,content FROM tank_messages WHERE origin='file-extract' ORDER BY seq DESC LIMIT 50")
    ]);
    const page=a.afterSeq===undefined&&m.rows.length>a.limit?m.rows.slice(1):m.rows.slice(0,a.limit),control=c.rows[0];
    return {room:{id:'dean-think-tank',title:'Dean’s Writers’ Room',canonicalUrl:'https://deans-think-tank-ai.netlify.app/',paused:!!control?.paused,activeTopicId:control?.active_topic_id},advisors:ad.rows.map(x=>({...x.profile,id:x.id,version:x.version})),topics:t.rows,messages:page.map(messageFrom),sessions:s.rows.map(x=>sessionFrom({...x,status:['queued','running'].includes(x.status)&&new Date(x.expires_at)<=new Date()?'cancelled':x.status})),artifacts:art.rows,attachments:att.rows.flatMap(m=>{const match=m.content.match(/^\[Attached file: (.*?) \| id: ([0-9a-f-]{36})/);return match?[{messageId:m.message_id,filename:match[1],fileId:match[2]}]:[];}),pagination:{afterSeq:a.afterSeq??null,nextAfterSeq:page.length?Number(page.at(-1).seq):a.afterSeq??0,hasMore:a.afterSeq!==undefined&&m.rows.length>a.limit,earlierMessagesAvailable:a.afterSeq===undefined&&m.rows.length>a.limit},ai:aiConfiguration(env)};
  }
  if(action==='get_working_protocol') {const brief=await query("SELECT * FROM tank_artifacts WHERE kind='author-brief' ORDER BY created_at DESC,version DESC LIMIT 1");return {protocol:PROTOCOL,authorBrief:brief.rows[0]||null};}
  if(action==='get_budget_state') {const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const r=await query('SELECT calls FROM tank_daily_budget WHERE day=$1',[day]);return {day,reservedCalls:r.rows[0]?.calls||0,...aiConfiguration(env)};}
  if(action==='get_attachment_text') {
    const found=await query("SELECT content FROM tank_messages WHERE origin='file-extract' AND content LIKE $1 LIMIT 1",['%id: '+a.fileId+'%']);if(!found.rowCount)fail('Attachment not found',404);
    const text=await fileStore.get('text/'+a.fileId);if(typeof text!=='string')fail('Extracted text unavailable',404);
    const metadata=await fileStore.getMetadata('original/'+a.fileId),end=Math.min(text.length,a.offset+a.length);
    return {fileId:a.fileId,filename:metadata?.metadata?.name||'attachment',text:text.slice(a.offset,end),offset:a.offset,nextOffset:end,totalCharacters:text.length,hasMore:end<text.length};
  }
  if(action==='list_artifacts'){return {artifacts:(await query('SELECT DISTINCT ON(id) id,version,title,kind,created_at FROM tank_artifacts WHERE ($1::text IS NULL OR kind=$1) ORDER BY id,version DESC',[a.kind??null])).rows};}
  if(action==='read_artifact'){const r=await query('SELECT * FROM tank_artifacts WHERE id=$1 AND ($2::int IS NULL OR version=$2) ORDER BY version DESC LIMIT 1',[a.id,a.version??null]);if(!r.rowCount)fail('Artifact not found',404);return {artifact:r.rows[0]};}
  if(action==='get_advisor_profile_history')return {history:(await query('SELECT * FROM tank_profile_history WHERE advisor_id=$1 ORDER BY version DESC LIMIT 30',[a.advisorId])).rows};
  const client=await db.pool.connect();
  try {
    await client.query('BEGIN');
    const q=(sql,args=[])=>client.query(sql,args);
    const control=(await q('SELECT * FROM tank_controls WHERE id=1 FOR UPDATE')).rows[0];if(!control)fail('Room is not initialized',503);
    const opKey=a.idempotencyKey?`${action}:${a.idempotencyKey}`:null,requestHash=hash(a);
    if(opKey){const prior=(await q('SELECT * FROM tank_operations WHERE key=$1',[opKey])).rows[0];if(prior){if(prior.request_hash!==requestHash)fail('Idempotency key already used with different input');await q('COMMIT');return {...prior.result,replayed:true,...(action==='open_session'?{created:false}:{})};}}
    const checkActive=async(topicId,sessionId)=>{
      if(control.paused)fail('The writers’ room is paused');
      const t=(await q('SELECT status FROM tank_topics WHERE id=$1',[topicId])).rows[0];if(t?.status!=='active')fail('This topic is parked or missing');
      if(sessionId){const s=(await q('SELECT * FROM tank_sessions WHERE id=$1',[sessionId])).rows[0];if(!s||s.status!=='running'||new Date(s.expires_at)<=new Date()||s.topic_id!==topicId)fail('This session has stopped or has a different topic');}
    };
    let result;
    if(action==='append_messages'||action==='import_history') {
      if(action==='import_history')for(const t of a.topics)await q('INSERT INTO tank_topics(id,title,status) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[t.id,t.title,t.status]);
      const messages=[];let skipped=0;
      for(const m of a.messages){
        const topicId=m.topicId??control.active_topic_id;
        if(action!=='import_history'&&['advisor','supervisor'].includes(m.kind)){if(!a.sessionId)fail('Advisor contributions require an actual running session',400);await checkActive(topicId,a.sessionId);}
        if(!(await q('SELECT 1 FROM tank_topics WHERE id=$1',[topicId])).rowCount)fail('Message topic does not exist',400);
        // Historical duplicates may have been manually copied under another ID.
        const existing=await q('SELECT * FROM tank_messages WHERE message_id=$1 OR ($2::boolean AND speaker_id=$3 AND content=$4) LIMIT 1',[m.id||'',action==='import_history',m.speakerId,m.content]);
        if(existing.rowCount){if(action!=='import_history'&&existing.rows[0].content!==m.content)fail('Message ID already exists with different content');skipped++;continue;}
        const row=await q('INSERT INTO tank_messages(message_id,speaker_id,kind,content,topic_id,origin,created_at,session_id,imported_from) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8,$9) RETURNING *',[m.id||randomUUID(),m.speakerId==='user'?'you':m.speakerId,m.kind,m.content,topicId,m.origin,m.createdAt??null,a.sessionId??m.sessionId??null,action==='import_history'?a.source:null]);messages.push(messageFrom(row.rows[0]));
      }
      if(action==='import_history'&&a.archive)await q("INSERT INTO tank_artifacts(id,version,title,kind,content) VALUES('chatgpt-room-archive',1,'Earlier ChatGPT room: original history, profiles and sessions','archive',$1) ON CONFLICT(id,version) DO NOTHING",[a.archive]);
      result={messages,skipped};
    } else if(action==='open_session') {
      const topicId=a.topicId??control.active_topic_id;await checkActive(topicId);
      await q("UPDATE tank_sessions SET status='cancelled',stop_reason='native_checkpoint',summary='Continuing through a native ChatGPT working session.',updated_at=now() WHERE kind='autonomous' AND status IN ('queued','running') AND topic_id=$1",[topicId]);
      const r=await q("INSERT INTO tank_sessions(id,topic_id,status,kind,request_key) VALUES($1,$2,'running',$3,$4) RETURNING *",[randomUUID(),topicId,a.kind,opKey]);result={created:true,session:sessionFrom(r.rows[0])};
    } else if(action==='end_session') {
      const r=await q("UPDATE tank_sessions SET status=CASE WHEN expires_at<=now() THEN 'cancelled' ELSE $2 END,summary=$3,updated_at=now() WHERE id=$1 AND status='running' RETURNING *",[a.sessionId,a.status,a.summary??null]);const session=r.rows[0]||(await q('SELECT * FROM tank_sessions WHERE id=$1',[a.sessionId])).rows[0];if(!session)fail('Session not found',404);result={session:sessionFrom(session)};
    } else if(action==='set_room_control') {
      if(a.action==='park'){const topicId=a.topicId??control.active_topic_id;const r=await q("UPDATE tank_topics SET status='parked' WHERE id=$1 RETURNING id",[topicId]);if(!r.rowCount)fail('Topic not found',404);await q("UPDATE tank_sessions SET status='cancelled',updated_at=now() WHERE status IN ('queued','running') AND topic_id=$1",[topicId]);await q('UPDATE tank_controls SET active_topic_id=CASE WHEN active_topic_id=$1 THEN NULL ELSE active_topic_id END,revision=revision+1 WHERE id=1',[topicId]);}
      else {await q('UPDATE tank_controls SET paused=$1,revision=revision+1 WHERE id=1',[a.action==='pause']);if(a.action==='pause')await q("UPDATE tank_sessions SET status='cancelled',updated_at=now() WHERE status IN ('queued','running')");}
      result={controls:(await q('SELECT * FROM tank_controls WHERE id=1')).rows[0]};
    } else if(action==='upsert_topic') {
      const id=a.id||randomUUID(),status=a.status||'active';await q('INSERT INTO tank_topics(id,title,status) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status',[id,a.title,status]);
      if(status==='active')await q('UPDATE tank_controls SET active_topic_id=$1,revision=revision+1 WHERE id=1',[id]);else {await q("UPDATE tank_sessions SET status='cancelled' WHERE topic_id=$1 AND status IN ('queued','running')",[id]);await q('UPDATE tank_controls SET active_topic_id=CASE WHEN active_topic_id=$1 THEN NULL ELSE active_topic_id END,revision=revision+1 WHERE id=1',[id]);}result={topic:{id,title:a.title,status}};
    } else if(action==='save_artifact') {
      const current=(await q('SELECT version FROM tank_artifacts WHERE id=$1 ORDER BY version DESC LIMIT 1',[a.id])).rows[0]?.version||0;if(current!==a.expectedVersion)fail('Artifact changed; read the latest version before saving');
      // Delivery metadata remains writable while paused. Creative drafts honor controls.
      if(a.kind==='chapter-draft'||a.kind==='story-bible')await checkActive(control.active_topic_id);
      const r=await q('INSERT INTO tank_artifacts(id,version,title,kind,content) VALUES($1,$2,$3,$4,$5) RETURNING id,version,title,kind,created_at',[a.id,current+1,a.title,a.kind,a.content]);result={artifact:r.rows[0]};
    } else if(action==='update_advisor_profile') {
      await checkActive(control.active_topic_id);const old=(await q('SELECT * FROM tank_advisors WHERE id=$1 FOR UPDATE',[a.advisorId])).rows[0];if(!old||old.version!==a.expectedVersion)fail('Profile changed; reread current version');
      const ids=[...new Set(a.sourceMessageIds)];const found=await q('SELECT message_id FROM tank_messages WHERE message_id=ANY($1::text[])',[ids]);if(found.rowCount!==ids.length)fail('Profile evidence must reference actual saved messages',400);
      const version=old.version+1,profile={...old.profile,...a.patch,id:a.advisorId};await q('UPDATE tank_advisors SET profile=$2,version=$3 WHERE id=$1',[a.advisorId,profile,version]);await q('INSERT INTO tank_profile_history(id,advisor_id,version,profile,reason,source_message_ids) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),a.advisorId,version,profile,a.reason,JSON.stringify(ids)]);result={advisor:{...profile,version}};
    } else fail('Unsupported action',400);
    if(opKey)await q('INSERT INTO tank_operations(key,request_hash,result) VALUES($1,$2,$3)',[opKey,requestHash,result]);
    await q('COMMIT');return result;
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
