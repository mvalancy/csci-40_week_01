import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMission } from '../missions.js';
function fixture(){const scene=new THREE.Scene();const mission=createMission(THREE,scene,{spawnPoint:{x:-65,y:0,z:175},objectives:[{x:-75,y:12,z:-88},{x:80,y:0,z:-35},{x:-105,y:0,z:85}]});return{scene,mission};}

test('mission batching keeps the original geometry within a small draw budget',()=>{
  const {scene}=fixture();let meshes=0,triangles=0;
  scene.traverse(object=>{if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
  assert.ok(meshes<=45);assert.equal(triangles,1812,'Static batching must not discard machinery');
  const bounds=new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(bounds.min.x+108.8)<1e-5);assert.ok(Math.abs(bounds.max.x-83.8)<1e-5);
  assert.ok(Math.abs(bounds.max.z-184.25)<1e-5,'Extraction pad lamps keep their world position');
});

test('batched machinery preserves independently animated and hidden mission parts',()=>{
  const {mission}=fixture(),target=mission.targets[0];
  assert.equal(target.indicator.parent,target.equipment);assert.equal(target.beacon.parent,target.mesh);assert.equal(target.radar.parent,target.equipment);
  const rotation=target.radar.rotation.y;mission.update(.1,mission.extraction);assert.ok(target.radar.rotation.y>rotation);
  mission.hit(target,1);mission.update(.01,mission.extraction);assert.equal(target.indicator.material.emissiveIntensity,3);
  mission.hit(target,5);assert.equal(target.equipment.visible,false);assert.equal(target.intel.visible,true);
  mission.update(.1,target.position);assert.equal(target.recovered,true);assert.equal(target.beacon.visible,false);assert.equal(target.intel.visible,false);
  mission.reset();assert.equal(target.equipment.visible,true);assert.equal(target.beacon.visible,true);assert.equal(target.intel.visible,false);
});
