import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { ownerUser, sameOrigin } from '../../lib/auth.mjs';
import { handleAction, ActionError } from '../../lib/agent-actions.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async(request,context)=>{
  if(!await ownerUser(context))return json({error:'Owner login required'},401);
  if(!sameOrigin(request))return json({error:'Use this private room’s own authenticated page'},403);
  const raw=await request.text();if(raw.length>1500000)return json({error:'Request too large'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
  try{return json(await handleAction(getDatabase(),body.action,body.arguments,{fileStore:getStore({name:'think-tank-private-files',consistency:'strong'})}));}
  catch(error){if(error instanceof ActionError)return json({error:error.message},error.status);console.error('Room action failed',{action:body.action,name:error?.name,code:error?.code});return json({error:'The writers’ room could not finish this action. Reread state before retrying.'},503);}
};
export const config={path:'/api/agents',method:'POST'};
