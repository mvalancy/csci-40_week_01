// Screen-space instruments for the remote combat operator.
export function createNavigation(THREE, camera, container = document.body) {
  const root = document.createElement('div');
  root.className = 'cb-navigation'; root.hidden = true; root.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  style.textContent = `
    .cb-navigation{position:fixed;inset:0;z-index:2;pointer-events:none;color:#dfc28b;font:9px/1.45 monospace;text-shadow:0 1px 3px #000;contain:layout style}
    .cb-navigation[hidden],.cb-navigation [hidden]{display:none!important}
    .cb-nav-compass{position:absolute;top:120px;left:50%;transform:translateX(-50%);width:230px;text-align:center;color:#b8bca0;font-size:8px;letter-spacing:1px}
    .cb-nav-compass strong{font-weight:normal;color:#e0d2b3;padding:0 8px;background:#1720168c}
    .cb-nav-compass-line{display:flex;justify-content:space-between;border-bottom:1px solid #b0ad7760;padding:1px 6px 3px;margin-top:2px;opacity:.72;font-size:7px}
    .cb-nav-compass-line span:after{content:'';display:block;margin:0 auto;width:1px;height:3px;background:#acac7d}
    .cb-nav-objective,.cb-nav-enemy{position:absolute;left:0;top:0;transform:translate(-50%,-50%);text-align:center;white-space:nowrap;will-change:left,top}
    .cb-nav-symbol{display:block;position:relative;width:16px;height:16px;margin:0 auto 6px;border:1px solid #e0bf79;transform:rotate(45deg);box-shadow:0 0 3px #151a11}
    .cb-nav-symbol:after{content:'';position:absolute;inset:5px;background:#e0bf79}
    .cb-nav-objective[data-edge=true] .cb-nav-symbol{width:0;height:0;border:6px solid transparent;border-bottom:10px solid #dcc287;box-shadow:none;margin-bottom:10px}
    .cb-nav-objective[data-edge=true] .cb-nav-symbol:after{display:none}
    .cb-nav-objective-label{padding:3px 6px;background:#171d16b3;border-bottom:1px solid #bda26a66;letter-spacing:1px;font-size:8px}
    .cb-nav-objective-distance{display:block;color:#c4c5ac;font-size:9px;margin-top:1px}
    .cb-nav-enemy{color:#cdad78;font-size:7px;letter-spacing:1px}
    .cb-nav-brackets{width:30px;height:24px;display:block;margin:0 auto 5px;background:linear-gradient(#d3b886,#d3b886) left top/7px 1px no-repeat,linear-gradient(#d3b886,#d3b886) left top/1px 7px no-repeat,linear-gradient(#d3b886,#d3b886) right top/7px 1px no-repeat,linear-gradient(#d3b886,#d3b886) right top/1px 7px no-repeat,linear-gradient(#d3b886,#d3b886) left bottom/7px 1px no-repeat,linear-gradient(#d3b886,#d3b886) left bottom/1px 7px no-repeat,linear-gradient(#d3b886,#d3b886) right bottom/7px 1px no-repeat,linear-gradient(#d3b886,#d3b886) right bottom/1px 7px no-repeat}
    @media(max-width:650px){.cb-nav-compass{top:110px;width:170px;font-size:7px}.cb-nav-compass-line{font-size:6px}.cb-nav-objective-label{font-size:7px;letter-spacing:.5px}.cb-nav-objective-distance{font-size:8px}.cb-nav-enemy{font-size:6px}}
    @media(max-height:550px){.cb-nav-compass{display:none}.cb-nav-objective-label{font-size:7px}}
  `;
  root.innerHTML = '<div class="cb-nav-compass"><strong></strong><div class="cb-nav-compass-line"><span></span><span></span><span></span><span></span><span></span></div></div><div class="cb-nav-objective"><i class="cb-nav-symbol"></i><div class="cb-nav-objective-label"></div><span class="cb-nav-objective-distance"></span></div><div class="cb-nav-enemy" hidden><i class="cb-nav-brackets"></i><span></span></div>';
  container.append(style, root);
  const compass = root.querySelector('.cb-nav-compass strong');
  const ticks = [...root.querySelectorAll('.cb-nav-compass-line span')];
  const objective = root.querySelector('.cb-nav-objective');
  const symbol = root.querySelector('.cb-nav-symbol');
  const label = root.querySelector('.cb-nav-objective-label');
  const distanceLabel = root.querySelector('.cb-nav-objective-distance');
  const enemyMarker = root.querySelector('.cb-nav-enemy');
  const enemyLabel = enemyMarker.querySelector('span');
  const projected = new THREE.Vector3(), direction = new THREE.Vector3(), cameraForward = new THREE.Vector3();
  const point = new THREE.Vector3();
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const wrap = value => (value % 360 + 360) % 360;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function project(position, width, height) {
    point.set(position.x, position.y ?? 0, position.z);
    camera.getWorldDirection(cameraForward);
    const front = direction.copy(point).sub(camera.position).dot(cameraForward) > 0;
    projected.copy(point).project(camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, front };
  }
  function update({ bikePosition, heading = 0, mission, enemies = [], mode }) {
    root.hidden = mode !== 'playing' || !bikePosition || !mission;
    if (root.hidden) return;
    const width = innerWidth, height = innerHeight, mobile = width <= 650;
    const degrees = wrap(-heading * 180 / Math.PI);
    compass.textContent = `${headings[Math.round(degrees / 45) % 8]} ${String(Math.round(degrees) % 360).padStart(3, '0')}°`;
    const center = Math.round(degrees / 15) * 15;
    ticks.forEach((tick, i) => { const value = wrap(center + (i - 2) * 15); tick.textContent = value % 90 === 0 ? headings[value / 45] : String(value).padStart(3, '0'); });
    objective.hidden = !mission.targetPosition || mission.complete;
    let objectiveScreen = null;
    if (!objective.hidden) {
      const target = mission.targetPosition;
      const dx = target.x - bikePosition.x, dz = target.z - bikePosition.z;
      const distance = Math.hypot(dx, (target.y ?? 0) - bikePosition.y, dz);
      const desired = Math.atan2(-dx, -dz), bearing = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
      const safe = { left: mobile ? 62 : Math.min(245, width * .25), right: width - (mobile ? 62 : Math.min(170, width * .2)), top: Math.min(mobile ? 245 : 180, height * .4), bottom: height - Math.min(mobile ? 225 : 180, height * .35) };
      const screen = project({ x: target.x, y: (target.y ?? 0) + 3.4, z: target.z }, width, height);
      const onScreen = screen.front && screen.x >= safe.left && screen.x <= safe.right && screen.y >= safe.top && screen.y <= safe.bottom;
      let x = screen.x, y = screen.y;
      if (!onScreen) {
        // An objective behind the rider stays on the lower edge; left/right
        // encode steering direction instead of a mirrored camera projection.
        if (!screen.front) { x = width / 2 - Math.sin(bearing) * width * .5; y = safe.bottom; }
        x = clamp(x, safe.left, safe.right); y = clamp(y, safe.top, safe.bottom);
      }
      if (!Number.isFinite(x + y)) { x = width / 2; y = safe.bottom; }
      objective.dataset.edge = String(!onScreen);
      symbol.style.transform = onScreen ? 'rotate(45deg)' : `rotate(${-bearing * 180 / Math.PI}deg)`;
      objective.style.left = `${Math.round(x)}px`; objective.style.top = `${Math.round(y)}px`;
      const action = mission.phase === 'extract' ? 'EXTRACTION' : mission.phase === 'recover' ? 'RECOVER DATA' : 'DISABLE RELAY';
      label.textContent = action;
      distanceLabel.textContent = `${Math.round(distance)} M${onScreen ? '' : ' / ' + (Math.abs(bearing) > 2.5 ? 'TURN BACK' : bearing > .15 ? 'LEFT' : bearing < -.15 ? 'RIGHT' : 'AHEAD')}`;
      objectiveScreen = { x, y };
    }
    let nearest = null, nearestDistance = 220;
    for (const enemy of enemies) {
      if (enemy.health <= 0 || enemy.destroyed || enemy.mesh?.visible === false) continue;
      const position = enemy.mesh?.position || enemy.position;
      if (!position) continue;
      const dx = position.x - bikePosition.x, dz = position.z - bikePosition.z;
      const distance = Math.hypot(dx, (position.y ?? 0) - bikePosition.y, dz);
      const angle = Math.atan2(-dx, -dz) - heading;
      if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < .95 && distance < nearestDistance) { nearest = position; nearestDistance = distance; }
    }
    enemyMarker.hidden = true;
    if (nearest) {
      const screen = project(nearest, width, height);
      const clearOfObjective = !objectiveScreen || Math.hypot(screen.x - objectiveScreen.x, screen.y - objectiveScreen.y) > 75;
      if (screen.front && screen.x > 100 && screen.x < width - 100 && screen.y > (mobile ? 250 : 175) && screen.y < height - (mobile ? 235 : 180) && clearOfObjective) {
        enemyMarker.hidden = false; enemyMarker.style.left = `${Math.round(screen.x)}px`; enemyMarker.style.top = `${Math.round(screen.y)}px`;
        enemyLabel.textContent = `Q / LOCK CONE · ${Math.round(nearestDistance)} M`;
      }
    }
  }
  return { update, destroy() { root.remove(); style.remove(); } };
}
