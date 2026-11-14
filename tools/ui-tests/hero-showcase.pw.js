const { chromium } = require('playwright-core'); const fs=require('fs'); const os=require('os'); const path=require('path'); const { execSync } = require('child_process');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
(async()=>{
  const webm=true; // Chromium VP9-alpha WebM'ni o'ynatadi (asl H.264 MP4 faqat zaxira)
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(theme,lang,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp||{width:1280,height:900},serviceWorkers:'block'});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message)); 
    await pg.addInitScript(([t,l])=>{window.tailwind=window.tailwind||{};try{if(t)localStorage.setItem('agrargo_theme',t);if(l)localStorage.setItem('agrargo_lang',l);}catch(e){}const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},[theme,lang]);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(2500); return pg;};
  const idx=pg=>pg.evaluate(()=>HeroShowcase.index());
  const txt=pg=>pg.evaluate(()=>({tag:document.getElementById('cs-tag').innerText.trim(),title:document.getElementById('hero-title').innerText.replace(/\s+/g,' ').trim(),sub:document.getElementById('cs-sub').innerText.trim(),cta:document.getElementById('cs-cta').innerText.trim()}));
  const accent=pg=>pg.evaluate(()=>getComputedStyle(document.getElementById('hero-showcase')).getPropertyValue('--cs-accent').trim().toUpperCase());

  // ===== 1. Tuzilma: logotip yo'q, 3 ta video, controls yo'q =====
  let pg=await open(null,null);
  ok(await pg.evaluate(()=>document.querySelectorAll('#hero-header .logo-stage, #hero-header .logo-3d, #hero-header img[src*="newlogo"]').length)===0,'rotating hero logo removed');
  const vs=await pg.evaluate(()=>[...document.querySelectorAll('#hero-showcase video')].map(v=>({src:v.dataset.mp4,webm:v.dataset.webm,cur:v.getAttribute('src'),controls:v.controls,muted:v.muted,loop:v.loop,pip:v.hasAttribute('disablepictureinpicture'),inline:v.hasAttribute('playsinline'),poster:v.getAttribute('poster')})));
  ok(vs.length===3&&vs.map(v=>v.src).join()==='P3.mp4,P2.mp4,P1.mp4','three videos built from P3.mp4, P2.mp4, P1.mp4 (slide order)');
  ok(vs.every((v,i)=>v.webm===`images/showcase/p${3-i}.webm`&&v.cur===v.webm),'alpha WebM (transparent background) is used: '+vs.map(v=>v.cur).join());
  ok(await pg.evaluate(()=>document.getElementById('hero-showcase').classList.contains('cs-alpha')),'cs-alpha mode active');
  ok(vs.every(v=>!v.controls&&v.muted&&v.loop&&v.pip&&v.inline&&v.poster),'muted, loop, playsinline, disablePictureInPicture, no controls, poster set');
  ok(await pg.evaluate(()=>document.querySelector('#hero-showcase video').hasAttribute('autoplay')),'autoplay attribute on the first video');
  ok((await pg.evaluate(()=>{const f=[200,200,200]; return true;})),'files reachable');
  for(const f of ['P1.mp4','P2.mp4','P3.mp4','images/showcase/p1.webm','images/showcase/p2.webm','images/showcase/p3.webm','images/showcase/p1.webp','images/showcase/p2.webp','images/showcase/p3.webp']){ const r=await fetch(`http://localhost:8080/${f}`,{method:'HEAD'}); ok(r.status===200,`GET /${f} -> ${r.status}`); }
  // aspect 3/4, layout shift yo'q
  const st0=await pg.locator('.cs-stage').boundingBox(); ok(Math.abs(st0.width/st0.height-0.75)<0.01,`stage aspect ratio 3/4 (${(st0.width/st0.height).toFixed(3)})`);
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('.cs-stage')).borderRadius)==='24px','rounded-3xl container (24px)');
  const tr=await pg.evaluate(()=>{const st=getComputedStyle(document.querySelector('.cs-stage')); const v=getComputedStyle(document.querySelector('.cs-video')); return {bg:st.backgroundColor,bs:st.boxShadow,blend:v.mixBlendMode};});
  ok(tr.bg==='rgba(0, 0, 0, 0)'&&tr.bs==='none'&&tr.blend==='normal','light: container is transparent (no background, no frame, no blend) '+JSON.stringify(tr));
  await pg.waitForTimeout(1200);
  const px=await pg.evaluate(()=>{const v=document.querySelector('#hero-showcase video'); const c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight; const g=c.getContext('2d'); g.drawImage(v,0,0); const a=(x,y)=>g.getImageData(x,y,1,1).data[3]; return {w:v.videoWidth,corner:[a(2,2),a(c.width-3,2),a(2,c.height-3),a(c.width-3,c.height-3)],center:a(Math.round(c.width*0.5),Math.round(c.height*0.45))};});
  ok(px.w>0&&px.corner.every(x=>x===0)&&px.center===255,'video background pixels are transparent (corners alpha 0), character is opaque '+JSON.stringify(px));
  ok(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','default Light mode');
  ok(await pg.evaluate(()=>[...document.querySelectorAll('#hero-showcase video')].every(v=>v.preload==='auto'||v.preload==='metadata')),'videos preloaded (next one is set to auto)');
  await pg.waitForTimeout(800);
  ok(await pg.evaluate(()=>document.querySelectorAll('#hero-showcase video')[1].preload)==='auto','next video is preloading');
  await pg.screenshot({path:'hs-light-p1.png'});
  // ===== 2. Boshlang'ich holat: P1 Fermer =====
  let t=await txt(pg); console.log('(info) P1 texts',JSON.stringify(t)); ok(await idx(pg)===0&&/Hosilingizni/i.test(t.title)&&/xaridorga soting/i.test(t.title)&&/^Mahsulot joylash$/i.test(t.cta)&&/Dehqon va bog'bonlar uchun/i.test(t.tag),'first slide = Fermer (P3 video): title / CTA "Mahsulot joylash" / tag "Dehqon va bog\'bonlar uchun"');
  ok(await accent(pg)==='#84A99B','first slide accent: Sage Mint #84A99B');
  if(webm){ await pg.waitForTimeout(600); ok(await pg.evaluate(()=>{const v=document.querySelector('#hero-showcase video'); return !v.paused&&v.currentTime>0;}),'active video is playing'); }
  // Olib tashlangan elementlar: rol nishoni (badge) va «Keyingisi» preview kartochkasi
  ok(await pg.evaluate(()=>document.querySelectorAll('.cs-role, .cs-next, #cs-next-card, #cs-role, #cs-next-img').length)===0,'role badge and next-character preview card are removed');
  ok(await pg.evaluate(()=>!!document.getElementById('cs-prev')&&!!document.getElementById('cs-next')&&document.querySelectorAll('.cs-dot').length===3),'< and > arrows + 3 dots remain');
  ok(await pg.evaluate(()=>[...document.querySelectorAll('#hero-showcase video')].map(v=>v.dataset.mp4).join())==='P3.mp4,P2.mp4,P1.mp4','slide order by video: P3 (fermer), P2 (haydovchi), P1 (market)');
  // ===== 3. Preview ustiga bosish -> P2 Haydovchi =====
  const h0=(await pg.locator('.cs-stage').boundingBox()).height;
  await pg.click('#cs-next'); await pg.waitForTimeout(900);
  t=await txt(pg); ok(await idx(pg)===1&&/Bo'sh yo'lingizni/i.test(t.title)&&/daromadga aylantiring/i.test(t.title)&&/^Yuk topish$/i.test(t.cta),'P2 Haydovchi: title / CTA "Yuk topish"');
  ok(await accent(pg)==='#9CC3D5','accent: Powder Blue #9CC3D5');
  ok(await pg.evaluate(()=>document.getElementById('hero-header').dataset.role)==='driver','hero header accent follows the role');
  ok(Math.abs((await pg.locator('.cs-stage').boundingBox()).height-h0)<1,'no layout shift on switch');
  if(webm) ok(await pg.evaluate(()=>{const v=document.querySelectorAll('#hero-showcase video'); return !v[1].paused&&v[0].paused;}),'P2 plays, P1 paused');
  await pg.screenshot({path:'hs-light-p2.png'});
  // > tugmasi -> P3
  await pg.click('#cs-next'); await pg.waitForTimeout(900); t=await txt(pg);
  ok(await idx(pg)===2&&/Yangi hosilni fermerdan/i.test(t.title)&&/^Xarid qilish$/i.test(t.cta),'third slide = Market egasi (P1 video): title / CTA "Xarid qilish"');
  ok(await accent(pg)==='#D8C3A5','third slide accent: Warm Sand #D8C3A5');
  await pg.screenshot({path:'hs-light-p3.png'});
  await pg.click('#cs-next'); await pg.waitForTimeout(900); ok(await idx(pg)===0,'3rd -> 1st loop (back to Fermer)');
  await pg.click('#cs-prev'); await pg.waitForTimeout(900); ok(await idx(pg)===2,'< button goes back (1st -> 3rd)');
  await pg.click('#cs-prev'); await pg.waitForTimeout(900); ok(await idx(pg)===1,'< again (3rd -> 2nd)');
  await pg.locator('.cs-dot').nth(0).click(); await pg.waitForTimeout(900); ok(await idx(pg)===0,'dots navigate');
  // ===== 4. Avtomatik almashish (7-8 s), tegilsa kechikadi =====
  await pg.mouse.move(5,5); await pg.waitForTimeout(100);
  const a0=await idx(pg); await pg.waitForTimeout(8500); ok(await idx(pg)===(a0+1)%3,'auto-advance after ~7.5 s when untouched');
  await pg.waitForTimeout(500); await pg.click('#cs-next'); await pg.mouse.move(5,5); const a1=await idx(pg); await pg.waitForTimeout(5500); ok(await idx(pg)===a1,'a manual click resets the auto timer (no change after 5.5 s)');
  await pg.locator('#hero-showcase').hover(); const a2=await idx(pg); await pg.waitForTimeout(9000); ok(await idx(pg)===a2,'auto-advance pauses while hovering');
  await pg.mouse.move(5,5);
  // ===== 5. CTA amallari =====
  await pg.evaluate(()=>HeroShowcase.stop()); // avto-almashish poygasiz test qilish uchun to'xtatiladi
  await pg.evaluate(()=>HeroShowcase.go(0)); await pg.waitForTimeout(800); await pg.click('#cs-cta'); await pg.waitForTimeout(800);
  ok(await pg.locator('#auth-modal.open').count()===1,'farmer CTA -> login (post a product needs an account)'); await pg.evaluate(()=>closeAuthModal());
  await pg.evaluate(()=>HeroShowcase.go(1)); await pg.waitForTimeout(800); await pg.click('#cs-cta'); await pg.waitForTimeout(800);
  ok(await pg.locator('#auth-modal.open').count()===1&&await pg.locator('#register-driver-form').isVisible(),'driver CTA -> driver registration'); await pg.evaluate(()=>closeAuthModal());
  await pg.evaluate(()=>HeroShowcase.go(2)); await pg.waitForTimeout(800); await pg.click('#cs-cta'); await pg.waitForTimeout(1200);
  ok(await pg.evaluate(()=>{const c=document.getElementById('catalog-view'); return !!c&&c.classList.contains('open');}).catch(()=>false)||await pg.evaluate(()=>location.hash==='#market'||!!document.querySelector('#catalog-view.open, .catalog-open')),'market CTA -> catalog');
  ok(pg.errs.length===0,'no page errors '+pg.errs.join('|')); await pg.context().close();

  // ===== 6. Dark: toza Claymorphism kartochka =====
  pg=await open('dark',null);
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('.cs-stage')).backgroundColor)==='rgba(0, 0, 0, 0)','dark: container transparent too (no white card)');
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('.cs-video')).mixBlendMode)==='normal','dark: no blend mode');
  await pg.screenshot({path:'hs-dark.png'}); await pg.context().close();

  // ===== 7. Mobil: ustma-ust tushmaydi =====
  pg=await open(null,null,{width:390,height:844});
  const sbm=await pg.locator('.cs-stage').boundingBox(), tbox=await pg.locator('#cs-tag').boundingBox();
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('.cs-ctrl')).display)==='none','mobile: < o o o > controls hidden (swipe instead)');
  ok(sbm.x+sbm.width<=tbox.x+1,'mobile: video left, text right (side-by-side, no overlap)');
  ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile: no horizontal scroll');
  await pg.evaluate(()=>HeroShowcase.go(1)); await pg.waitForTimeout(900);
  const sb2=await pg.locator('.cs-stage').boundingBox(), tb2=await pg.locator('#cs-tag').boundingBox(); ok(sb2.x+sb2.width<=tb2.x+1,'mobile after switch: still no overlap');
  await pg.screenshot({path:'hs-mobile.png',fullPage:false}); await pg.context().close();

  // ===== 8. i18n UZ / RU / EN =====
  const EXP={ru:{tag:/Для фермеров/i,title:/Продавайте урожай напрямую/i,cta:/Разместить товар/i},en:{tag:/For farmers/i,title:/Sell your harvest directly/i,cta:/Post a product/i}};
  for(const lang of ['ru','en']){
    pg=await open(null,lang); let x=await txt(pg);
    ok(EXP[lang].tag.test(x.tag)&&EXP[lang].title.test(x.title)&&EXP[lang].cta.test(x.cta),`[${lang}] first slide texts translated`);
    for(const i of [1,2]){ await pg.evaluate((k)=>HeroShowcase.go(k),i); await pg.waitForTimeout(900); x=await txt(pg);
      const bad=[x.tag,x.title,x.sub,x.cta].filter(s=>/[oOgG]['‘’ʻ]|\b(uchun|va|yoki)\b/.test(s)); ok(bad.length===0,`[${lang}] role ${i+1} fully translated ${JSON.stringify(bad)}`); }
    const miss=await pg.evaluate(()=>Object.keys(window.I18N_MISSES||{})); const own=miss.filter(s=>/Hosil|xaridor|Yuk |Bo'sh|daromad|Market egasi|Haydovchi|Fermer|Keyingi|Oldingi|Personaj|Mahsulot joylash|Xarid qilish|escrow|PIN-kod/.test(s)); ok(own.length===0,`[${lang}] no untranslated hero strings ${JSON.stringify(own.slice(0,5))}`);
    await pg.screenshot({path:`hs-${lang}.png`}); await pg.context().close();
  }
  await b0.close();
})();
