import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { knownTrackIds, findTrackMatch, pickBestMatch, pickAlternateVersion, albumSearchQueries } from '../src/matcher.js'
import { reviewedCandidate, reviewedRecording } from '../src/reviewed-recordings.js'
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/review-learning.json',import.meta.url)))
for(const {source,candidate} of rows){
 test('verified review replay uses one live lookup: '+source.name,async()=>{
  const d={};let searches=0
  const hit=await findTrackMatch(source,async()=>{searches++;return[]},d,{findKnownTracks:async(_,opts)=>{assert.deepEqual(opts.ids,[candidate.id]);assert.ok(opts.takeQuery());return[candidate]}})
  assert.equal(hit?.candidate.id,candidate.id);assert.equal(d.catalogQueryCount,1);assert.equal(searches,0)
  assert.equal(pickBestMatch(source,[{...candidate,is_playable:false}]),null)
 })
 test('review fingerprint rejects changed source/target metadata: '+source.name,()=>{
  for(const s of [{...source,id:0},{...source,name:'Other Song'},{...source,ar:[{name:'Other Artist'}]},{...source,al:{name:'Other Album'}},{...source,dt:source.dt+1}])assert.equal(reviewedRecording(s),undefined)
  for(const t of [{...candidate,id:'other'},{...candidate,name:candidate.name+' Live'},{...candidate,artists:[{name:'Other Artist'}]},{...candidate,album:{name:'Other Album'}},{...candidate,duration_ms:candidate.duration_ms+1}])assert.equal(reviewedCandidate(source,t),null)
  assert.equal(pickBestMatch(source,[{...candidate,artists:[{name:'Other Artist'}]}]),null)
  assert.equal(pickBestMatch(source,[{...candidate,name:candidate.name+' - Instrumental'}]),null)
 })
}
test('short album qualification preserves bounded fallback and long compilations',()=>{
 const song={name:'Song',ar:[{name:'Artist'}],al:{name:'Replica'}}
 assert.deepEqual(albumSearchQueries(song),['album:"Replica" artist:"Artist"','album:"Replica"'])
 assert.equal(albumSearchQueries({...song,al:{name:'Long Tribute Compilation'}})[0],'album:"Long Tribute Compilation"')
 assert.equal(albumSearchQueries({...song,al:{name:'短名',tns:['Translated Album']}})[1],'album:"Translated Album"')
})
test('campaign subtitle normalization generalizes beyond recorded IDs without accepting a wrong singer or real subtitle',()=>{
 const source={id:0,name:'Independent Song',ar:[{name:'Artist'}],al:{name:'Album'},dt:200000}
 const c={id:'new',name:'Independent Song (概念创作集《新作》作品)',artists:[{name:'Artist'}],album:{name:'Album'},duration_ms:200000,is_playable:true}
 assert.ok(pickBestMatch(source,[c]))
 assert.equal(pickBestMatch(source,[{...c,artists:[{name:'Wrong Artist'}]}]),null)
 assert.equal(pickBestMatch(source,[{...c,name:'Independent Song (Japanese Version)'}]),null)
 assert.ok(pickBestMatch(source,[{...c,name:'Independent Song (Different Story)'}]).title < 1)
})
test('Lena original learned recording never accepts changed guest remake or karaoke',()=>{
 const row=rows.find(r=>r.source.id===22831533),c=row.candidate
 for(const wrong of [{...c,artists:[...c.artists,{name:'Verbal Jint'}]},{...c,name:'Sweet(Brand New Mix) (feat.Verbal Jint)',album:{name:'Syncrofusion Lena Park + Brand New Music'}},{...c,name:"It's Sweet - Karaoke"},{...c,is_playable:false}]) assert.equal(pickBestMatch(row.source,[wrong]),null)
})

test('Dedicated forever prefers the verified solo single over the later duet', () => {
 const { source, candidate } = rows.find(row => row.source.id === 2119793675)
 const duet = {
  id: '2U5denBuD0HxY65fAAgfTj',
  name: '献给永远的 - 也许对你的记忆就是这爱情本身',
  artists: [{ name: '大粉乐队' }, { name: '錢正昊' }],
  album: { name: '献给永远的 (也许对你的记忆就是这爱情本身)' },
  duration_ms: 199331,
  is_playable: true,
 }
 assert.equal(pickBestMatch(source, [duet, candidate])?.candidate.id, candidate.id)
 assert.equal(pickBestMatch(source, [duet]), null)
 assert.equal(pickAlternateVersion(source, [duet]), null)
 assert.equal(pickBestMatch(source, [duet, { ...candidate, is_playable: false }]), null)
})

test('a verified Japanese recording can omit its language label without accepting a Korean recording', () => {
 const { source, candidate } = rows.find(row => row.source.id === 26343056)
 const korean = {
  ...candidate,
  id: '3Hyl7YrOtBcnh1geON2kSO',
  album: { name: 'Only One - The 7th Album' },
  duration_ms: 217085,
 }
 assert.equal(pickBestMatch(source, [korean, candidate])?.candidate.id, candidate.id)
 assert.equal(pickBestMatch(source, [candidate], 0.68, { manual: false }), null)
 const conflictingLabel = { ...candidate, name: 'Only One - Korean Version' }
 for (const wrong of [korean, conflictingLabel, { ...candidate, id: 'unreviewed-recording' }]) {
  assert.equal(pickBestMatch(source, [wrong]), null)
  assert.equal(pickAlternateVersion(source, [wrong]), null)
 }
 assert.equal(pickBestMatch({ ...source, id: 0 }, [candidate]), null)
})
