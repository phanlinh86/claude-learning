const { chromium } = require('playwright'); const path=require('path');
const GAME='file://'+path.resolve('game/index.html');
(async()=>{const b=await chromium.launch({args:['--allow-file-access-from-files']});
for (const [n,o] of Object.entries({iphoneL:{viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true},iphoneP:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true},w800:{viewport:{width:800,height:600}},ipad:{viewport:{width:820,height:1180},deviceScaleFactor:2,isMobile:true,hasTouch:true},se:{viewport:{width:667,height:375},deviceScaleFactor:2,isMobile:true,hasTouch:true}})){
 const c=await b.newContext(o);const p=await c.newPage();await p.goto(GAME+'?mute=1');await p.waitForFunction(()=>window.DJ&&DJ.debug&&DJ.debug.mode==='title');
 for (const s of ['scrTitle','scrHow','scrSettings','scrCustom','scrPause','scrOver']){
  const r=await p.evaluate(s=>{DJ.UI.show(s);const out=[];document.querySelectorAll('#'+s+' .slot, #'+s+' .panel, #'+s+' .btn, #'+s+' .title-wrap').forEach(e=>{const R=e.getBoundingClientRect(); if(R.width===0) return; if(e.scrollWidth>e.clientWidth+1||R.right>innerWidth+1||R.bottom>innerHeight+1||R.top<-1||R.left<-1) out.push((e.className||e.tagName)+' sw'+e.scrollWidth+'/cw'+e.clientWidth+' b'+Math.round(R.bottom)+' r'+Math.round(R.right))});
   const fs=[...document.querySelectorAll('#'+s+' *')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize)); 
   return {out, minFont: fs.length?Math.min(...fs):null};},s);
  console.log(n,s,JSON.stringify(r));
 }
 await c.close();}
await b.close();})();
