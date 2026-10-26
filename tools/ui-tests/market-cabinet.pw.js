const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{
  const fph=rnd(), dph=rnd(), mph=rnd();
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer T',farmName:'Agro T',region:'Samarqand',district:'Siyob',address:'x 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market T',companyName:'Mkt',region:'Toshkent shahri',district:'Chilonzor',address:'y 7'});
  const d=await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi T',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'ZZ',capacityKg:9000,region:'Samarqand'});
  const p=await call('/products',{name:'Pomidor T',category:'Sabzavot',quantityKg:5000,pricePerKg:3000,harvestDate:'2026-09-05'},f.accessToken);
  for (const kg of [300,2500]) { const b=await call('/bookings',{productId:p.id,quantityKg:kg},m.accessToken); await call(`/bookings/${b.id}/approve`,null,f.accessToken,'PATCH'); await call('/payments/init',{bookingId:b.id},m.accessToken); }
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};
  const menu=(pg)=>pg.locator('#dash-tabs .dash-tab').allInnerTexts().then(a=>a.map(t=>t.trim().replace(/\s+/g,' ')));
  const pills=(pg)=>pg.locator('#dash-subnav .dp-pill').allInnerTexts();
  const active=(pg)=>pg.evaluate(()=>{const a=document.querySelector('.dash-tab.active');return a&&a.dataset.tab});


  const dp=await call('/driver-posts',{status:'AVAILABLE',trailerType:'DRY_VAN',capacityKg:9000,routes:['Samarqand ↔ Toshkent'],currentLocation:'Samarqand sh.',loadMode:'FTL'},d.accessToken);
  const bks=await call('/bookings/mine',null,m.accessToken,'GET');
  // ---------- MARKET (desktop) ----------
  let pg=await open(mph,{width:1280,height:800});
  let mn=await menu(pg); console.log(mn);
  ok(mn.length===4,'market menu has exactly 4 sections');
  ok(!mn.some(t=>/Haydovchi|Post|Omborxona|Ombor/i.test(t)),'no Haydovchilar / Postlar / Omborxona in market menu');
  ok(/Katalog/.test(mn[0])&&/buyurtma/i.test(mn[1])&&/Moliya/.test(mn[2])&&/Profil/.test(mn[3]),'sections: Katalog, Buyurtmalarim, Moliya, Profil');
  await pg.waitForTimeout(1200);
  ok(await pg.locator('#mk-catalog-preview article').count()>0,'catalog preview shows farmers\' ready products');
  await pg.locator('#mk-catalog-preview article button').first().click(); await pg.waitForTimeout(500);
  ok(await pg.evaluate(()=>document.getElementById('booking-modal').classList.contains('open')),'booking modal opens from cabinet catalog');
  await pg.evaluate(()=>closeBookingModal&&closeBookingModal());
  const tabs=pg.locator('#dash-tabs .dash-tab');
  await tabs.nth(1).click(); await pg.waitForTimeout(900); console.log(await pills(pg)); ok((await pills(pg)).length===4,'orders section has 4 inner screens (bookings, offers, Hub orders, shipments)');
  await tabs.nth(2).click(); await pg.waitForTimeout(900); ok((await pills(pg)).length===2,'finance section: payments + cashback'); ok(await pg.locator('#dash-content').innerText().then(t=>/Excel|hisobot/i.test(t)),'monthly Excel report available in finance');
  await tabs.nth(3).click(); await pg.waitForTimeout(900); ok((await pills(pg)).length===5,'profile section has sub-screens (incl. Shikoyatlar)');
  console.log('errs',pg.errs);
  await pg.context().close();

  // ---------- FERMER: haydovchiga biriktirish ----------
  pg=await open(fph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('shipments')); await pg.waitForTimeout(1500);
  const asg=pg.locator('button:has-text("Haydovchiga biriktirish")'); ok(await asg.count()>=1,'farmer shipment card has "Haydovchiga biriktirish"');
  await asg.first().click(); await pg.waitForTimeout(1000);
  ok(await pg.locator('#of-list .of-item').count()>=1,'driver picker lists driver posts');
  await pg.locator('#of-list .of-item').first().click(); await pg.waitForTimeout(300);
  await pg.click('#of-submit'); await pg.waitForTimeout(1500);
  const offs=await call('/driver-posts/offers/mine',null,d.accessToken,'GET'); ok(offs.length===1&&offs[0].open,'offer delivered to driver');
  await pg.context().close();

  // ---------- HAYDOVCHI: Mavjud yuklar ----------
  pg=await open(dph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('loads')); await pg.waitForTimeout(1800);
  ok(await pg.locator('#dp-offers').count()===1,'driver sees offered loads on top of "Mavjud yuklar"');
  await pg.locator('#dp-offers button:has-text("Yukni olish")').first().click(); await pg.waitForTimeout(1800);
  let mineS=await call('/shipments/mine',null,d.accessToken,'GET'); ok(mineS.length===1&&mineS[0].status==='LOADING','driver accepted the load from Mavjud yuklar');
  await call('/shipments/'+mineS[0].id+'/advance',null,d.accessToken,'PATCH');
  await pg.context().close();

  // ---------- MARKET: yo'lda va qabul ----------
  pg=await open(mph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('shipments')); await pg.waitForTimeout(1500);
  ok(await pg.locator('#dash-content').innerText().then(t=>/Yo'lda|IN_TRANSIT|yo'lda/i.test(t)),'market sees load on the road');
  ok(await pg.locator('button:has-text("Yukni qabul qildim")').count()===0,'no receive button before arrival');
  await call('/shipments/'+mineS[0].id+'/advance',null,d.accessToken,'PATCH');
  await pg.evaluate(()=>selectDashTab('shipments')); await pg.waitForTimeout(1500);
  ok(await pg.locator('button:has-text("Yukni qabul qildim")').count()===1,'receive button appears after arrival');
  await pg.locator('button:has-text("Yukni qabul qildim")').click(); await pg.waitForTimeout(2000);
  const pay=await call('/payments',null,m.accessToken,'GET'); const rel=(pay.items||pay).filter(x=>x.status==='RELEASED'); ok(rel.length===1,'escrow released after "Yukni qabul qildim"');
  ok(await pg.locator('button:has-text("Yukni qabul qildim")').count()===0,'button gone after release');
  console.log('errs',pg.errs);
  await pg.screenshot({path:'p71-market-shipments.png'});
  await pg.context().close();

  // ---------- MARKET mobil ----------
  pg=await open(mph,{width:390,height:800});
  const mb=await pg.evaluate(()=>{const s=document.getElementById('dash-tabs');const b=s.getBoundingClientRect();const items=[...s.querySelectorAll('.dash-tab')].map(t=>{const r=t.getBoundingClientRect();const sp=t.querySelector('span'),ic=t.querySelector('i');return {txt:sp.textContent.trim(),vis:r.left>=-1&&r.right<=innerWidth+1&&r.width>20,iconAbove:ic.getBoundingClientRect().bottom<=sp.getBoundingClientRect().top+4}});return {pos:getComputedStyle(s).position,bottom:Math.round(innerHeight-b.bottom),hs:document.documentElement.scrollWidth>innerWidth+1,items}});
  console.log(JSON.stringify(mb)); ok(mb.pos==='fixed'&&mb.bottom<=1,'mobile market bottom bar is fixed at bottom'); ok(mb.items.length===4&&mb.items.every(i=>i.vis),'all 4 tabs visible without scrolling'); ok(mb.items.every(i=>i.txt&&i.iconAbove),'each icon has a text label under it'); ok(!mb.hs,'no horizontal page scroll');
  await pg.locator('#dash-tabs .dash-tab').nth(1).click(); await pg.waitForTimeout(900);
  ok(await pg.evaluate(()=>document.querySelector('.dash-tab.active').dataset.tab)==='bookings','mobile: tapping a bottom tab switches section');
  await pg.screenshot({path:'p71-market-mobile.png'});
  await pg.evaluate(()=>Perf.set(true)); await pg.locator('#dash-tabs .dash-tab').nth(2).click(); await pg.waitForTimeout(700);
  ok(await pg.evaluate(()=>document.querySelector('.dash-tab.active').dataset.tab)==='payments','mobile + lite mode: tab click still works');
  console.log('errs',pg.errs);
  await b0.close();
})();
