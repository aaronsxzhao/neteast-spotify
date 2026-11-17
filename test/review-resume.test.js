import test from 'node:test'
import assert from 'node:assert/strict'
import {RequestSafety,safeResponseDiagnostic}from'../src/request-safety.js'
import {resumeCatalogReview}from'../src/catalog-review.js'

test('502 diagnostics retain gateway and safe request IDs without raw response data',async()=>{
 const state={spotify:{}},store={state,async update(fn){fn(state)}}
 const guard=new RequestSafety(store,{now:()=>100000,sleep:async()=>{}})
 const response=new Response('secret body refresh_token=private',{status:502,headers:{server:'envoy private-host',via:'HTTP/2 edgeproxy, 1.1 google', 'content-type':'text/html','x-request-id':'12345678-abcd-1234-abcd-123456789abc','x-spotify-trace-id':'Bearer secret','set-cookie':'token=private'}})
 await assert.rejects(guard.fetch(async()=>response,'https://accounts.spotify.com/api/token',{method:'POST',body:'private'}),{status:502})
 const d=state.spotify.lastHttpError
 assert.deepEqual(d.gateway,['envoy','edgeproxy','google']);assert.equal(d.bodyType,'html');assert.equal(d.operation,'authorization');assert.equal(d.requestIds['x-request-id'],'12345678-abcd-1234-abcd-123456789abc')
 assert.doesNotMatch(JSON.stringify(d),/secret|private|token|cookie/)
 assert.equal(guard.stats.requests,1)
 assert.equal(safeResponseDiagnostic(new Response('',{status:503,headers:{'retry-after':'60'}}),'search',100000).retryAt,160000)
})
function fixture(failure){let time=0,fail=true;const calls=[];const progress={};const client={async request(path){calls.push({path,time});if(path==='/me')return{id:'aaron'};if(path.startsWith('/playlists/'))return{id:'p'.repeat(22),owner:{id:'aaron'},items:{total:21}};if(path.endsWith('b'.repeat(22))&&fail){fail=false;throw failure}return{id:path.split('/').at(-1),name:'Song',artists:[]}}};return{client,progress,calls,get time(){return time},control:{now:()=>time,sleep:async ms=>{assert.ok(ms<=30000);time+=ms},maxWaitMs:120000},options:{accountId:'aaron',playlistId:'p'.repeat(22),jobs:['a','b'].map(x=>({type:'track',id:x.repeat(22)})),progress,save:async()=>{}}}}
test('review automatically resumes only after the saved transient deadline and keeps completed jobs',async()=>{
 const f=fixture(Object.assign(Error('private'),{pauseReason:'transient-backoff',retryAt:90000,status:502}))
 await resumeCatalogReview(f.client,f.options,f.control)
 assert.equal(f.time,90000);assert.equal(f.calls.filter(c=>c.path.endsWith('a'.repeat(22))).length,1);assert.equal(f.calls.filter(c=>c.path==='/me').length,2);assert.equal(f.progress.requestPlanComplete,true);assert.equal(f.progress.resume,undefined)
 const retries=f.calls.filter(c=>c.path.endsWith('b'.repeat(22)));assert.equal(retries[1].time,90000)
})
test('429, auth failure, run budget and deadlines beyond limit stop without requests or sleeps',async()=>{
 for(const failure of [Object.assign(Error(),{pauseReason:'provider-cooldown',status:429,retryAt:90000}),Object.assign(Error(),{status:401}),Object.assign(Error(),{pauseReason:'run-budget',retryAt:90000}),Object.assign(Error(),{pauseReason:'transient-backoff',retryAt:130000})]){
 const f=fixture(failure);await assert.rejects(resumeCatalogReview(f.client,f.options,f.control));assert.equal(f.time,0);assert.equal(f.calls.filter(c=>c.path==='/me').length,1)
 }
})
test('automatic resume has a finite attempt limit and preserves next deadline',async()=>{
 let time=0,calls=0;const progress={};const c={async request(){calls++;throw Object.assign(Error(),{pauseReason:'transient-backoff',retryAt:time+1000,status:502})}}
 await assert.rejects(resumeCatalogReview(c,{accountId:'aaron',playlistId:'p'.repeat(22),jobs:[],progress},{now:()=>time,sleep:async ms=>{time+=ms},maxResumes:2,maxWaitMs:10000}))
 assert.equal(calls,3);assert.equal(progress.blocked.retryAt,3000)
})
