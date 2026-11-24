import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { handleAction,ActionError } from '../lib/agent-actions.mjs';
import { actionSchemas,webToolDefinitions } from '../lib/agent-schemas.mjs';
import { aiConfiguration } from '../lib/ai-config.mjs';
import { ownerUser,sameOrigin } from '../lib/auth.mjs';
async function harness(t){
 const pg=new PGlite();t.after(()=>pg.close());
 for(const name of readdirSync(new URL('../netlify/database/migrations/',import.meta.url)).sort())await pg.exec(readFileSync(new URL('../netlify/database/migrations/'+name,import.meta.url),'utf8'));
 const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const db={pool:{query,connect:async()=>({query,release(){}})}};
 return {pg,call:(name,args={},deps={})=>handleAction(db,name,args,deps)};
}
test('private project login identifies owner without a second Identity login',async()=>{
 assert.equal((await ownerUser({user:{email:'jkizermear@gmail.com',id:'verified-netlify-user'}})).id,'verified-netlify-user');
 assert.equal(await ownerUser({user:{email:'other@example.com'}}),null);
 assert.equal(sameOrigin(new Request('https://room.example/api/agents',{headers:{origin:'https://room.example'}})),true);
 assert.equal(sameOrigin(new Request('https://room.example/api/agents',{headers:{origin:'https://elsewhere.example'}})),false);
 assert.equal(aiConfiguration({}).ready,false);
 assert.equal(aiConfiguration({OPENAI_BASE_URL:'https://example.test',OPENAI_API_KEY:'test',TANK_DAILY_CALL_LIMIT:'31'}).ready,false);
 assert.equal(aiConfiguration({OPENAI_BASE_URL:'https://example.test',OPENAI_API_KEY:'test',TANK_DAILY_CALL_LIMIT:'30'}).ready,true);
 assert.equal(webToolDefinitions.length,Object.keys(actionSchemas).length);
});
test('background contribution is visible in canonical state, idempotent and stopped by pause',async t=>{
 const h=await harness(t);
 const opened=await h.call('open_session',{kind:'afternoon',idempotencyKey:'real-run-0001'});
 const args={messages:[{id:'real-agent-message',speakerId:'jack',kind:'advisor',content:'An actual completed contribution.'}],sessionId:opened.session.id,idempotencyKey:'real-append-0001'};
 const saved=await h.call('append_messages',args);assert.equal(saved.messages.length,1);
 assert.equal((await h.call('append_messages',args)).replayed,true);
 assert.equal((await h.call('open_session',{kind:'afternoon',idempotencyKey:'real-run-0001'})).created,false);
 await assert.rejects(h.call('append_messages',{...args,messages:[{...args.messages[0],content:'Different input.'}]}),e=>e.status===409);
 const state=await h.call('get_room_state');assert.equal(state.messages.at(-1).id,'real-agent-message');
 await h.call('set_room_control',{action:'pause'});
 await assert.rejects(h.call('append_messages',{...args,messages:[{...args.messages[0],id:'late-message'}],idempotencyKey:'late-append-0001'}),e=>e.status===409);
 assert.equal((await h.call('end_session',{sessionId:opened.session.id,status:'completed'})).session.status,'cancelled');
 await h.call('append_messages',{messages:[{speakerId:'you',kind:'user',content:'Owner can speak while paused.'}],idempotencyKey:'owner-paused-0001'});
});
test('historical import preserves provenance and time, deduplicates, and paginates',async t=>{
 const h=await harness(t),createdAt='2026-11-22T23:11:24.238Z';
 const input={source:'chatgpt-archive',messages:[{id:'historical-1',speakerId:'morgan',kind:'supervisor',content:'Actual archived output.',createdAt}],topics:[],idempotencyKey:'import-archive-0001'};
 await h.call('import_history',input);await h.call('import_history',{...input,messages:[{...input.messages[0],id:'copied-under-new-id'}],idempotencyKey:'import-archive-0002'});
 const state=await h.call('get_room_state',{afterSeq:0,limit:1});assert.equal(state.messages.length,1);assert.equal(state.messages[0].createdAt,createdAt);assert.equal(state.messages[0].importedFrom,'chatgpt-archive');
 assert.equal((await h.pg.query('SELECT count(*)::int AS n FROM tank_messages')).rows[0].n,1);
 await assert.rejects(h.call('append_messages',{messages:[{speakerId:'jack',kind:'user',content:'Fake attribution'}],idempotencyKey:'invalid-author-0001'}),e=>e instanceof ActionError&&e.status===400);
});
test('draft versions and profile evidence survive, stale updates fail',async t=>{
 const h=await harness(t),draft={id:'chapter-1',title:'Chapter 1',kind:'chapter-draft',content:'Actual draft prose.',expectedVersion:0,idempotencyKey:'draft-v1-0001'};
 await h.call('save_artifact',draft);await h.call('save_artifact',{...draft,content:'Revised actual prose.',expectedVersion:1,idempotencyKey:'draft-v2-0001'});
 assert.equal((await h.call('read_artifact',{id:'chapter-1',version:1})).artifact.content,'Actual draft prose.');
 await assert.rejects(h.call('save_artifact',{...draft,idempotencyKey:'stale-draft-0001'}),e=>e.status===409);
 await h.call('append_messages',{messages:[{id:'owner-evidence',speakerId:'you',kind:'user',content:'Keep the mystery gradual.'}],idempotencyKey:'evidence-owner-0001'});
 const p={advisorId:'jack',expectedVersion:1,patch:{currentViews:['Keep the mystery gradual.']},reason:'The owner explicitly requested this in the cited message.',sourceMessageIds:['owner-evidence']};
 await h.call('update_advisor_profile',p);await assert.rejects(h.call('update_advisor_profile',p),e=>e.status===409);
 assert.equal((await h.call('get_advisor_profile_history',{advisorId:'jack'})).history.length,2);
});
test('manuscript pagination reads exact complete stored text without clipping',async t=>{
 const h=await harness(t),fileId='353b3d37-45c9-4ac7-bdcc-533065eeccea',text='a'.repeat(75000)+'END';
 await h.call('append_messages',{messages:[{speakerId:'you',kind:'user',origin:'file-extract',content:`[Attached file: novel.docx | id: ${fileId} | 75003 extracted characters]`}],idempotencyKey:'attachment-owner-0001'});
 const deps={fileStore:{get:async()=>text,getMetadata:async()=>({metadata:{name:'novel.docx'}})}};
 const first=await h.call('get_attachment_text',{fileId,offset:0,length:50000},deps),second=await h.call('get_attachment_text',{fileId,offset:first.nextOffset,length:50000},deps);
 assert.equal(first.hasMore,true);assert.equal(second.hasMore,false);assert.equal(first.text+second.text,text);
});
