import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {songSearchStages,pickBestMatch,pickAlternateVersion}from'../src/matcher.js'
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/november16.json',import.meta.url)))
for(const {source,candidates}of rows)test('November16 reject unverified cover/recording: '+source.name,()=>{
 assert.equal(pickBestMatch(source,candidates)||pickAlternateVersion(source,candidates),null)
})
test('free-text stage reserves the second slot for verified primary alias instead of bare title',()=>{
 for(const [name,artist,alias] of [['Off Shore','角松敏生','Toshiki Kadomatsu'],['Unrelated Song','宇多田ヒカル','Hikaru Utada']]){
 const stage=songSearchStages({name,ar:[{name:artist}]}).find(s=>s.name==='free-text')
 assert.equal(stage.queries[0],`${name} ${artist}`)
 assert.equal(stage.queries[1],`${name} ${alias}`)
 }
 const noAlias=songSearchStages({name:'Song',ar:[{name:'Unknown Artist'}]}).find(s=>s.name==='free-text')
 assert.equal(noAlias.queries[0],'Song Unknown Artist')
 assert.ok(!noAlias.queries.includes('Song undefined'))
})
test('all27 imported November16 recordings retain IDs',()=>{
 const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/november16-confirmed.json',import.meta.url)))
 assert.equal(rows.length,27)
 for(const{source,candidate}of rows)assert.equal((pickBestMatch(source,[candidate])||pickAlternateVersion(source,[candidate]))?.candidate.id,candidate.id,source.name)
})
