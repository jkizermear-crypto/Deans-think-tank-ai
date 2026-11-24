import {getDatabase} from '@netlify/database';
import {getStore} from '@netlify/blobs';
import OpenAI from 'openai';
import {ownerUser,sameOrigin} from '../../lib/auth.mjs';
import {aiConfiguration} from '../../lib/ai-config.mjs';
import {runDiscussion,responseSchema} from '../../lib/autonomous-room.mjs';
export default async(req,context)=>{
 // A background invocation returns 202 before work starts. State in the database,
 // rather than that response, is the authoritative indication of actual progress.
 if(!await ownerUser(context)||!sameOrigin(req))return;
 const body=await req.json().catch(()=>null);if(!body||!/^[-0-9a-f]{36}$/.test(body.sessionId||''))return;
 const config=aiConfiguration();if(!config.ready)return;
 const providerVars=!!(process.env.OPENAI_BASE_URL&&process.env.OPENAI_API_KEY);
 const client=new OpenAI({timeout:90000,maxRetries:0,...(!providerVars?{apiKey:process.env.NETLIFY_AI_GATEWAY_KEY,baseURL:process.env.NETLIFY_AI_GATEWAY_URL}:{})});
 try{
  await runDiscussion({db:getDatabase(),sessionId:body.sessionId,fileStore:getStore({name:'think-tank-private-files',consistency:'strong'}),limit:config.dailyCallLimit,async provider({context,prompt}){
   const completion=await client.chat.completions.create({model:config.model,store:false,max_completion_tokens:6000,response_format:{type:'json_schema',json_schema:{name:'writers_room_turn',strict:true,schema:responseSchema}},messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({actualConversation:context.history,currentDrafts:context.artifacts,manuscriptDocuments:context.documents,instruction:'Author your next contribution, reacting to actual peers and making concrete progress. Do not wait for Dean unless a consequential missing decision prevents useful work.'})}]});
   const text=completion.choices?.[0]?.message?.content;if(!text||completion.choices[0].finish_reason!=='stop')throw new Error('Incomplete advisor response');return JSON.parse(text);
  }});
 }catch(error){
  // Do not throw: platform retries must not repeat uncertain paid model calls.
  console.error('Autonomous discussion stopped',{sessionId:body.sessionId,name:error?.name,status:error?.status,code:error?.code,message:String(error?.message||'').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,350)});
 }
};
export const config={path:'/api/discussion/run',method:'POST',background:true};
