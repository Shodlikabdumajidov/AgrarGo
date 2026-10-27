const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{
  const prisma=new PrismaClient(); const aph=rnd(), sph=rnd(), fph=rnd(), dph=rnd(), mph=rnd(), m2ph=rnd();
  for (const [ph,role,extra] of [[aph,'ADMIN',{adminRole:'SUPER_ADMIN'}],[sph,'DISPATCHER',{}]]) await prisma.user.create({data:{phone:ph,fullName:role+' T',role,...extra,passwordHash:await bcrypt.hash(PW,4)}});
  const login=async(ph)=>(await call('/auth/login',{phone:ph,password:PW})).accessToken; const at=await login(aph); const st=await login(sph);
  const sUser=await prisma.user.findUnique({where:{phone:sph}});
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer T',farmName:'Agro T',region:'Samarqand',district:'Siyob',address:'x 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market T',companyName:'Mkt',region:'Samarqand',district:'Siyob',address:'Bunyodkor 12'});
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



  const hub=await call('/hubs',{name:'T Hub '+Date.now()%10000,region:'Samarqand',district:'Siyob',address:'Sanoat 5'},at);
  await call('/hubs/'+hub.id+'/staff',{userId:sUser.id},at);
  const hp=await call('/products',{name:'Kartoshka H',category:'Sabzavot',quantityKg:1000,pricePerKg:3000},f.accessToken);
  const it=await call('/hub/intakes',{productId:hp.id,hubId:hub.id,declaredKg:1000,retailPricePerKg:4500,minOrderKg:10},f.accessToken);
  await call('/hub/intakes/'+it.id+'/receive',{receivedKg:980},st);

  // ---------- MARKET: Hub zaxirasi ----------
  let pg=await open(mph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('overview')); await pg.waitForTimeout(800);
  let pl=await pills(pg); console.log(pl);
  ok(pl.some(x=>/Hub zaxirasi/.test(x))&&pl.some(x=>/Fermer e'lonlari/.test(x)),'catalog has separate tabs: Fermer e\'lonlari / Hub zaxirasi');
  await pg.locator('#dash-subnav .dp-pill:has-text("Hub zaxirasi")').click(); await pg.waitForTimeout(1500);
  ok(await pg.locator('#lm-results .lc-card, #lm-results article').count()>0,'Hub stock products listed for Market');
  await pg.evaluate(async()=>{const items=await authed('GET','/local/market?region=Samarqand');openLocalOrder(items.find(i=>/Kartoshka H/.test(i.name))||items[0],20);});
  await pg.waitForTimeout(600); await pg.click('#lo-buy'); await pg.waitForTimeout(800);
  ok(await pg.inputValue('#lo-address')!=='' ,'order form prefilled from Market profile');
  await pg.click('#lo-buy'); await pg.waitForTimeout(2200); console.log('ALERT:',await pg.locator('#lo-alert').innerText());
  const lo=await call('/local/orders/mine',null,m.accessToken,'GET'); ok(lo.length===1&&lo[0].status==='PENDING','Market placed Hub order via UI');
  await pg.evaluate(()=>selectDashTab('lorders')); await pg.waitForTimeout(1200);
  ok(await pg.locator('#dash-content').innerText().then(t=>/Kartoshka H/.test(t)),'Hub order visible in "Hub buyurtmalari"');
  console.log('errs',pg.errs); await pg.context().close();

  // ---------- DISPETCHER PANELI ----------
  const dp=await call('/driver-posts',{status:'AVAILABLE',trailerType:'DRY_VAN',capacityKg:9000,routes:['Samarqand ↔ Toshkent'],currentLocation:'Samarqand sh.',loadMode:'FTL'},d.accessToken);
  pg=await open(sph,{width:1280,height:800});
  const dm=await menu(pg); console.log(dm); ok(/Dispetcher paneli/.test(dm[0]),'dispatcher menu starts with Dispetcher paneli');
  ok(await pg.locator('#dash-content h2:has-text("Dispetcher paneli")').count()===1,'dispatcher lands on the panel');
  const cards=await pg.locator('[id^="dsp-"]:not(#dsp-drivers)').count(); const apiN=(await call('/shipments/unassigned',null,st,'GET')).length; ok(cards===apiN&&cards>=2,'panel lists unassigned loads ('+cards+')');
  const enabled=pg.locator('button[data-assign]:not([disabled])'); ok(await enabled.count()>=1,'assign button enabled for escrow-paid load');
  await enabled.first().click(); await pg.waitForTimeout(1200);
  ok(await pg.locator('#dsp-drivers button[data-driver]').count()>=1,'modal lists available drivers');
  await pg.locator('#dsp-drivers button[data-driver]').first().click(); await pg.waitForTimeout(1800);
  const dmine=await call('/shipments/mine',null,d.accessToken,'GET'); ok(dmine.length===1&&dmine[0].status==='LOADING','driver got the load after assignment');
  await pg.waitForTimeout(800); const after=await pg.locator('[id^="dsp-"]:not(#dsp-drivers)').count(); console.log('cards',cards,after); ok(after===cards-1,'assigned load removed from panel');
  await pg.screenshot({path:'p72-dispatch.png'});
  console.log('errs',pg.errs); await pg.context().close();
  await b0.close(); await prisma.$disconnect();
})();
