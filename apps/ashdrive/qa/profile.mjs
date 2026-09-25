import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label=process.argv[2]||'baseline';
const output='/tmp/ashdrive-profiles';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:false,channel:'chromium',args:['--window-position=968,0','--window-size=904,1040','--ozone-platform=x11','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:888,height:930}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await page.goto((process.env.ASHDRIVE_URL||'http://localhost:4175/')+'?renderer=webgl&quality=medium&profile=1');
 await page.waitForFunction(()=>window.__app?.ready,null,{timeout:90000});
 await page.getByRole('button',{name:'AUTONOMOUS SORTIE'}).click();
 await page.bringToFront();
 await page.waitForTimeout(5000);
 await page.evaluate(()=>{window.__profile=[];let previous=performance.now();const collect=t=>{const a=window.__app;window.__profile.push({frameMs:t-previous,...a.performance,fps:a.fps,x:a.x,z:a.z,mode:a.mode,quality:a.quality?.tier,visible:document.visibilityState,focused:document.hasFocus()});previous=t;if(window.__profile.length<10000&&!window.__profileStop)requestAnimationFrame(collect)};requestAnimationFrame(collect)});
 for(let i=0;i<6;i++){await page.waitForTimeout(10000);console.log(label,i+1,await page.evaluate(()=>({fps:window.__app.fps,performance:window.__app.performance,mission:window.__app.mission?.recovered,visible:document.visibilityState,focused:document.hasFocus()})));}
 const samples=await page.evaluate(()=>{window.__profileStop=true;return window.__profile});
 const summary={};for(const key of ['frameMs','updateMs','renderMs','drawCalls','triangles']){const a=samples.map(s=>s[key]).filter(Number.isFinite).sort((a,b)=>a-b);summary[key]={median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],mean:a.reduce((x,y)=>x+y,0)/a.length}}
 const state=await page.evaluate(()=>window.__app);await page.screenshot({path:`${output}/${label}.png`});
 await writeFile(`${output}/${label}.json`,JSON.stringify({summary,state,errors,samples},null,2));console.log(JSON.stringify({summary,errors}));
}finally{await browser.close()}
