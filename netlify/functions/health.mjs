import { ownerUser } from '../../lib/auth.mjs';
import { aiConfiguration } from '../../lib/ai-config.mjs';
export default async(req,context)=>{
 if(!await ownerUser(context))return Response.json({error:'Owner login required'},{status:401});
 return Response.json({service:'deans-think-tank-ai',status:'connected',canonical:true,...aiConfiguration()},{headers:{'Cache-Control':'no-store'}});
};
export const config={path:'/api/health',method:'GET'};
