import test from 'node:test';
import assert from 'node:assert/strict';
import { createGpuTimer } from '../gpu-timer.js';
function clock() { let time=0;return {now:()=>time,advance:ms=>{time+=ms;}}; }
function mockGL() {
  let active=null,id=0;const queries=[];
  const gl={ QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,CURRENT_QUERY:3,disjoint:false,reads:0,deleted:0,
    getExtension:()=>({TIME_ELAPSED_EXT:4,GPU_DISJOINT_EXT:5}),getParameter:()=>gl.disjoint,getQuery:()=>active,
    createQuery:()=>{const q={id:++id,ready:false,ns:7_500_000};queries.push(q);return q;},
    beginQuery:(type,q)=>{active=q;},endQuery:()=>{active=null;},deleteQuery:()=>gl.deleted++,
    getQueryParameter:(q,what)=>{if(what===1)return q.ready;assert.ok(q.ready);gl.reads++;return q.ns;},
  };return {gl,queries};
}
test('WebGL polls later frames and reads only available results in milliseconds',()=>{
  const {gl,queries}=mockGL(),time=clock(),timer=createGpuTimer({getContext:()=>gl},time);
  timer.begin();timer.end();queries[0].ready=true;
  assert.equal(timer.sample().gpuMs,null);assert.equal(gl.reads,0);
  time.advance(16);timer.begin();timer.end();assert.equal(timer.sample().gpuMs,7.5);assert.equal(gl.deleted,1);
  assert.equal(timer.sample().sampleId,1);assert.equal(timer.sample().ageSeconds,.016);timer.dispose();
});
test('pending WebGL queries stay bounded and disjoint samples are discarded',()=>{
  const {gl,queries}=mockGL(),time=clock(),timer=createGpuTimer({getContext:()=>gl},time);
  for(let i=0;i<120;i++){time.advance(17);timer.begin();timer.end();timer.sample();}
  assert.equal(queries.length,4);assert.equal(timer.sample().pending,4);
  gl.disjoint=true;assert.equal(timer.sample().gpuMs,null);assert.equal(timer.sample().pending,0);assert.equal(gl.deleted,4);assert.equal(timer.sample().ageSeconds,null);timer.dispose();
});
test('sampling cadence follows wall time instead of requiring fifteen rendered frames',()=>{
  const {gl,queries}=mockGL(),time=clock(),timer=createGpuTimer({getContext:()=>gl},time);
  timer.begin();timer.end();assert.equal(queries.length,1);
  time.advance(249);timer.begin();timer.end();assert.equal(queries.length,1);
  time.advance(1);timer.begin();timer.end();assert.equal(queries.length,2);
  time.advance(500);timer.begin();timer.end();assert.equal(queries.length,3);timer.dispose();
});
test('freshness includes GPU completion delay and increases while rendering is paused',()=>{
  const {gl,queries}=mockGL(),time=clock(),timer=createGpuTimer({getContext:()=>gl},time);
  timer.begin();timer.end();time.advance(1600);queries[0].ready=true;timer.begin();timer.end();
  assert.equal(timer.sample().ageSeconds,1.6);const id=timer.sample().sampleId;
  time.advance(2000);assert.equal(timer.sample().ageSeconds,3.6);assert.equal(timer.sample().sampleId,id);timer.dispose();
});
test('unsupported timers return null without changing rendering',()=>{
  const timer=createGpuTimer({getContext:()=>({getExtension:()=>null})});timer.begin();timer.end();assert.equal(timer.sample().supported,false);assert.equal(timer.sample().gpuMs,null);assert.equal(timer.sample().sampleId,null);timer.dispose();
});
test('native uses single asynchronous request and retains original submission time',async()=>{
  let resolve,calls=0,frames=[];const time=clock();
  const renderer={info:{frame:100},backend:{isWebGPUBackend:true,trackTimestamp:true,getTimestampFrames:()=>frames},hasFeature:()=>true,
    resolveTimestampsAsync:()=>{calls++;return new Promise(r=>{resolve=r;});}};
  const timer=createGpuTimer(renderer,time);timer.begin();timer.end();await Promise.resolve();
  for(let i=0;i<3;i++){time.advance(300);renderer.info.frame++;timer.begin();timer.end();}
  assert.equal(calls,1);frames=[86,99,100];resolve(12);await new Promise(r=>setImmediate(r));
  assert.equal(timer.sample().gpuMs,12);assert.equal(timer.sample().sampleFrames,1);assert.equal(timer.sample().ageSeconds,.9);assert.equal(timer.sample().sampleId,1);timer.dispose();
});
test('native rejects cached timestamp results from an older renderer frame',async()=>{
  const renderer={info:{frame:9},backend:{isWebGPUBackend:true,trackTimestamp:true,getTimestampFrames:()=>[8]},hasFeature:()=>true,resolveTimestampsAsync:async()=>5};
  const timer=createGpuTimer(renderer);timer.begin();timer.end();await new Promise(r=>setImmediate(r));assert.equal(timer.sample().gpuMs,null);assert.equal(timer.sample().rejected,1);timer.dispose();
});
test('a disjoint GPU invalidates the previous result even with no queries pending', () => {
  const { gl, queries } = mockGL(), time = clock(), timer = createGpuTimer({ getContext: () => gl }, time);
  timer.begin(); timer.end(); queries[0].ready = true;
  time.advance(16); timer.begin(); timer.end();
  assert.equal(timer.sample().pending, 0); assert.equal(timer.sample().gpuMs, 7.5);
  gl.disjoint = true; time.advance(250); timer.begin(); timer.end();
  assert.equal(timer.sample().gpuMs, null); assert.equal(timer.sample().sampleId, null);
  timer.dispose();
});
