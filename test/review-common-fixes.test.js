import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, songSearchQueries, songTitles, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
import { RequestSafety } from '../src/request-safety.js'
import { safeFailureDetails } from '../src/sync-errors.js'
import { spotifyFetch } from '../src/spotify.js'

test('marketing metadata does not consume title queries; real aliases and original title survive', () => {
 const s={name:'行走的鱼',tns:['汪苏泷概念创作集《联名》作品','Walking Fish'],ar:[{name:'Artist'}]}
 assert.ok(songTitles(s).includes('Walking Fish'))
 assert.ok(!songSearchQueries(s).some(q=>q.includes('概念创作集')))
 assert.ok(songTitles({...s,name:s.tns[0],tns:[]}).includes(s.tns[0]))
})
test('Japanese Mix and Japanese Version are compatible, but Korean version is not', () => {
 const source={name:'New Song [JAPANESE MIX]',ar:[{name:'Artist'}],al:{name:'Album'},dt:200000}
 const c={id:'recording',name:'New Song - Japanese Version',artists:[{name:'Artist'}],album:{name:'Album'},duration_ms:200000,is_playable:true}
 assert.ok(pickBestMatch(source,[c]))
 for(const name of ['New Song','New Song - Korean Version']) {
   assert.equal(pickBestMatch(source,[{...c,name}]),null)
   assert.equal(pickAlternateVersion(source,[{...c,name}]),null)
 }
})

test('Joey Yung theme credit matches in the first search when corroborated', async () => {
 const source = {
  id: 27906318, name: '续集', ar: [{ name: '容祖儿' }], al: { name: '续集' },
  dt: 319130, tns: ['剧集《On Call 36 小时 II》主题曲'],
 }
 const candidate = {
  id: '0vG6VyHA4kKt793ErzQuB5', name: '續集 - 《On Call 36 小時 II》 主題曲',
  artists: [{ name: 'Joey Yung' }], album: { name: '續集' }, duration_ms: 319130, is_playable: true,
 }
 const diagnostics = {}
 let calls = 0
 const result = await findTrackMatch(source, async () => (++calls === 1 ? [candidate] : []), diagnostics)
 assert.equal(result?.candidate.id, candidate.id)
 assert.equal(result.titleEvidence, 'corroborated-theme-usage')
 assert.equal(diagnostics.catalogQueryCount, 1)
 assert.equal(calls, 1)
 for (const wrong of [
  { name: '續集 - 《On Call 36 小時 II》' },
  { name: '續集 - 《On Call 36 小時 II》 主題曲 (Instrumental)' },
  { artists: [{ name: 'Andy Lau' }] },
  { artists: [...candidate.artists, { name: 'Guest' }] },
  { album: { name: 'Different release' } },
  { duration_ms: 319650 },
  { is_playable: false },
 ]) assert.equal(pickBestMatch(source, [{ ...candidate, ...wrong }]), null)
})

test('corroborated theme usage also works on the source side for another recording', () => {
 const source = {
  name: '晚风（電影《漫長的旅途》片尾曲）', ar: [{ name: 'Artist' }], al: { name: 'Release' }, dt: 200000,
 }
 const candidate = {
  id: 'recording', name: '晚風', artists: [{ name: 'Artist' }],
  album: { name: 'Release' }, duration_ms: 200200, is_playable: true,
 }
 assert.equal(pickBestMatch(source, [candidate])?.titleEvidence, 'corroborated-theme-usage')
 assert.equal(pickBestMatch(source, [{ ...candidate, name: '晚風 - 《別的故事》片尾曲' }]), null)
})
test('transport diagnostics preserve safe error codes through backoff without secrets', async () => {
 let time=100000;const state={spotify:{}};const store={state,async update(fn){fn(state)}}
 const safety=new RequestSafety(store,{now:()=>time,sleep:async ms=>{time+=ms},minIntervalMs:8000})
 let count=0
 await assert.rejects(safety.fetch(async()=>{count++;throw Object.assign(new Error('Bearer secret https://private'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}})},'https://api.spotify.com/v1/me'),e=>{
   assert.equal(e.networkCode,'UND_ERR_CONNECT_TIMEOUT')
   assert.equal(safeFailureDetails(e).networkCode,'UND_ERR_CONNECT_TIMEOUT')
   return e.pauseReason==='transient-backoff'
 })
 assert.equal(count,3)
 assert.equal(state.spotify.lastNetworkError.code,'UND_ERR_CONNECT_TIMEOUT')
 assert.doesNotMatch(JSON.stringify(state),/secret|private|Bearer/)
 await assert.rejects(safety.fetch(async()=>{count++},'x'))
 assert.equal(count,3)
})
test('a successful response resets historical failure escalation without clearing provider cooldown', async()=>{
 let now=100000;const state={spotify:{transientFailures:4,retryAfterUntil:90000}}
 const safety=new RequestSafety({state,async update(fn){fn(state)}},{now:()=>now,sleep:async ms=>{now+=ms}})
 await safety.fetch(async()=>new Response('{}'),'search')
 assert.equal(state.spotify.transientFailures,0)
 assert.equal(state.spotify.retryAfterUntil,90000)
 await assert.rejects(safety.fetch(async()=>new Response('',{status:503}),'search'),e=>e.retryAt===now+15*60000)
})
test('all historical confirmed fixtures retain their IDs after the general changes', async()=>{
 const fs=await import('node:fs/promises')
 const directory=new URL('./fixtures/',import.meta.url)
 let count=0
 for(const file of (await fs.readdir(directory)).filter(f=>/^november\d+-confirmed\.json$/.test(f))) {
  for(const {source,candidate} of JSON.parse(await fs.readFile(new URL(file,directory),'utf8'))) {
   assert.equal((pickBestMatch(source,[candidate])||pickAlternateVersion(source,[candidate]))?.candidate.id,candidate.id,`${file}: ${source.name}`)
   count++
  }
 }
 assert.ok(count>=150)
})
test('paused API read stops before refreshing an expired token', async()=>{
 const {SpotifyClient}=await import('../src/spotify.js')
 const state={spotify:{refreshToken:'private',expiresAt:0,retryNotBefore:Date.now()+60000,pauseReason:'transient-backoff'},settings:{},sync:{}}
 let calls=0
 const client=new SpotifyClient({state,async update(fn){fn(state)}},async()=>{calls++;throw Error('must not authorize')})
 await assert.rejects(client.request('/me'),{pauseReason:'transient-backoff'})
 assert.equal(calls,0)
})
