const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{



  const prisma=new PrismaClient(); const sph=rnd(), fph=rnd(), mph=rnd(), dph=rnd();
  await prisma.user.create({data:{phone:sph,fullName:'Dispetcher B',role:'DISPATCHER',passwordHash:await bcrypt.hash(PW,4)}});
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer B',farmName:'Agro B',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market B',companyName:'Mkt B',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  const d=await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi B',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'BB',capacityKg:9000,region:'Samarqand'});
  const p=await call('/products',{name:'Pomidor B',category:'Sabzavot',quantityKg:5000,pricePerKg:3000},f.accessToken);
  const bk=await call('/bookings',{productId:p.id,quantityKg:1500},m.accessToken); await call(`/bookings/${bk.id}/approve`,null,f.accessToken,'PATCH'); await call('/payments/init',{bookingId:bk.id},m.accessToken);
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};



  const pdfCheck=async(pg,btnSel,label)=>{
    const [popup]=await Promise.all([pg.context().waitForEvent('page',{timeout:8000}),pg.locator(btnSel).first().click()]);
    await popup.waitForLoadState('domcontentloaded').catch(()=>{}); await popup.waitForTimeout(1500);
    const url=popup.url(); ok(/^blob:/.test(url),label+': PDF opens in a new browser tab ('+url.slice(0,24)+'...)');
    const head=await popup.evaluate(async(u)=>{const r=await fetch(u);const b=new Uint8Array(await r.arrayBuffer());return {sig:String.fromCharCode(...b.slice(0,5)),size:b.length,type:r.headers.get('content-type')}},url).catch(()=>null);
    ok(head&&head.sig==='%PDF-'&&head.size>8000,label+': tab content is a real PDF ('+(head&&head.size)+' bytes)');
    await popup.close();
  };
  // MARKET: buyurtmalar tarixi (bronlar)
  let pg=await open(mph,{width:1280,height:900});
  await pg.evaluate(()=>selectDashTab('bookings')); await pg.waitForTimeout(1800);
  ok(await pg.locator('[data-bol] [data-bol-open]').count()>=1,'Market: orders history card has "BOL / Hisob-faktura PDF" button');
  ok(await pg.locator('[data-bol-open]').first().innerText().then(t=>/BOL \/ Hisob-faktura PDF/.test(t)),'button label');
  await pdfCheck(pg,'[data-bol-open]','Market booking');
  const [dl]=await Promise.all([pg.waitForEvent('download',{timeout:8000}),pg.locator('[data-bol-download]').first().click()]);
  ok(/^BOL-[0-9A-F]{8}\.pdf$/.test(dl.suggestedFilename()),'download button saves BOL-XXXXXXXX.pdf ('+dl.suggestedFilename()+')');
  // Moliya: to'lov kartasi -> Tafsilot -> BOL
  await pg.evaluate(()=>selectDashTab('payments')); await pg.waitForTimeout(1800);
  await pg.locator('.bd-link').first().click().catch(()=>{}); await pg.waitForTimeout(800);
  ok(await pg.locator('#bd-body [data-bol]').count()>=1,'Finance (payments) detail has the BOL button');
  await pg.context().close();
  // FERMER: yuk tashish
  pg=await open(fph,{width:1280,height:900});
  await pg.evaluate(()=>selectDashTab('shipments')); await pg.waitForTimeout(1800);
  ok(await pg.locator('[data-bol] [data-bol-open]').count()>=1,'Farmer: shipment card has the BOL button');
  await pdfCheck(pg,'[data-bol-open]','Farmer shipment');
  await pg.context().close();
  // DISPETCHER: panel
  pg=await open(sph,{width:1280,height:900});
  await pg.evaluate(()=>selectDashTab('dispatch')); await pg.waitForTimeout(1800);
  ok(await pg.locator('[id^="dsp-"] [data-bol-open]').count()>=1,'Dispatcher: panel card has the BOL button');
  await pdfCheck(pg,'[id^="dsp-"] [data-bol-open]','Dispatcher panel');
  console.log('errs',pg.errs);
  await b0.close(); await prisma.$disconnect();
})();
