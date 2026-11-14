const { chromium } = require('playwright-core'); const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const VIEWPORTS=[['mobile 375x812',375,812],['mobile 412x915',412,915],['tablet 768x1024',768,1024]];
(async()=>{
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(vw,vh,theme,scheme)=>{
    const ctx=await b0.newContext({locale:'uz-UZ',viewport:{width:vw,height:vh},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block',colorScheme:scheme||'light'});
    const pg=await ctx.newPage(); pg.errs=[]; pg.on('pageerror',e=>pg.errs.push(e.message)); pg.ctx=ctx;
    await pg.addInitScript((t)=>{window.tailwind=window.tailwind||{}; try{ if(t) localStorage.setItem('agrargo_theme',t);}catch(e){} const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},theme);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.route('https://agrargo-backend.onrender.com/**',r=>r.abort());
    await pg.goto('http://localhost:8080/index.html'); await pg.waitForTimeout(3300); return pg; };
  const luma=c=>{const n=c.match(/[\d.]+/g).map(Number); return .2126*n[0]+.7152*n[1]+.0722*n[2];};
  const audit=async(pg,sel,label,theme)=>{
    const bad=await pg.evaluate(([sel,theme])=>{
      const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
      const page=theme==='light'?{r:245,g:240,b:235}:{r:2,g:6,b:23};
      const bgOf=el=>{let n=el; const st=[]; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){st.push(c); if(c.a>=.98)break;} n=n.parentElement;} let base=page; for(let i=st.length-1;i>=0;i--){const c=st[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;};
      const out=[]; const root=document.querySelector(sel); if(!root) return ['missing '+sel];
      root.querySelectorAll('*').forEach(el=>{ const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1); if(!own) return; const cs=getComputedStyle(el); let g=el,grad=false; while(g&&g!==root.parentElement){const gs=getComputedStyle(g); if(gs.backgroundImage.includes('gradient')||gs.backgroundImage.includes('url(')){grad=true;break;} g=g.parentElement;} if(grad) return; if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return; const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return; let p=el,hid=false; while(p&&p!==root){ if(getComputedStyle(p).display==='none'||getComputedStyle(p).visibility==='hidden'){hid=true;break;} p=p.parentElement;} if(hid) return;
        const fg=parse(cs.color); if(!fg||fg.a<.1) return; const bg=bgOf(el); const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(ratio<2.2) out.push(el.tagName+'.'+String(el.className).slice(0,30)+' "'+el.textContent.trim().slice(0,20)+'" '+ratio.toFixed(2)); });
      return out.slice(0,8);},[sel,theme]);
    ok(bad.length===0,`${label}: contrast OK ${JSON.stringify(bad)}`); };
  const swipe=async(pg,x1,y1,x2,y2)=>{ const c=await pg.ctx.newCDPSession(pg); await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]}); await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:(x1+x2)/2,y:(y1+y2)/2}]}); await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x2,y:y2}]}); await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await pg.waitForTimeout(900); };

  // ===== 1. Sukut tema: tizim dark bo'lsa ham Light =====
  for(const [name,vw,vh] of VIEWPORTS){
    const pg=await open(vw,vh,null,'dark');
    const r=await pg.evaluate(()=>({t:document.documentElement.dataset.theme,cs:getComputedStyle(document.documentElement).colorScheme,bg:getComputedStyle(document.body).backgroundColor,meta:document.querySelector('meta[name="color-scheme"]').content,mq:matchMedia('(prefers-color-scheme: dark)').matches}));
    ok(r.mq===true&&r.t==='light'&&/only light|light/.test(r.cs)&&r.meta==='only light','['+name+'] system prefers DARK but the site opens in LIGHT (color-scheme: '+r.cs+', meta: '+r.meta+')');
    ok(luma(r.bg)>200,'['+name+'] cream (not dark) page background '+r.bg);
    await pg.ctx.close();
  }
  // ===== 2-5. Har bir viewport x tema =====
  for(const theme of ['light','dark']) for(const [name,vw,vh] of VIEWPORTS){
    const L=`[${name} / ${theme}]`; const pg=await open(vw,vh,theme,theme);
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),L+' no horizontal scroll');
    // --- Hero: yonma-yon, ustma-ust tushmaydi, above the fold, bottom nav bilan to'qnashmaydi ---
    const g=await pg.evaluate(()=>{const R=s=>{const e=document.querySelector(s); if(!e) return null; const cs=getComputedStyle(e); if(cs.display==='none') return null; const r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
      const nav=document.getElementById('bottom-nav'); const navr=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect():null;
      return {stage:R('.cs-stage'),tag:R('#cs-tag'),title:R('#hero-title'),sub:R('#cs-sub'),cta:R('#cs-cta'),top:null,grid:R('#hero-header > .grid'),navTop:navr?navr.top:null,navH:navr?navr.height:0,vh:innerHeight,vw:innerWidth,fit:getComputedStyle(document.querySelector('.cs-video')).objectFit,ctrl:getComputedStyle(document.querySelector('.cs-ctrl')).display};});
    ok(g.stage.r<=g.title.l+1&&g.stage.r<=g.cta.l+1&&g.stage.r<=g.sub.l+1,L+' hero is side-by-side: video left, text right (video.right '+Math.round(g.stage.r)+' <= text.left '+Math.round(g.title.l)+')');
    ok(g.stage.w/g.grid.w<=0.46&&g.stage.w/g.grid.w>=0.3,L+' video column ~42-45% ('+Math.round(100*g.stage.w/g.grid.w)+'%)');
    ok(g.stage.h<=(vw>=641?300:260)+1,L+' video max-height '+(vw>=641?300:260)+'px ('+Math.round(g.stage.h)+')');
    ok(g.fit==='contain','L'.slice(0,0)+L+' video object-fit: contain');
    const boxes=[['stage',g.stage],['tag',g.tag],['title',g.title],['sub',g.sub],['cta',g.cta]].concat(g.top?[['badge',g.top]]:[]);
    const over=[]; for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++){ const a=boxes[i][1],c=boxes[j][1]; const ix=Math.min(a.r,c.r)-Math.max(a.l,c.l), iy=Math.min(a.b,c.b)-Math.max(a.t,c.t); if(ix>1&&iy>1) over.push(boxes[i][0]+'x'+boxes[j][0]); }
    ok(over.length===0,L+' hero elements do not overlap '+JSON.stringify(over));
    const limit=g.navTop!==null?g.navTop:g.vh;
    ok(g.cta.b<=limit-4&&g.stage.b<=limit-4,L+' whole hero fits above the fold, clear of the bottom nav (cta.bottom '+Math.round(g.cta.b)+' <= '+Math.round(limit)+')');
    ok(g.cta.r<=g.vw&&g.title.r<=g.vw&&g.sub.r<=g.vw,L+' text stays inside the viewport');
    ok(g.ctrl==='none',L+' < • • • > controls hidden on touch screens');
    const fs=await pg.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('hero-title')).fontSize)); ok(fs<=(vw>=641?31:23),L+' title font-size is compact ('+fs.toFixed(1)+'px)');
    await pg.screenshot({path:`ma-${vw}-${theme}-hero.png`});
    // --- Touch swipe ---
    const idx=()=>pg.evaluate(()=>HeroShowcase.index()); await pg.evaluate(()=>HeroShowcase.stop());
    const y=Math.round(g.stage.t+g.stage.h/2), x0=Math.round(vw*0.7);
    const i0=await idx(); await swipe(pg,x0,y,x0-120,y+4); ok(await idx()===(i0+1)%3,L+' swipe left -> next character');
    const txtNow=await pg.evaluate(()=>document.getElementById('cs-title-lead').textContent); ok(/Bo'sh yo'lingizni/.test(txtNow),L+' text changed with the swipe (driver)');
    await swipe(pg,x0-120,y,x0,y+4); ok(await idx()===i0,L+' swipe right -> previous character');
    await swipe(pg,x0,y,x0-20,y); ok(await idx()===i0,L+' short swipe (20px < 40px) does nothing');
    await swipe(pg,x0,y,x0-30,y+120); ok(await idx()===i0,L+' vertical scroll gesture does not switch');
    await swipe(pg,x0,y,x0-45,y+3); ok(await idx()===(i0+1)%3,L+' 45px swipe switches (>= 40px)');
    await swipe(pg,x0,y,x0+120,y); await swipe(pg,x0,y,x0+120,y); ok(await idx()===(i0+2)%3||await idx()!==i0,L+' swipe right wraps around');
    // --- Sidebar (Ekotizim menusi) ---
    await pg.evaluate(()=>window.scrollTo(0,0));
    await pg.evaluate(()=>toggleSidebar()); await pg.waitForTimeout(900);
    const sb=await pg.evaluate(()=>{const s=document.getElementById('sidebar'); const c=getComputedStyle(s); const r=s.getBoundingClientRect(); const a=document.querySelector('#sidebar a'); const ac=getComputedStyle(a); const sp=getComputedStyle(a.querySelector('span')); return {bg:c.backgroundColor,bf:c.backdropFilter,l:r.left,r:r.right,w:r.width,h:r.height,vh:innerHeight,abg:ac.backgroundColor,atx:sp.color,sh:ac.boxShadow};});
    ok(sb.l>=-1&&sb.r<=vw+1&&sb.h>=vh-2,L+' sidebar is fully visible (left '+Math.round(sb.l)+', width '+Math.round(sb.w)+')');
    if(theme==='light'){
      ok(sb.bg==='rgb(251, 249, 246)'&&(sb.bf==='none'||sb.bf==='')&&luma(sb.bg)>240,L+' sidebar is SOLID cream #FBF9F6 (no transparency/blur): '+sb.bg+' / '+sb.bf);
      ok(sb.abg==='rgb(245, 240, 235)'&&sb.atx==='rgb(45, 52, 54)'&&sb.sh!=='none',L+' section cards #F5F0EB with soft shadow, text #2D3436 ('+sb.abg+', '+sb.atx+')');
    } else ok(luma(sb.bg)<70,L+' sidebar stays dark in Dark Mode ('+sb.bg+')');
    await audit(pg,'#sidebar','sidebar',theme); await pg.screenshot({path:`ma-${vw}-${theme}-sidebar.png`});
    await pg.evaluate(()=>toggleSidebar()); await pg.waitForTimeout(700);
    // --- Bottom nav, kartalar, umumiy kontrast ---
    const bn=await pg.evaluate(()=>{const n=document.getElementById('bottom-nav'); const c=getComputedStyle(n); return {d:c.display,bg:c.backgroundColor};});
    if(bn.d!=='none') ok(theme==='light'?luma(bn.bg)>180:luma(bn.bg)<90,L+' bottom nav follows the theme ('+bn.bg+')'); else ok(vw>=768,L+' bottom nav hidden only on wide tablet');
    if(bn.d!=='none') await audit(pg,'#bottom-nav','bottom nav',theme);
    await audit(pg,'#hero-header','hero',theme);
    await pg.evaluate(()=>document.getElementById('leaderboard').scrollIntoView()); await pg.waitForTimeout(1200);
    const lb=await pg.evaluate(()=>getComputedStyle(document.querySelector('.lb-card')).backgroundColor);
    ok(theme==='light'?lb==='rgb(251, 249, 246)':luma(lb)<70,L+' leaderboard cards adapt to the theme ('+lb+')');
    await audit(pg,'#leaderboard','leaderboard',theme);
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),L+' still no horizontal scroll after navigating');
    ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close();
  }
  await b0.close();
})();
