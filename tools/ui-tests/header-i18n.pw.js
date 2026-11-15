const { chromium } = require('playwright-core'); const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const LB={drivers:[{name:'Ali Haydovchi',value:1200,owner:null}],farmers:[{name:'Agro Fermer',owner:'Vali',value:12}],markets:[{name:'Mega Market',owner:'Soli',value:30,orders:4}],daysLeft:16,lastMonth:null};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(vw,vh,{locale='uz-UZ',theme=null,lang=null,touch=false}={})=>{
    const ctx=await b.newContext({locale,viewport:{width:vw,height:vh},hasTouch:touch,isMobile:touch,serviceWorkers:'block'}); const pg=await ctx.newPage(); pg.errs=[]; pg.on('pageerror',e=>pg.errs.push(e.message));
    await pg.addInitScript(([t,l])=>{ window.tailwind=window.tailwind||{}; try{ if(t) localStorage.setItem('agrargo_theme',t); if(l) localStorage.setItem('agrargo_lang',l);}catch(e){} const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},[theme,lang]);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.route('https://agrargo-backend.onrender.com/leaderboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(LB)}));
    await pg.route('https://agrargo-backend.onrender.com/**',r=>{ if(r.request().url().endsWith('/leaderboard')) return r.fallback(); r.abort(); });
    await pg.goto('http://localhost:8080/index.html'); await pg.waitForTimeout(3300); pg.ctx=ctx; return pg; };
  const box=(pg,sel)=>pg.evaluate(s=>{const e=document.querySelector(s); if(!e||getComputedStyle(e).display==='none') return null; const r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};},sel);
  const overlap=(boxes)=>{const o=[]; for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i][1],c=boxes[j][1]; if(Math.min(a.r,c.r)-Math.max(a.l,c.l)>1&&Math.min(a.b,c.b)-Math.max(a.t,c.t)>1)o.push(boxes[i][0]+'x'+boxes[j][0]);} return o;};

  // 1. Sukut til: brauzer rus tilida bo'lsa ham O'zbekcha
  for(const loc of ['ru-RU','en-US','uz-UZ']){ const pg=await open(1280,800,{locale:loc});
    const r=await pg.evaluate(()=>({lang:document.documentElement.lang,cur:document.getElementById('lang-current').textContent,stored:localStorage.getItem('agrargo_lang'),h:document.querySelector('#hero-title').textContent}));
    ok(r.lang==='uz'&&r.cur==='UZ'&&!/[А-Яа-я]/.test(r.h),`first visit with browser locale ${loc}: site opens in Uzbek (lang=${r.lang}, switch=${r.cur})`); await pg.ctx.close(); }
  { const pg=await open(1280,800,{locale:'uz-UZ',lang:'ru'}); ok(await pg.evaluate(()=>document.documentElement.lang)==='ru','explicit user choice (localStorage=ru) is respected'); await pg.ctx.close(); }

  // 2. Mobil header (<1024): bitta ixcham qator
  for(const [vw,vh] of [[360,740],[375,812],[412,915],[768,1024]]){ const L=`[${vw}px]`; const pg=await open(vw,vh,{touch:true});
    ok(await pg.evaluate(()=>getComputedStyle(document.getElementById('top-util')).display)==='none',L+' top utility row (E\'lon Joylash + UZ) is gone on mobile/tablet');
    const nb=await box(pg,'#main-nav'); const lb=await box(pg,'#lang-btn'), th=await box(pg,'#theme-toggle'), st=await box(pg,'#nav-search-toggle'), au=await box(pg,'#auth-nav-btn'), lg=await box(pg,'#logo-link'), bg=await box(pg,'#nav-left button');
    ok(lb&&th&&au&&lg&&bg,L+' lang, theme, profile, logo, burger all visible');
    if(vw<768) ok(st!==null,L+' search button visible');
    const items=[['burger',bg],['logo',lg],['lang',lb],['theme',th],['auth',au]].concat(st?[['search',st]]:[]);
    ok(overlap(items).length===0,L+' header items do not overlap '+JSON.stringify(overlap(items)));
    ok(items.every(([n,x])=>x.l>=0&&x.r<=vw),L+' header items stay inside the viewport');
    if(vw<768){ const tops=items.map(x=>x[1].t); ok(Math.max(...tops)-Math.min(...tops)<14,L+' everything on ONE header row'); ok(nb.h<=76,L+' compact header height '+Math.round(nb.h)+'px'); }
    ok(!(await box(pg,'#nav-post-ad')),L+' header + button hidden (moved into the sidebar)');
    await pg.click('#lang-btn'); await pg.waitForTimeout(400); const mb=await box(pg,'#lang-menu'); ok(mb&&mb.l>=0&&mb.r<=vw&&mb.b<vh,L+' language menu opens fully on-screen'); 
    await pg.click('#lang-menu [data-lang="en"]'); await pg.waitForTimeout(500); ok(await pg.evaluate(()=>document.getElementById('lang-current').textContent)==='EN'&&await pg.evaluate(()=>document.documentElement.lang)==='en',L+' switching language from the header works (EN)');
    await pg.evaluate(()=>toggleSidebar()); await pg.waitForTimeout(800);
    const sp=await box(pg,'#sb-post-ad'); ok(sp&&sp.l>=0&&sp.r<=vw*0.95+4&&sp.t<260,L+' "+ Post an ad" is the top button inside the sidebar ('+(sp&&Math.round(sp.t))+'px)');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),L+' no horizontal scroll');
    ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close(); }

  // 3. Desktop: marquee + header
  for(const vw of [1024,1280,1440,1920]){ const L=`[${vw}px desktop]`; const pg=await open(vw,900);
    const m=await pg.evaluate(()=>{const t=document.querySelector('#top-util .tu-track'); const cs=getComputedStyle(t); const sets=t.querySelectorAll('.tu-set'); const txt=[...sets].map(s=>s.textContent.replace(/\s+/g,' '));
      return {anim:cs.animationName,state:cs.animationPlayState,dur:parseFloat(cs.animationDuration),n:sets.length,setW:sets[0].getBoundingClientRect().width,trackW:t.getBoundingClientRect().width,vw:innerWidth,txt,ids:document.querySelectorAll('[id="site-telegram"]').length,hasTg:[...sets].every(s=>s.querySelector('a[href*="t.me/agrargobot"]')),hasPh:[...sets].every(s=>s.querySelector('a[href^="tel:"]')),h:document.getElementById('top-util').getBoundingClientRect().height};});
    ok(m.anim==='tu-scroll'&&m.state==='running'&&m.dur>=20,L+' marquee is an infinite smooth animation ('+m.dur+'s, slow)');
    ok(m.trackW>=m.vw+m.setW-2&&m.n>=2,L+' enough copies so the loop never shows a gap ('+m.n+' sets, track '+Math.round(m.trackW)+'px)');
    ok(m.hasTg&&m.hasPh&&m.txt.every(t=>/@agrargobot/.test(t)&&/\+998 78 140 09 09/.test(t)&&/AgrarGo B2B Hub/.test(t)&&/Hamkorlik/.test(t)&&/Logistika Tariflari/.test(t)&&/Market\.uz Zanjiri/.test(t)&&/Omborxona/.test(t)),L+' marquee includes all links + @agrargobot + +998 78 140 09 09');
    ok(m.ids===1,L+' no duplicate element ids from the clones');
    const x0=await pg.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector('.tu-track')).transform).m41); await pg.waitForTimeout(700);
    const x1=await pg.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector('.tu-track')).transform).m41); ok(x1<x0,L+' it scrolls left (x '+x0.toFixed(1)+' -> '+x1.toFixed(1)+')');
    await pg.hover('#top-util'); await pg.waitForTimeout(250);
    const p1=await pg.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector('.tu-track')).transform).m41); await pg.waitForTimeout(700);
    const p2=await pg.evaluate(()=>({x:new DOMMatrix(getComputedStyle(document.querySelector('.tu-track')).transform).m41,s:getComputedStyle(document.querySelector('.tu-track')).animationPlayState}));
    ok(p2.s==='paused'&&Math.abs(p2.x-p1)<0.01,L+' hover pauses the marquee instantly');
    await pg.mouse.move(vw/2,500); await pg.waitForTimeout(700); ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('.tu-track')).animationPlayState)==='running','L'.slice(0,0)+L+' it resumes when the mouse leaves');
    // header: lang + post ad in the main row
    const lb=await box(pg,'#lang-btn'), pa=await box(pg,'#nav-post-ad'), au=await box(pg,'#auth-nav-btn'), th=await box(pg,'#theme-toggle'), fl=await box(pg,'#nav-right button[onclick*="scrollToMarket"]'), nb=await box(pg,'#main-nav'), se=await box(pg,'#nav-search');
    ok(lb&&pa&&au&&th,L+' UZ switch, + E\'lon, theme and profile are all in the main nav row');
    ok(lb.t>=nb.t&&lb.b<=nb.b&&pa.b<=nb.b&&au.b<=nb.b,L+' they sit inside the main nav bar');
    const its=[['lang',lb],['theme',th],['post',pa],['auth',au]].concat(fl?[['filters',fl]]:[]).concat(vw>=1280?[['search',se]]:[]);
    ok(overlap(its).length===0,L+' no overlaps in the header '+JSON.stringify(overlap(its)));
    ok(its.every(([n,x])=>x.r<=vw&&x.l>=0),L+' nothing is clipped');
    ok(lb.w>=44,L+' UZ language button always visible');
    await pg.click('#lang-btn'); await pg.waitForTimeout(400); const mb=await box(pg,'#lang-menu'); ok(mb&&mb.r<=vw&&mb.l>=0,L+' language dropdown fits'); await pg.click('#lang-menu [data-lang="ru"]'); await pg.waitForTimeout(500); ok(await pg.evaluate(()=>document.getElementById('lang-current').textContent)==='RU','L'.slice(0,0)+L+' switching language works');
    // marquee text is translated too
    ok(await pg.evaluate(()=>/Логистика|Тариф|Склад/i.test(document.querySelector('#top-util .tu-set').textContent)),L+' marquee labels translate (RU)');
    ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close(); }

  // 4. OYLIK REYTING (TOP-3) — bir qator
  for(const vw of [320,360,375,412,639]){ const pg=await open(vw,800,{touch:true});
    const t=await pg.evaluate(()=>{const e=document.getElementById('lb-title'); const cs=getComputedStyle(e); const rects=[...e.getClientRects()]; const r=document.createRange(); r.selectNodeContents(e); const lines=new Set([...r.getClientRects()].map(x=>Math.round(x.top))); return {fs:parseFloat(cs.fontSize),lines:lines.size,w:e.scrollWidth,cw:e.clientWidth,h:e.getBoundingClientRect().height,txt:e.textContent.trim(),vw:innerWidth,sw:document.documentElement.scrollWidth};});
    const exp=Math.min(Math.max(20,0.052*vw),36);
    ok(t.lines===1&&/TOP-3/.test(t.txt),`[${vw}px] "${t.txt}" is on ONE line (${t.lines} line)`);
    ok(Math.abs(t.fs-exp)<1.2,`[${vw}px] font-size clamp(1.25rem,5.2vw,2.25rem) = ${t.fs.toFixed(1)}px (expected ~${exp.toFixed(1)})`);
    ok(t.sw<=t.vw+1&&t.w<=t.cw+1,`[${vw}px] title not clipped, no horizontal scroll`); await pg.ctx.close(); }
  { const pg=await open(1280,800); const fs=await pg.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('lb-title')).fontSize)); ok(fs>=44,'desktop title keeps its large size ('+fs+'px)'); await pg.ctx.close(); }

  // 5. Dinamik matnlar (reyting taymeri va h.k.) tanlangan tilga 100% o'giriladi
  { const pg=await open(375,812,{touch:true}); await pg.evaluate(()=>document.getElementById('leaderboard').scrollIntoView()); await pg.waitForTimeout(1200);
    const cd=()=>pg.evaluate(()=>document.getElementById('lb-countdown').textContent.trim());
    const cyr=()=>pg.evaluate(()=>/[А-Яа-яЁё]/.test(document.getElementById('leaderboard').innerText));
    const lat=()=>pg.evaluate(()=>/(Oy yakuniga|days left|Bu oyda|tonna|ta zakaz)/.test(document.getElementById('leaderboard').innerText));
    let c=await cd(); ok(/Oy yakuniga 16 kun qoldi/.test(c)&&!(await cyr()),'UZ: "'+c+'" (no Russian left)');
    const sw=async l=>{ await pg.click('#lang-btn'); await pg.waitForTimeout(250); await pg.click(`#lang-menu [data-lang="${l}"]`); await pg.waitForTimeout(700); };
    await sw('ru'); c=await cd(); ok(/До конца месяца осталось дней: 16/.test(c),'RU: "'+c+'"');
    await sw('en'); c=await cd(); ok(/16 days left/i.test(c)&&!(await cyr()),'EN: "'+c+'" — no Russian text remains in the section');
    ok(/tons?/i.test(await pg.evaluate(()=>document.getElementById('lb-farmers').innerText)),'EN: rows (units) translated too');
    await sw('uz'); c=await cd(); ok(/Oy yakuniga 16 kun qoldi/.test(c)&&!(await cyr()),'back to UZ: "'+c+'" (Russian did not stick)');
    await sw('ru'); await sw('uz'); ok(!(await cyr()),'RU -> UZ: page section is clean of Cyrillic');
    // butun sahifa: dinamik matnlarda rus harflari qolmasin (uz/en)
    const body=()=>pg.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); const bad=[]; let n; while(n=w.nextNode()){ const p=n.parentElement; if(!p||p.closest('#lang-menu,script,style,[translate="no"]'))continue; if(/[А-Яа-яЁё]/.test(n.textContent)&&p.offsetParent!==null) bad.push(n.textContent.trim().slice(0,40)); } return bad;});
    ok((await body()).length===0,'UZ page: no visible Cyrillic text '+JSON.stringify((await body()).slice(0,3)));
    await sw('en'); ok((await body()).length===0,'EN page: no visible Cyrillic text '+JSON.stringify((await body()).slice(0,3)));
    await pg.ctx.close(); }
  await b.close();
})();
