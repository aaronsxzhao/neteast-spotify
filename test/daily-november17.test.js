import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import{pickBestMatch,pickAlternateVersion,findTrackMatch}from'../src/matcher.js'
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/november17.json',import.meta.url)))
for(const{source,candidates}of rows)test('November17 full miss review: '+source.name,()=>{
 const hit=pickBestMatch(source,candidates)||pickAlternateVersion(source,candidates)
 assert.equal(hit?.candidate.id,source.id===5382902?'0lVJIHTB13L9HgvmyghcPV':undefined)
})
test('real Hangul spelling recovery stops after first search without learned ID',async()=>{
 const{source,candidates}=rows.find(r=>r.source.id===5382902);const d={};let calls=0
 const hit=await findTrackMatch({...source,id:0},async()=>{calls++;return candidates},d)
 assert.equal(hit.candidate.id,'0lVJIHTB13L9HgvmyghcPV');assert.equal(hit.titleEvidence,'corroborated-hangul-initial');assert.equal(calls,1);assert.equal(d.catalogQueryCount,1)
})
test('corroborated spelling is general, but never forgives vowels, multiple initials or short titles',()=>{
 const s={id:0,name:'가나다라',ar:[{name:'Independent Artist'}],al:{name:'Album'},dt:200000}
 const c={id:'independent',name:'카나다라',artists:[{name:'Independent Artist'}],album:{name:'Album'},duration_ms:200000,is_playable:true}
 assert.equal(pickBestMatch(s,[c])?.titleEvidence,'corroborated-hangul-initial')
 for(const name of ['고나다라','카나타라']) assert.equal(pickBestMatch(s,[{...c,name}])?.titleEvidence||null,null)
 assert.equal(pickBestMatch({...s,name:'가나'},[{...c,name:'카나'}])?.titleEvidence||null,null)
 const real=rows.find(r=>r.source.id===5382902),correct=real.candidates[0]
 for(const bad of [{...correct,artists:[{name:'Wrong Artist'}]},{...correct,album:{name:'Other Album'}},{...correct,duration_ms:correct.duration_ms+251},{...correct,is_playable:false},{...correct,name:correct.name+' - Instrumental'},{...correct,artists:[...correct.artists,{name:'New Guest'}]}])assert.equal(pickBestMatch(real.source,[bad]),null)
})
test('all21 November17 imports retain original IDs',()=>{
 const confirmed=JSON.parse(fs.readFileSync(new URL('./fixtures/november17-confirmed.json',import.meta.url)))
 assert.equal(confirmed.length,21)
 for(const{source,candidate}of confirmed)assert.equal((pickBestMatch(source,[candidate])||pickAlternateVersion(source,[candidate]))?.candidate.id,candidate.id,source.name)
})
