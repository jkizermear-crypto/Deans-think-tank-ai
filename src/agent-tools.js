import { webToolDefinitions } from '../lib/agent-schemas.mjs';
const registry=document.modelContext || navigator.modelContext;
if(registry?.registerTool)for(const tool of webToolDefinitions){
  try{Promise.resolve(registry.registerTool({...tool,async execute(input){
    const response=await fetch('/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:tool.name,arguments:input})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Room action failed');
    window.dispatchEvent(new Event('tank-room-updated'));return data;
  }})).catch(error=>console.warn('Room tool registration failed',tool.name,error));}catch(error){console.warn('Room tool registration failed',tool.name,error);}
}

const historyInput=document.getElementById('history-import');
historyInput?.addEventListener('change',async()=>{
 const status=document.getElementById('history-status'),file=historyInput.files?.[0];if(!file)return;
 try{
  if(file.size>1500000)throw Error('History file is too large');
  const payload=JSON.parse(await file.text());
  const response=await fetch('/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'import_history',arguments:payload})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Import failed');
  status.textContent='Imported '+result.messages.length+' earlier messages; '+result.skipped+' duplicates preserved once.';
  historyInput.value='';window.dispatchEvent(new Event('tank-room-updated'));
 }catch(error){status.textContent='History import: '+error.message;}
});
