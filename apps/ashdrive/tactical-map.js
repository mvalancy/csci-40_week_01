// Original schematic map of the combat district. No external imagery.
export function createTacticalMap(world) {
  const overlay = document.createElement('div'); overlay.className = 'cb-tactical-map'; overlay.hidden = true;
  overlay.innerHTML = '<section class="cb-map-panel" role="dialog" aria-modal="true" aria-label="Shadow Sector tactical map"><header class="cb-map-header"><div><small>REMOTE OPERATIONS / SECTOR 07</small><h2>TACTICAL MAP</h2></div><button type="button" class="cb-map-close" aria-label="Close tactical map">CLOSE ×</button></header><p class="cb-map-brief"></p><canvas width="480" height="480" aria-label="District map showing the bike, relays, enemies, roads and extraction"></canvas><div class="cb-map-legend"><span><i class="cb-map-amber">◇</i> RELAY / DATA</span><span><i class="cb-map-green">✓</i> RECOVERED</span><span><i class="cb-map-red">•</i> HOSTILE</span><span>▲ YOU</span><span>H EXTRACTION</span></div><ol class="cb-map-objectives"></ol><p class="cb-map-hint">FREE EXPLORATION · ROADS ARE OPTIONAL<br><kbd>TAB</kbd> RETURN TO BIKE · CHOOSE YOUR OWN APPROACH</p></section>';
  const style = document.createElement('style');
  style.textContent = `
    .cb-tactical-map{position:fixed;inset:0;z-index:12;background:#0b100eee;backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px;color:#dedbc1;overflow:auto}
    .cb-tactical-map[hidden]{display:none!important}
    .cb-map-panel{width:min(580px,100%);max-height:calc(100dvh - 36px);overflow:auto;background:#171e19;border:1px solid #7a805b;box-shadow:0 12px 80px #0008;padding:20px 24px;font:10px/1.5 monospace}
    .cb-map-panel .cb-map-header{position:static;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px}
    .cb-map-header small{font:8px monospace;letter-spacing:2px;color:#a4ad90}.cb-map-header h2{font:bold 21px monospace;letter-spacing:3px;margin:4px 0 0;color:#e1cca0}
    .cb-map-panel .cb-map-close{min-width:0;padding:10px 12px;font:9px monospace;letter-spacing:1px;clip-path:none;background:#293225;border:1px solid #7a805b;color:#e2dcc3}
    .cb-map-close:focus-visible{outline:2px solid #e6bd78;outline-offset:3px}.cb-map-brief{color:#ddbc7b;margin:8px 0 12px;font-size:10px;min-height:15px}
    .cb-map-panel canvas{display:block;width:100%;max-width:480px;height:auto;aspect-ratio:1;margin:0 auto;border:1px solid #555e46;background:#101812}
    .cb-map-legend{display:flex;gap:8px 16px;flex-wrap:wrap;padding:12px 0 6px;font-size:8px;color:#c4c7ac}.cb-map-legend i{font-style:normal}.cb-map-amber{color:#e2b56c}.cb-map-green{color:#a9cc95}.cb-map-red{color:#d47e58}
    .cb-map-objectives{padding:0;margin:7px 0;list-style:none;display:grid;gap:4px;color:#acb69a;font-size:9px}.cb-map-objectives li{display:flex;gap:9px;justify-content:space-between}.cb-map-objectives b{font-weight:normal;color:#dfc18a}
    .cb-map-hint{border-top:1px solid #596044;padding-top:10px;margin:10px 0 0;color:#8f9b7f;font-size:8px;letter-spacing:1px;line-height:1.9}.cb-map-hint kbd{font-size:8px;padding:1px 4px}
    @media(max-width:650px){.cb-tactical-map{padding:10px}.cb-map-panel{padding:15px;max-height:calc(100dvh - 20px)}.cb-map-header h2{font-size:18px}.cb-map-header small{font-size:7px;letter-spacing:1px}.cb-map-legend{gap:5px 9px;font-size:7px}.cb-map-objectives{font-size:8px}.cb-map-brief{font-size:9px}}
    @media(max-height:600px) and (min-width:700px){.cb-map-panel{width:740px;display:grid;grid-template-columns:minmax(250px,1fr) 1fr;gap:0 18px}.cb-map-header{grid-column:1/3}.cb-map-panel canvas{grid-column:1;grid-row:2/6;max-height:calc(100dvh - 125px);width:auto;max-width:100%}.cb-map-brief,.cb-map-legend,.cb-map-objectives,.cb-map-hint{grid-column:2}}
  `;
  document.body.append(style, overlay);
  const canvas = overlay.querySelector('canvas'), ctx = canvas.getContext('2d');
  const brief = overlay.querySelector('.cb-map-brief'), list = overlay.querySelector('.cb-map-objectives');
  const button = overlay.querySelector('.cb-map-close');
  let visible = false, previousFocus = null;
  const extent = world.bounds || 240, inset = 28, area = 424;
  const mapX = x => inset + ((x + extent) / (extent * 2)) * area;
  const mapY = z => inset + ((z + extent) / (extent * 2)) * area;
  const scale = area / (extent * 2);
  function close() { visible = false; overlay.hidden = true; previousFocus?.focus?.({ preventScroll: true }); }
  function requestClose() { close(); window.dispatchEvent(new CustomEvent('cyber-map-close')); }
  button.addEventListener('click', requestClose);
  overlay.addEventListener('click', event => { if (event.target === overlay) requestClose(); });
  function text(value, x, z, color = '#738269', size = 8) { ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.textAlign = 'center'; ctx.fillText(value, mapX(x), mapY(z)); }
  function update(data = {}) {
    if (!visible || !ctx) return;
    const { position = world.spawnPoint, heading = 0, mission = {}, targets = [], enemies = [] } = data;
    brief.textContent = `${mission.recovered || 0}/${mission.total ?? 3} DATA RECOVERED · ${mission.objectiveText || 'EXPLORE THE DISTRICT'}`;
    ctx.clearRect(0, 0, 480, 480); ctx.fillStyle = '#101812'; ctx.fillRect(0, 0, 480, 480);
    ctx.strokeStyle = '#263529'; ctx.lineWidth = .7;
    for (let n = -extent; n <= extent; n += 40) { ctx.beginPath(); ctx.moveTo(mapX(n),inset); ctx.lineTo(mapX(n),480-inset); ctx.moveTo(inset,mapY(n)); ctx.lineTo(480-inset,mapY(n)); ctx.stroke(); }
    ctx.strokeStyle = '#6d7959'; ctx.lineWidth = 1; ctx.strokeRect(inset,inset,area,area);
    // District labels are schematic landmarks, not obstructing road routes.
    ctx.fillStyle = '#273027'; ctx.fillRect(mapX(-180),mapY(30),70*scale,110*scale); ctx.fillRect(mapX(85),mapY(95),110*scale,90*scale);
    text('REFINERY',-150,60); text('CARGO YARD',145,122); text('DEFENSE WORKS',120,-45); text('NORTH SECTOR',70,-210);
    for (const road of world.roadMap || []) {
      const width = road.width * scale;
      ctx.strokeStyle = '#535945'; ctx.lineWidth = width;
      ctx.beginPath();
      if (road.axis === 'z') { ctx.moveTo(mapX(road.center),mapY(-road.end)); ctx.lineTo(mapX(road.center),mapY(road.end)); }
      else { ctx.moveTo(mapX(-road.end),mapY(road.center)); ctx.lineTo(mapX(road.end),mapY(road.center)); }
      ctx.stroke(); ctx.strokeStyle = '#a19966'; ctx.lineWidth = .8; ctx.setLineDash([4,5]); ctx.stroke(); ctx.setLineDash([]);
      // Hatched ramps mark surface access onto elevated decks.
      ctx.strokeStyle = '#b6ad795f'; ctx.lineWidth = 1;
      for (const sign of [-1,1]) for(let t=road.plateau+10;t<road.end;t+=14) {
        const along = sign*t, across = road.center;
        ctx.beginPath();
        if(road.axis==='z'){ctx.moveTo(mapX(across-road.width/2),mapY(along));ctx.lineTo(mapX(across+road.width/2),mapY(along));}
        else{ctx.moveTo(mapX(along),mapY(across-road.width/2));ctx.lineTo(mapX(along),mapY(across+road.width/2));}
        ctx.stroke();
      }
    }
    const extraction = world.spawnPoint;
    ctx.strokeStyle = mission.phase === 'extract' ? '#e1c781' : '#809171'; ctx.lineWidth = 1.2; ctx.strokeRect(mapX(extraction.x)-7,mapY(extraction.z)-7,14,14);
    text('H',extraction.x,extraction.z+4,'#c6d0ad',11); text('MOTORPOOL',extraction.x,extraction.z+24,'#a8b495',7);
    for (const enemy of enemies) {
      if(enemy.health<=0)continue;const point=enemy.mesh?.position||enemy.position;if(!point)continue;
      if(Math.abs(point.x)>extent||Math.abs(point.z)>extent)continue;
      ctx.fillStyle='#ce815d';ctx.beginPath();ctx.arc(mapX(point.x),mapY(point.z),2.5,0,Math.PI*2);ctx.fill();
    }
    list.replaceChildren();
    targets.forEach((target,index)=>{
      const point=target.position||target.mesh?.position;if(!point)return;
      const color=target.recovered?'#a6c88a':target.destroyed?'#e6d6a3':'#e2b56c';
      const x=mapX(point.x),y=mapY(point.z);
      ctx.strokeStyle=color;ctx.fillStyle='#111b14';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+9,y);ctx.lineTo(x,y+9);ctx.lineTo(x-9,y);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle=color;ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText(target.recovered?'✓':String(index+1),x,y+3);
      const row=document.createElement('li'), name=document.createElement('span'), status=document.createElement('b');
      name.textContent=`${index+1}. ${target.label}`;
      status.textContent=target.recovered?'RECOVERED':target.destroyed?'COLLECT DATA':'ACTIVE RELAY';row.append(name,status);list.append(row);
    });
    if(position){
      const px=Math.max(inset,Math.min(480-inset,mapX(position.x))),py=Math.max(inset,Math.min(480-inset,mapY(position.z)));
      ctx.save();ctx.translate(px,py);ctx.rotate(-heading);ctx.strokeStyle='#e6e9c7';ctx.fillStyle='#e6e9c7';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-4,5);ctx.lineTo(0,2);ctx.lineTo(4,5);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.fillStyle='#9aab84';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText('N ↑',30,18);ctx.textAlign='right';ctx.fillText(`${extent*2} M × ${extent*2} M`,450,18);
    ctx.strokeStyle='#99a680';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(30,465);ctx.lineTo(30+50*scale,465);ctx.stroke();ctx.font='7px monospace';ctx.textAlign='left';ctx.fillText('50 M',34+50*scale,468);
  }
  function toggle(data) {
    if(visible){close();return false;}
    previousFocus=document.activeElement;visible=true;overlay.hidden=false;update(data);button.focus({preventScroll:true});return true;
  }
  return {toggle,close,get visible(){return visible;},update,destroy(){close();overlay.remove();style.remove();}};
}
