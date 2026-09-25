import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const gpu = process.argv.includes('--webgpu');
const browser = await chromium.launch({headless:false,channel:'chromium',args:['--window-position=968,0','--window-size=904,1040','--ozone-platform=x11','--ignore-gpu-blocklist','--enable-unsafe-swiftshader',...(gpu?['--enable-unsafe-webgpu','--enable-gpu','--use-angle=vulkan','--enable-features=Vulkan']:[])]});
const page=await browser.newPage({viewport:{width:888,height:930}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.route('**/@vite/client',r=>r.fulfill({contentType:'text/javascript',body:''}));
const output='/tmp/ashdrive-benchmark';await mkdir(output,{recursive:true});
try{
 await page.goto(process.env.ASHDRIVE_URL || 'http://localhost:5173/apps/ashdrive/');
 await page.waitForFunction(()=>window.__app?.ready,null,{timeout:90000});
 const info=await page.evaluate(async()=>{const canvas=document.querySelector('canvas.webgl'), gl=canvas.getContext('webgl2');let hardware=null;if(gl){let e=gl.getExtension('WEBGL_debug_renderer_info');hardware=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}const adapter=await navigator.gpu?.requestAdapter();return{hardware,webgpu:!!adapter,adapter:adapter?.info?{vendor:adapter.info.vendor,device:adapter.info.device,description:adapter.info.description}:null}});console.log('GPU',JSON.stringify(info));
 await page.getByRole('button',{name:'AUTONOMOUS SORTIE'}).click();
 const samples=[];
 for(let i=0;i<6;i++){await page.waitForTimeout(5000);const s=await page.evaluate(()=>{const a=window.__app;return{fps:a.fps,quality:a.quality,performance:a.performance,health:a.health,kills:a.kills,mission:a.mission,mode:a.mode}});samples.push(s);console.log('SAMPLE',JSON.stringify(s));}
 await page.screenshot({path:output+(gpu?'/webgpu.png':'/optimized.png')});
 await writeFile(output+(gpu?'/webgpu.json':'/optimized.json'),JSON.stringify({info,samples,errors},null,2));
 console.log('ERRORS',errors);
}finally{await browser.close()}
