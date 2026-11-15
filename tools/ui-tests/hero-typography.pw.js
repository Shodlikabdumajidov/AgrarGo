const { chromium } = require('playwright-core'); const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const lum=c=>{const n=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*n[0]+.7152*n[1]+.0722*n[2];};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(vw,vh,theme)=>{const ctx=await b.newContext({locale:'uz-UZ',viewport:{width:vw,height:vh},serviceWorkers:'block'}); const pg=await ctx.newPage(); pg.errs=[]; pg.on('pageerror',e=>pg.errs.push(e.message)); pg.ctx=ctx;
    await pg.addInitScript((t)=>{window.tailwind=window.tailwind||{}; try{localStorage.setItem('agrargo_theme',t);}catch(e){} const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},theme||'light');
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.route('https://agrargo-backend.onrender.com/**',r=>r.abort());
    await pg.goto('http://localhost:8080/index.html'); await pg.waitForTimeout(3300); await pg.evaluate(()=>HeroShowcase.stop()); return pg;};
  const box=(pg,s)=>pg.evaluate(s=>{const e=document.querySelector(s); if(!e||getComputedStyle(e).display==='none') return null; const r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};},s);
  const cs=(pg,s,p)=>pg.evaluate(([s,p])=>getComputedStyle(document.querySelector(s))[p],[s,p]);
  { const pg=await open(1440,900);
    const head=await pg.evaluate(()=>[...document.querySelectorAll('link[href*="fonts.googleapis.com/css2"]')].map(l=>l.href).join(' '));
    ok(/Plus\+Jakarta\+Sans:wght@[\d;]*600[\d;]*700[\d;]*800/.test(head)&&/family=Inter:wght@400;500;600/.test(head),'Google Fonts linked: Plus Jakarta Sans 600/700/800 + Inter 400/500/600');
    ok(/subset=latin,cyrillic/.test(head),'latin + cyrillic subsets requested');
    ok(await pg.evaluate(()=>!!document.querySelector('link[rel=preconnect][href*="fonts.gstatic.com"]')),'preconnect to fonts.gstatic.com');
    for(const sel of ['#hero-title','#lb-title','h2']){ const r=await pg.evaluate(s=>{const e=document.querySelector(s); const c=getComputedStyle(e); const fs=parseFloat(c.fontSize); return {ff:c.fontFamily,w:c.fontWeight,ls:parseFloat(c.letterSpacing)/fs,lh:parseFloat(c.lineHeight)/fs};},sel);
      ok(/Plus Jakarta Sans/.test(r.ff)&&r.w==='800'&&Math.abs(r.ls+0.025)<0.003&&Math.abs(r.lh-1.12)<0.01,`${sel}: Plus Jakarta Sans 800, tracking -0.025em, line-height 1.12 (${r.w}, ${r.ls.toFixed(3)}em, ${r.lh.toFixed(2)})`); }
    ok(/^"?Inter/.test(await cs(pg,'body','fontFamily'))&&/^"?Inter/.test(await cs(pg,'#cs-sub','fontFamily')),'body text uses Inter');
    // desktop hero
    ok(Math.abs(parseFloat(await cs(pg,'#hero-title','fontSize'))-54.4)<0.6,'desktop title = clamp(2.25rem,3.8vw,3.4rem) -> 54.4px @1440');
    ok(!(await box(pg,'.hero-slogan-m'))&&!!(await box(pg,'.hero-slogan-d')),'desktop: slogan stays inside the right column (mobile copy hidden)');
    const sl=await box(pg,'.hero-slogan-d'), tg=await box(pg,'#cs-tag'), ti=await box(pg,'#hero-title'), su=await box(pg,'#cs-sub'), cta=await box(pg,'#cs-cta');
    ok(sl.b<=tg.t&&tg.b<=ti.t+1&&ti.b<=su.t+1&&su.b<=cta.t+1,'desktop order: slogan > eyebrow > title > description > CTA, no overlap');
    const mw=await pg.evaluate(()=>{const e=document.getElementById('cs-sub'); return [parseFloat(getComputedStyle(e).maxWidth), e.getBoundingClientRect().width, parseFloat(getComputedStyle(e).fontSize)];}); ok(mw[1]<=mw[0]+1&&Math.abs(mw[0]-38*mw[2]*0.55)<mw[2]*10,'description max-width 38ch ('+Math.round(mw[0])+'px)');
    ok(await cs(pg,'#cs-sub','textWrap')==='balance'||await cs(pg,'#cs-sub','textWrapStyle')==='balance','description uses text-wrap: balance');
    await pg.ctx.close(); }
  for(const theme of ['light','dark']) for(const [vw,vh] of [[375,812],[412,915],[360,740],[768,1024]]){ const L=`[${vw}x${vh} ${theme}]`; const pg=await open(vw,vh,theme);
    const slm=await box(pg,'.hero-slogan-m'), sld=await box(pg,'.hero-slogan-d'), st=await box(pg,'.cs-stage'), tg=await box(pg,'#cs-tag'), ti=await box(pg,'#hero-title'), su=await box(pg,'#cs-sub'), cta=await box(pg,'#cs-cta'), grid=await box(pg,'#hero-header > .grid');
    ok(!!slm&&!sld,L+' shared slogan moved out of the right column to the top of the hero');
    ok(slm.b<=st.t+1&&slm.b<=tg.t+1,L+' slogan sits above BOTH columns (slogan.bottom '+Math.round(slm.b)+' <= video.top '+Math.round(st.t)+')');
    ok(Math.abs((slm.l+slm.r)/2-vw/2)<8&&slm.l>=0&&slm.r<=vw,L+' slogan centered and inside the viewport');
    ok(slm.h<=30,L+' compact slogan row ('+Math.round(slm.h)+'px)');
    ok(st.r<=ti.l+1&&st.w/grid.w<=.46,L+' bottom part is 2 columns: video left ~42%, text right');
    const sc=(st.t+st.b)/2, tc=(tg.t+cta.b)/2; ok(Math.abs(sc-tc)<=Math.max(30,st.h*.12),L+' video and text block vertically centered to each other (Δ '+Math.round(Math.abs(sc-tc))+'px)');
    const tgc=await pg.evaluate(()=>{const c=getComputedStyle(document.getElementById('cs-tag')); const d=c.display; const i=getComputedStyle(document.querySelector('#cs-tag i')); return {bw:c.borderTopWidth,bg:c.backgroundColor,fs:c.fontSize,w:c.fontWeight,ls:parseFloat(c.letterSpacing),tt:c.textTransform,dot:i.color,txt:c.color};});
    ok(tgc.bw==='0px'&&tgc.bg==='rgba(0, 0, 0, 0)'&&tgc.fs==='11px'&&tgc.w==='700'&&Math.abs(tgc.ls-0.88)<0.05&&tgc.tt==='uppercase',L+' eyebrow: no pill border/bg, 11px, 700, 0.08em, uppercase');
    const rolesInk=theme==='light'?['rgb(43, 106, 88)','rgb(44, 94, 122)','rgb(124, 83, 44)']:null; const bgc=theme==='light'?'rgb(245, 240, 235)':'rgb(2, 6, 23)';
    for(let i=0;i<3;i++){ await pg.evaluate(i=>HeroShowcase.go(i),i); await pg.waitForTimeout(700);
      const c=await cs(pg,'.hero-grad','color'), f=await cs(pg,'.hero-grad','webkitTextFillColor');
      if(rolesInk) ok(c===rolesInk[i]&&f===rolesInk[i],`${L} highlighted phrase colour #${i} = ${rolesInk[i]}`);
      ok(ratio(f,bgc)>=4.5,`${L} highlight contrast ${ratio(f,bgc).toFixed(2)}:1 (role ${i})`);
      const tcol=await cs(pg,'#cs-tag','color'); ok(ratio(tcol,bgc)>=(theme==='light'?4.5:4.5),`${L} eyebrow text contrast ${ratio(tcol,bgc).toFixed(2)}:1 (role ${i})`); }
    await pg.evaluate(()=>HeroShowcase.go(0)); await pg.waitForTimeout(600);
    const exp=Math.min(Math.max(20,vw*.05),26.4); ok(Math.abs(parseFloat(await cs(pg,'#hero-title','fontSize'))-exp)<.6,`${L} title clamp(1.25rem,5vw,1.65rem) = ${exp.toFixed(1)}px`);
    const sub=await pg.evaluate(()=>{const e=document.getElementById('cs-sub'),c=getComputedStyle(e); return {fs:parseFloat(c.fontSize),lh:parseFloat(c.lineHeight),col:c.color,tw:c.textWrap||c.textWrapStyle,mw:parseFloat(c.maxWidth),w:e.getBoundingClientRect().width,ff:c.fontFamily};});
    if(vw<641) ok(sub.fs===13&&Math.abs(sub.lh/sub.fs-1.45)<.01,L+' description 13px / line-height 1.45');
    ok(sub.col===(theme==='light'?'rgb(74, 85, 104)':'rgb(203, 213, 225)'),L+' description colour '+sub.col);
    ok(/balance/.test(sub.tw)&&sub.w<=sub.mw+1&&/Inter/.test(sub.ff),L+' description: text-wrap balance, <=38ch, Inter');
    ok(ratio(sub.col,bgc)>=4.5,L+' description contrast '+ratio(sub.col,bgc).toFixed(2)+':1');
    const ct=await pg.evaluate(()=>{const e=document.getElementById('cs-cta'),c=getComputedStyle(e),row=getComputedStyle(e.parentElement); return {pad:c.padding,w:c.fontWeight,sh:c.boxShadow,pt:row.paddingTop,col:c.color,bg:c.backgroundImage,rad:c.borderRadius};});
    ok(ct.pad==='10px 20px'&&ct.w==='700'&&ct.sh!=='none'&&ct.pt==='14px',L+' CTA: 14px above, padding 10px 20px, 700, clay shadow');
    const nav=await box(pg,'#bottom-nav'); const ctb=await box(pg,'#cs-cta'); ok(ctb.b<=(nav?nav.t:vh)-4,L+' whole hero still above the fold/bottom nav (cta.bottom '+Math.round(ctb.b)+')');
    const ov=[]; const bx=[['slogan',slm],['stage',await box(pg,'.cs-stage')],['tag',await box(pg,'#cs-tag')],['title',await box(pg,'#hero-title')],['sub',await box(pg,'#cs-sub')],['cta',ctb]]; for(let i=0;i<bx.length;i++)for(let j=i+1;j<bx.length;j++){const a=bx[i][1],c=bx[j][1]; if(Math.min(a.r,c.r)-Math.max(a.l,c.l)>1&&Math.min(a.b,c.b)-Math.max(a.t,c.t)>1) ov.push(bx[i][0]+'x'+bx[j][0]);} ok(ov.length===0,L+' no overlaps '+JSON.stringify(ov));
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),L+' no horizontal scroll');
    await pg.screenshot({path:`ht-${vw}-${theme}.png`}); ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close(); }
  // i18n: eyebrow + slogan translate (ru/en)
  { const pg=await open(375,812); await pg.evaluate(()=>I18N.setLang('en')); await pg.waitForTimeout(500);
    ok(/Uzbekistan/i.test(await pg.evaluate(()=>document.querySelector('.hero-slogan-m').textContent)),'EN: mobile slogan translated');
    ok(/farmers|For/i.test(await pg.evaluate(()=>document.getElementById('cs-tag').textContent)),'EN: eyebrow translated');
    await pg.evaluate(()=>I18N.setLang('ru')); await pg.waitForTimeout(500); ok(/Узбекистан/i.test(await pg.evaluate(()=>document.querySelector('.hero-slogan-m').textContent)),'RU: mobile slogan translated');
    await pg.ctx.close(); }
  await b.close();
})();
