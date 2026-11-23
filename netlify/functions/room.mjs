import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";
const owner = "jkizermear@gmail.com";
const headers = {"Cache-Control":"no-store"};
export default async (req,context) => {
 const user = await getUser().catch(() => null);
 if (!user || user.email?.toLowerCase() !== owner) return Response.json({error:"Owner login required"},{status:401,headers});
 const db=getDatabase();
 try {
  if(req.method==="GET"){
   const [controls,advisors,topics,messages]=await Promise.all([
    db.sql`SELECT paused,active_topic_id FROM tank_controls WHERE id=1`,
    db.sql`SELECT id,profile,version FROM tank_advisors ORDER BY id`,
    db.sql`SELECT id,title,status FROM tank_topics ORDER BY id`,
    db.sql`SELECT seq,message_id,speaker_id,kind,content,topic_id,origin,created_at FROM tank_messages ORDER BY seq DESC LIMIT 150`
   ]);
   return Response.json({controls:controls[0],advisors,topics,messages:messages.reverse()},{headers});
  }
  if(req.method!=="POST") return Response.json({error:"Method not allowed"},{status:405,headers});
  const body=await req.json().catch(()=>null);
  if(!body || typeof body!=="object") return Response.json({error:"Invalid JSON"},{status:400,headers});
  if(body.action==="message"){
   const content=typeof body.content==="string"?body.content.trim():"";
   if(!content || content.length>10000) return Response.json({error:"Message must be 1–10000 characters"},{status:400,headers});
   const id=crypto.randomUUID();
   const rows=await db.sql`INSERT INTO tank_messages(message_id,speaker_id,kind,content,topic_id,origin) SELECT ${id},'you','user',${content},active_topic_id,'live' FROM tank_controls WHERE id=1 RETURNING seq,message_id`;
   return Response.json({saved:true,message:rows[0]},{status:201,headers});
  }
  if(body.action==="pause"){
   if(typeof body.paused!=="boolean") return Response.json({error:"Boolean required"},{status:400,headers});
   const rows=await db.sql`UPDATE tank_controls SET paused=${body.paused} WHERE id=1 RETURNING paused`;
   return Response.json({controls:rows[0]},{headers});
  }
  return Response.json({error:"Unsupported action"},{status:400,headers});
 } catch(e){console.error("room error",e);return Response.json({error:"Room temporarily unavailable"},{status:503,headers})}
};
export const config={path:"/api/room",method:["GET","POST"]};
