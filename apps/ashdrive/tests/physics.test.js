import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVertical } from '../physics.js';
const dt = 1 / 60;
const height = z => Math.max(0, Math.min(12, (195 - Math.abs(z)) * .15));

test('climbing holds consistent slope momentum and descents remain grounded', () => {
  for (const speed of [30, 53]) {
    let state = {y:0,vy:0,grounded:true,previousFloor:0};
    for(let z=195-speed*dt;z>120;z-=speed*dt) {state=stepVertical(state,height(z),dt);assert.equal(state.grounded,true);assert.ok(Math.abs(state.y-height(z))<1e-8);assert.ok(Math.abs(state.vy-speed*.15)<1e-6);}
    state={y:12,vy:0,grounded:true,previousFloor:12};
    for(let z=110;z<210;z+=speed*dt) {state=stepVertical(state,height(z),dt);assert.equal(state.grounded,true);assert.equal(state.vy,0);assert.equal(state.y,height(z));}
  }
});

test('crest launches preserve ascent momentum across different tick alignments', () => {
  for(const speed of [30,53]) {
    const peaks=[];
    for(const offset of [0,.1,.25,.4]) {
      let state={y:0,vy:0,grounded:true,previousFloor:0},peak=0,airborne=false;
      for(let z=200+offset;z>70;z-=speed*dt) {state=stepVertical(state,height(z),dt);peak=Math.max(peak,state.y);airborne ||= !state.grounded;}
      assert.equal(airborne,true);assert.equal(state.grounded,true);assert.equal(state.y,12);peaks.push(peak);
    }
    assert.ok(Math.max(...peaks)-Math.min(...peaks)<.16,JSON.stringify(peaks));
  }
});

test('leaving a twelve meter deck falls, reports impact, and settles', () => {
  let state={y:12,vy:0,grounded:true,previousFloor:12};
  state=stepVertical(state,0,dt);assert.equal(state.grounded,false);assert.ok(state.y<12&&state.y>11);
  let impact=0;
  for(let i=0;i<180;i++){state=stepVertical(state,0,dt);impact=Math.max(impact,state.impact);}
  assert.equal(state.y,0);assert.equal(state.vy,0);assert.equal(state.grounded,true);assert.ok(impact>20);
});

test('stationary support never accumulates vertical momentum', () => {
  let state={y:12,vy:0,grounded:true,previousFloor:12};
  for(let i=0;i<600;i++)state=stepVertical(state,12,dt);
  assert.deepEqual(state,{y:12,vy:0,grounded:true,previousFloor:12,landed:false,impact:0});
});
