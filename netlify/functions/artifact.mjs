import { getDatabase } from '@netlify/database';
import { ownerUser } from '../../lib/auth.mjs';
import { handleAction,ActionError } from '../../lib/agent-actions.mjs';
export default async(request,context)=>{
 if(!await ownerUser(context))return Response.json({error:'Owner login required'},{status:401});
 try{const url=new URL(request.url),id=url.searchParams.get('id'),version=Number(url.searchParams.get('version'))||undefined;
 const {artifact}=await handleAction(getDatabase(),'read_artifact',{id,version});
 return new Response(artifact.content,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return Response.json({error:error instanceof ActionError?error.message:'Saved writing unavailable'},{status:error instanceof ActionError?error.status:503});}
};
export const config={path:'/api/artifact',method:'GET'};
