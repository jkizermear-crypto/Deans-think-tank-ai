import {getUser} from "@netlify/identity";
import {getDatabase} from "@netlify/database";
import mammoth from "mammoth";
import {getStore} from "@netlify/blobs";
import pdf from "pdf-parse";
const MAX_BYTES=15*1024*1024;
const json=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export default async(req)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const user=await getUser().catch(()=>null);
 if(user?.email?.toLowerCase()!=="jkizermear@gmail.com")return json({error:"Owner login required"},401);
 const form=await req.formData().catch(()=>null),file=form?.get("file");
 const note=typeof form?.get("message")==="string"?form.get("message").trim():"";
 if(note.length>10000)return json({error:"Message must be 10,000 characters or fewer"},400);
 if(!(file instanceof File))return json({error:"Choose a file"},400);
 if(file.size>MAX_BYTES||file.size<1)return json({error:"File must be between 1 byte and 15 MB"},413);
 const name=file.name.replace(/[\r\n<>]/g," ").slice(0,120),ext=name.split(".").pop()?.toLowerCase();
 if(!["pdf","docx","txt","md","csv","json"].includes(ext))return json({error:"Supported: PDF, DOCX, TXT, MD, CSV, JSON"},415);
 let content;
 try{
  const bytes=Buffer.from(await file.arrayBuffer());
  if(ext==="pdf")content=(await pdf(bytes)).text;
  else if(ext==="docx")content=(await mammoth.extractRawText({buffer:bytes})).value;
  else content=bytes.toString("utf8");
 }catch(e){console.error("File extraction failed",e);return json({error:"Could not extract text from this file. Scanned PDFs and images are not yet supported."},422)}
 content=content.replace(/\u0000/g,"").trim();
 if(!content)return json({error:"No readable text found in the file"},422);
 const fileId=crypto.randomUUID();
 const store=getStore({name:"think-tank-private-files",consistency:"strong"});
 try{await store.set("original/"+fileId, file,{metadata:{name,kind:ext}});await store.set("text/"+fileId,content)}catch(e){console.error("Blob storage failed",e);return json({error:"Could not store the original file"},503)}
 const message="[Attached file: "+name+" | id: "+fileId+" | "+content.length+" extracted characters]"+(note?"\n"+note:"");
 const db=getDatabase();
 try{
  const result=await db.pool.query("INSERT INTO tank_messages(message_id,speaker_id,kind,content,topic_id,origin) SELECT $1,'you','user',$2,active_topic_id,'file-extract' FROM tank_controls WHERE id=1 RETURNING seq",[crypto.randomUUID(),message]);
  if(result.rowCount!==1)throw Error("No active room row found");
  return json({saved:true,seq:result.rows[0].seq,fileId,filename:name,characters:content.length,truncated:false,message:note},201);
 }catch(e){console.error("Upload persistence failed",e);return json({error:"Could not save extracted document to the room"},503)}
};
export const config={path:"/api/upload",method:"POST"};
