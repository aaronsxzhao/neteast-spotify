import test from 'node:test'
import assert from 'node:assert/strict'
import { runCatalogReview, reviewJobKey } from '../src/catalog-review.js'
const accountId='aaron',playlistId='p'.repeat(22)
const jobs=[{type:'track',id:'a'.repeat(22)},{type:'track',id:'b'.repeat(22)}]
function client(wrong=false){const calls=[];let fail=true;return {calls,setFail(v){fail=v},async request(path){calls.push(path);if(path==='/me')return {id:wrong?'other':accountId};if(path.startsWith('/playlists/'))return {id:playlistId,owner:{id:accountId},name:'NetEase Daily',items:{total:22}};if(path.endsWith(jobs[1].id)&&fail)throw Object.assign(Error('private'),{pauseReason:'provider-cooldown',retryAt:1000,status:429});return {id:path.split('/').at(-1),name:'Song',is_playable:true,privateToken:'never save',artists:[]}}}}
test('review resumes completed jobs, verifies account each time and preserves pause',async()=>{const c=client(),progress={};let saves=0;const args={accountId,playlistId,jobs,progress,save:async()=>saves++};await assert.rejects(runCatalogReview(c,args),{status:429});assert.equal(Object.keys(progress.results).length,1);assert.equal(progress.blocked.retryAt,1000);assert.doesNotMatch(JSON.stringify(progress),/private|never save/);c.setFail(false);await runCatalogReview(c,args);assert.equal(c.calls.filter(x=>x.endsWith(jobs[0].id)).length,1);assert.equal(c.calls.filter(x=>x==='/me').length,2);assert.equal(progress.requestPlanComplete,true);assert.ok(saves>=3)})
test('wrong account and malformed destinations cannot reach catalog',async()=>{const c=client(true);await assert.rejects(runCatalogReview(c,{accountId,playlistId,jobs}),/Wrong/);assert.deepEqual(c.calls,['/me']);assert.throws(()=>reviewJobKey({type:'album',id:'https://evil.example'}));assert.throws(()=>reviewJobKey({type:'write',id:'a'.repeat(22)}))})
test('restricted album evidence is never represented as playable',async()=>{
 const progress={};const c=client();c.setFail(false);const original=c.request.bind(c)
 c.request=async path=>path.startsWith('/albums/')?{id:'a'.repeat(22),name:'Album',tracks:{items:[{id:'restricted',name:'Song',is_playable:true,restrictions:{reason:'market'},artists:[]}]}}:original(path)
 await runCatalogReview(c,{accountId,playlistId,progress,jobs:[{type:'album',id:'a'.repeat(22)}]})
 assert.equal(Object.values(progress.results)[0].tracks[0].is_playable,false)
 assert.equal(progress.blocked,undefined)
})
