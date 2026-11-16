import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createSpotifyTransport } from '../src/spotify-transport.js'
function fixture(handler,timeout=1000){const calls=[];const transport=createSpotifyTransport((url,options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=body=>{calls.push({url,options,body});queueMicrotask(()=>handler(callback,req))};return req},timeout);return {calls,transport}}
function reply(callback,status=200,headers={},data='{}'){const res=new EventEmitter();Object.assign(res,{statusCode:status,headers,destroy(){}});callback(res);res.emit('data',Buffer.from(data));res.emit('end')}
test('HTTPS sends exact token body, forces IPv4, and preserves provider status and Retry-After',async()=>{
 const f=fixture(cb=>reply(cb,429,{'retry-after':'900'},'{"error":"limited"}'))
 const r=await f.transport('https://accounts.spotify.com/api/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:'test & value'})})
 assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'900');assert.equal((await r.json()).error,'limited');assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.family,4);assert.equal(f.calls[0].body.toString(),'grant_type=refresh_token&refresh_token=test+%26+value');assert.equal(Number(f.calls[0].options.headers['content-length']),f.calls[0].body.length)
})
test('timeout covers body reads and never replays an ambiguous POST',async()=>{
 const f=fixture(cb=>{const res=new EventEmitter();Object.assign(res,{statusCode:200,headers:{},destroy(){}});cb(res)},10)
 await assert.rejects(f.transport('https://accounts.spotify.com/api/token',{method:'POST',body:'token'}),{name:'TimeoutError'});assert.equal(f.calls.length,1)
})
test('cancellation and invalid destinations do not send credentials',async()=>{
 const f=fixture(cb=>reply(cb));const c=new AbortController();c.abort()
 await assert.rejects(f.transport('https://api.spotify.com/v1/me',{signal:c.signal}),{name:'AbortError'});assert.equal(f.calls.length,0)
 for(const url of ['https://evil.example','http://api.spotify.com','https://api.spotify.com:444/me','https://user:pass@api.spotify.com/me'])await assert.rejects(f.transport(url),/Invalid/)
 assert.equal(f.calls.length,0)
})
test('redirect is returned without forwarding authorization and empty responses work',async()=>{
 const f=fixture(cb=>reply(cb,302,{location:'https://evil.example'},''));assert.equal((await f.transport('https://api.spotify.com/v1/me',{headers:{authorization:'Bearer test'}})).status,302);assert.equal(f.calls.length,1)
 const empty=fixture(cb=>reply(cb,204,{},''));assert.equal(await(await empty.transport('https://api.spotify.com/v1/me')).text(),'')
})
