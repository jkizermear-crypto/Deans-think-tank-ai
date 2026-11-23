import test from "node:test"; import assert from "node:assert/strict";
import {canGenerate,isDiscussionWindow} from "../lib/controls.mjs";
import {buildAdvisorPrompt} from "../lib/advisors.mjs";
const state={paused:false,topicStatus:"active",authenticated:true,budgetRemaining:2,canonicalConnected:true};
test("only fully authorized sessions generate",()=>{assert.equal(canGenerate(state).ok,true);for(const key of ["paused","authenticated","canonicalConnected","budgetRemaining"]){const bad={...state,[key]:key==="paused"?true:key==="budgetRemaining"?0:false};assert.equal(canGenerate(bad).ok,false)}});
test("inactive topic blocks generation",()=>assert.equal(canGenerate({...state,topicStatus:"parked"}).ok,false));
test("Chicago noon works across daylight saving time",()=>{assert.equal(isDiscussionWindow(new Date("2026-07-01T17:30:00Z")),true);assert.equal(isDiscussionWindow(new Date("2026-12-01T18:30:00Z")),true);assert.equal(isDiscussionWindow(new Date("2026-07-01T16:30:00Z")),false)});
test("advisor prompts reject unknown ids and include history",()=>{assert.throws(()=>buildAdvisorPrompt({advisor:{id:"unknown"}}));const s=buildAdvisorPrompt({advisor:{id:"mira",name:"Mira",role:"Advisor",perspective:"Question assumptions",style:"Direct"},history:[{speakerId:"you",content:"Hello"}]});assert.match(s,/Hello/);assert.match(s,/Mira/)});
