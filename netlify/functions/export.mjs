import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { ownerUser } from '../../lib/auth.mjs';
import { handleAction } from '../../lib/agent-actions.mjs';
export default async(req,context)=>{
 if(!await ownerUser(context))return Response.json({error:'Owner login required'},{status:401});
 try{const db=getDatabase(),state=await handleAction(db,'get_room_state',{afterSeq:0,limit:500}),messages=[...state.messages];let page=state;
 while(page.pagination.hasMore){page=await handleAction(db,'get_room_state',{afterSeq:page.pagination.nextAfterSeq,limit:500});messages.push(...page.messages);}
 const store=getStore({name:'think-tank-private-files',consistency:'strong'}),documents=[];
 const ids=[...new Set(messages.filter(m=>m.origin==='file-extract').map(m=>m.content.match(/id: ([0-9a-f-]{36})/)?.[1]).filter(Boolean))];
 for(const fileId of ids){const text=await store.get('text/'+fileId),meta=await store.getMetadata('original/'+fileId);documents.push({fileId,filename:meta?.metadata?.name||'attachment',text:text??null,totalCharacters:text?.length??0});}
 const artifacts=[];for(const a of state.artifacts){const d=await handleAction(db,'read_artifact',{id:a.id});artifacts.push(d.artifact);}
 return new Response(JSON.stringify({...state,messages,artifacts,documents,pagination:{afterSeq:0,nextAfterSeq:messages.at(-1)?.seq||0,hasMore:false},workingProtocol:await handleAction(db,'get_working_protocol',{}),exportedAt:new Date().toISOString()},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="writers-room-record.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){console.error('Room export failed',{name:e?.name,code:e?.code});return Response.json({error:'Room export temporarily unavailable'},{status:503});}
};
export const config={path:'/api/export',method:'GET'};
