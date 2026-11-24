import {getDatabase} from '@netlify/database';
import {ownerUser,sameOrigin} from '../../lib/auth.mjs';
import {aiConfiguration} from '../../lib/ai-config.mjs';
import {handleAction,ActionError} from '../../lib/agent-actions.mjs';
import {startDiscussion} from '../../lib/autonomous-room.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async(req,context)=>{
 if(!await ownerUser(context))return json({error:'Owner login required'},401);
 if(!sameOrigin(req))return json({error:'Use this private room’s own page'},403);
 try{
  if(!aiConfiguration().ready)return json({error:'Live discussion is not connected'},503);
  const db=getDatabase(),budget=await handleAction(db,'get_budget_state',{});
  if(budget.reservedCalls>=budget.dailyCallLimit)return json({error:'Daily AI call limit reached. Saved work is preserved; scheduled native ChatGPT sessions can still work.'},429);
  const input=await req.json();const result=await startDiscussion(db,input);return json(result,result.created?201:200);
 }catch(error){if(error instanceof ActionError)return json({error:error.message},error.status);if(error?.name==='ZodError')return json({error:'Invalid discussion request'},400);console.error('Discussion start failed',{name:error?.name,code:error?.code});return json({error:'Discussion could not start. Your message remains saved.'},503);}
};
export const config={path:'/api/discussion',method:'POST'};
