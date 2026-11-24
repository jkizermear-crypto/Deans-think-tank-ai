import { getDatabase } from '@netlify/database';
import { ownerUser, sameOrigin } from '../../lib/auth.mjs';
import { handleAction, ActionError } from '../../lib/agent-actions.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async(req,context)=>{
 const user=await ownerUser(context);if(!user)return json({error:'Owner login required'},401);
 try {
  const db=getDatabase();
  if(req.method==='GET'){
   const d=await handleAction(db,'get_room_state',{limit:150});
   return json({...d,ownerEmail:user.email,privateProjectLogin:!!context?.user,controls:{paused:d.room.paused,active_topic_id:d.room.activeTopicId},advisors:d.advisors.map(a=>({id:a.id,profile:a,version:a.version})),messages:d.messages.map(m=>({...m,message_id:m.id,speaker_id:m.speakerId,topic_id:m.topicId,created_at:m.createdAt}))});
  }
  if(!sameOrigin(req))return json({error:'Use this private room’s own page'},403);
  const body=await req.json().catch(()=>null);if(!body)return json({error:'Invalid JSON'},400);
  if(body.action==='pause'&&typeof body.paused==='boolean')return json(await handleAction(db,'set_room_control',{action:body.paused?'pause':'resume'}));
  if(body.action==='message')return json(await handleAction(db,'append_messages',{messages:[{speakerId:'you',kind:'user',content:body.content,origin:'live'}],idempotencyKey:body.idempotencyKey||crypto.randomUUID()}),201);
  return json({error:'Unsupported action'},400);
 }catch(error){if(error instanceof ActionError)return json({error:error.message},error.status);console.error('Room unavailable',{name:error?.name,code:error?.code});return json({error:'Room temporarily unavailable'},503);}
};
export const config={path:'/api/room',method:['GET','POST']};
