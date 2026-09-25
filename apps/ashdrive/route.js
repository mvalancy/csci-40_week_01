/** Ground-grid navigation plus explicit access ramps for the raised freeways. */
export function buildRoute(from, to, world) {
  const cell = 6, limit = Math.floor((world.bounds - 5) / cell);
  const key = (x,z) => `${x},${z}`;
  const blocked = new Map();
  function clear(x,z) {
    const id=key(x,z); if(blocked.has(id))return blocked.get(id);
    const p={x:x*cell,y:0,z:z*cell};
    const allowed=Math.abs(x)<=limit&&Math.abs(z)<=limit&&!world.pushOut({...p},3.3)&&world.heightAt(p.x,p.z,0)<.01;
    blocked.set(id,allowed);return allowed;
  }
  function nearest(p) {
    const x=Math.round(p.x/cell),z=Math.round(p.z/cell);
    for(let r=0;r<8;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if(clear(x+dx,z+dz))return {x:x+dx,z:z+dz};
    return {x,z};
  }
  function groundPath(a,b) {
    const start=nearest(a),goal=nearest(b),nodes=new Map(),open=[];
    const first={...start,g:0,f:Math.hypot(start.x-goal.x,start.z-goal.z),parent:null};nodes.set(key(start.x,start.z),first);open.push(first);
    let found=null,iterations=0;
    while(open.length&&iterations++<9000){
      let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;
      const current=open.splice(best,1)[0];if(current.closed)continue;current.closed=true;
      if(current.x===goal.x&&current.z===goal.z){found=current;break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const x=current.x+dx,z=current.z+dz;if(!clear(x,z)||dx&&dz&&(!clear(current.x+dx,current.z)||!clear(current.x,current.z+dz)))continue;
        const id=key(x,z),g=current.g+Math.hypot(dx,dz),existing=nodes.get(id);if(existing&&(existing.closed||existing.g<=g))continue;
        const node={x,z,g,f:g+Math.hypot(x-goal.x,z-goal.z),parent:current};nodes.set(id,node);open.push(node);
      }
    }
    if(!found)return [];
    const points=[];for(let n=found;n;n=n.parent)points.push({x:n.x*cell,y:0,z:n.z*cell});points.reverse();
    // Keep turns, remove collinear points. A* clearance already includes bike
    // width and diagonal corner checks; no line-of-sight corner cutting.
    const result=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],prev=points[i-1],next=points[i+1];
      if(!prev||!next||(p.x-prev.x)*(next.z-p.z)!==(p.z-prev.z)*(next.x-p.x))result.push(p);
    }
    result.push({x:b.x,y:b.y??0,z:b.z});return result;
  }
  const elevatedFrom=(from.y??0)>8,elevatedTo=(to.y??world.heightAt(to.x,to.z))>8;
  const finish={x:to.x,y:to.y??world.heightAt(to.x,to.z),z:to.z};
  if(elevatedTo){
    const route=[];let deckFrom=from;
    if(!elevatedFrom){route.push(...groundPath(from,{x:0,y:0,z:210}),{x:0,y:0,z:195},{x:0,y:12,z:110});deckFrom={x:0,y:12,z:110};}
    const fromCross=Math.abs(deckFrom.z+88)<=12&&Math.abs(deckFrom.x)>14;
    if(fromCross)route.push({x:0,y:12,z:-88});else route.push({x:0,y:12,z:deckFrom.z});
    if(Math.abs(finish.x)>14)route.push({x:0,y:12,z:-88});
    else route.push({x:0,y:12,z:finish.z});
    route.push(finish);return route;
  }
  if(elevatedFrom){
    const cross=Math.abs(from.z+88)<=12;
    const edge={x:Math.abs(from.x)<=14?(to.x<0?-23:23):from.x,y:0,z:cross?(to.z<-88?-110:-65):from.z};
    return [edge,...groundPath(edge,finish)];
  }
  return groundPath(from,finish);
}
