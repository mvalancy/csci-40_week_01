import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentSphereT } from '../gameplay.js';
const p=(x,y=0,z=0)=>({x,y,z});

test('returns sphere entry rather than closest-center projection',()=>{
  assert.equal(segmentSphereT(p(0),p(10),p(5),2),.3);
  assert.equal(segmentSphereT(p(10),p(0),p(5),2),.3);
  assert.equal(segmentSphereT(p(0),p(3),p(5),2),1);
});

test('rejects misses, backward targets and wrong altitude',()=>{
  assert.equal(segmentSphereT(p(0),p(10),p(-5),2),null);
  assert.equal(segmentSphereT(p(0),p(10),p(15),2),null);
  assert.equal(segmentSphereT(p(0),p(10),p(5,12),2),null);
  assert.equal(segmentSphereT(p(0),p(10),p(5,2),2),.5,'Tangent contact');
  assert.ok(Math.abs(segmentSphereT(p(0,0,0),p(0,10,0),p(0,5,0),2)-.3)<1e-10);
});

test('starting inside and stationary projectiles are handled explicitly',()=>{
  assert.equal(segmentSphereT(p(5),p(10),p(5),2),0);
  assert.equal(segmentSphereT(p(3),p(0),p(5),2),0,'Starting on surface');
  assert.equal(segmentSphereT(p(5),p(5),p(5),2),0);
  assert.equal(segmentSphereT(p(0),p(0),p(5),2),null);
});

test('target in front of a wall wins while a target behind it stays protected',()=>{
  const from=p(0),to=p(10),wallT=.6;
  const front=segmentSphereT(from,to,p(5),1);
  const behind=segmentSphereT(from,to,p(8),1);
  assert.ok(front<wallT);
  assert.ok(behind>wallT);
});

test('nearest target impact wins independently of enemy array order',()=>{
  const from=p(0),to=p(10),enemies=[{name:'far',center:p(8),radius:1},{name:'near',center:p(4),radius:1}];
  const nearest=enemies.map(enemy=>({...enemy,t:segmentSphereT(from,to,enemy.center,enemy.radius)})).filter(enemy=>enemy.t!==null).sort((a,b)=>a.t-b.t)[0];
  assert.equal(nearest.name,'near');assert.equal(nearest.t,.3);
});
