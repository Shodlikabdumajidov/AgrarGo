const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{

  const prisma=new PrismaClient(); const sph=rnd(), fph=rnd(), dph=rnd(), mph=rnd();
  await prisma.user.create({data:{phone:sph,fullName:'Dispetcher C',role:'DISPATCHER',passwordHash:await bcrypt.hash(PW,4)}});
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer C',farmName:'Agro C',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market C',companyName:'Mkt C',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  const d=await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi C',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'CC',capacityKg:9000,region:'Samarqand'});
  const p=await call('/products',{name:'Pomidor C',category:'Sabzavot',quantityKg:5000,pricePerKg:3000},f.accessToken);
  const b1=await call('/bookings',{productId:p.id,quantityKg:300},m.accessToken); await call(`/bookings/${b1.id}/approve`,null,f.accessToken,'PATCH');
  const fu=await prisma.user.findFirst({where:{phone:fph}});
  const pts=async()=> (await prisma.user.findUnique({where:{id:fu.id}})).penaltyPoints;
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};

  // 1) MARKET: shikoyat yuboradi
  let pg=await open(mph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('complaints')); await pg.waitForTimeout(1200);
  ok(await pg.locator('#dash-subnav').innerText().then(t=>/Shikoyatlar \/ Spam/.test(t)),'"Shikoyatlar / Spam" is in the cabinet menu (Profil group)');
  await pg.locator('[data-complaint-new]').click(); await pg.waitForTimeout(1000);
  const opts=await pg.locator('#whf-accusedId option').allInnerTexts(); console.log(opts);
  ok(opts.some(o=>/Fermer C/.test(o)),'partner dropdown lists order-history partners (farmer)');
  await pg.selectOption('#whf-accusedId',{index:1});
  await pg.fill('#whf-reason','Yukni asossiz bekor qildi va telefonga javob bermadi'); await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(()=>[...document.querySelectorAll('.toast-item')].map(t=>t.innerText).join('|')).then(t=>/3 ish kuni ichida/.test(t)),'confirmation toast: "...3 ish kuni ichida ko\'rib chiqiladi"');
  ok(await pg.locator('[data-complaint][data-status="PENDING"]').count()===1,'"Mening shikoyatlarim" shows status Kutilmoqda');
  await pg.context().close();

  // 2) DISPETCHER: qaror (to'liq asosli)
  pg=await open(sph,{width:1280,height:800});
  const dm=await pg.locator('#dash-tabs .dash-tab').allInnerTexts(); ok(dm.some(t=>/Shikoyatlar/.test(t)),'dispatcher menu has Shikoyatlar / Spam');
  await pg.evaluate(()=>selectDashTab('admcomplaints')); await pg.waitForTimeout(1500);
  ok(await pg.locator('[data-complaint] button[data-decide]').count()===3,'3 decisions: Tolik asosli / Qisman asosli / Asossiz');
  await pg.locator('[data-complaint]').first().locator('button[data-decide="UPHELD"]').click(); await pg.waitForTimeout(700);
  await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(1800);
  ok((await pts())===1,'UPHELD -> accused gets +1 red star');
  await pg.context().close();

  // 3) belgi ko'rinadi: fermer profili va market katalogi
  pg=await open(fph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('profile')); await pg.waitForTimeout(1500);
  ok(await pg.locator('[data-own-penalty="1"]').count()===1,'farmer sees own red star in profile');
  await pg.context().close();
  pg=await open(mph,{width:1280,height:800}); await pg.waitForTimeout(1500);
  ok(await pg.locator('#mk-catalog-preview .penalty-badge[data-penalty="1"]').count()>=1,'red star badge next to the farmer in market catalog');

  // 4) shikoyatni qaytarib olish -> penalty ayriladi
  await pg.evaluate(()=>selectDashTab('complaints')); await pg.waitForTimeout(1200);
  await pg.locator('[data-complaint-withdraw]').click(); await pg.waitForTimeout(1800);
  ok((await pts())===0,'withdrawing the complaint removes the red star');
  ok(await pg.locator('[data-complaint][data-status="WITHDRAWN"]').count()===1,'status shows Qaytarib olindi');

  // 5) DQQ ogohlantirish modali (2+)
  await prisma.user.update({where:{id:fu.id},data:{penaltyPoints:2}});
  await pg.evaluate(()=>selectDashTab('overview')); await pg.waitForTimeout(1800);
  ok(await pg.locator('#mk-catalog-preview .penalty-badge[data-penalty="2"]').count()>=1,'badge shows 2');
  await pg.locator('#mk-catalog-preview article:has(.penalty-badge[data-penalty="2"]) button:has-text("Bron qilish")').first().click(); await pg.waitForTimeout(500);
  const txt=await pg.locator('#risk-modal').innerText(); console.log(txt.slice(0,160));
  ok(/DQQ OGOHLANTIRISHI/.test(txt)&&/red-flag \(2\/5 qizil daraja\)/.test(txt)&&/Ishlashni tasdiqlaysizmi\?/.test(txt),'official DQQ warning text shown');
  await pg.click('#risk-modal [data-risk="no"]'); await pg.waitForTimeout(400);
  ok(!(await pg.evaluate(()=>document.getElementById('booking-modal').classList.contains('open'))),'"Yo\'q, bekor qilish" cancels: no booking modal');
  await pg.locator('#mk-catalog-preview article:has(.penalty-badge[data-penalty="2"]) button:has-text("Bron qilish")').first().click(); await pg.waitForTimeout(400);
   await pg.click('#risk-modal [data-risk="yes"]'); await pg.waitForTimeout(500); 
  ok(await pg.evaluate(()=>document.getElementById('booking-modal').classList.contains('open')),'"Ha, davom ettirish" opens the booking modal');
  await pg.fill('#booking-qty','10'); await pg.click('#booking-form button[type=submit]'); await pg.waitForTimeout(2000);
  ok((await call('/bookings/mine',null,m.accessToken,'GET')).length===2,'booking created after acknowledging risk');
  await pg.context().close();

  // 6) AVTOMATIK BAN
  await prisma.user.update({where:{id:fu.id},data:{penaltyPoints:4.5}});
  const cc=await call('/complaints',{accusedId:fu.id,reason:'Yana bir asossiz bekor qilish holati yuz berdi'},m.accessToken);
  pg=await open(sph,{width:1280,height:800});
  await pg.evaluate(()=>{admComplaintFilter.status='PENDING';selectDashTab('admcomplaints')}); await pg.waitForTimeout(1500);
  await pg.locator('[data-complaint]:has-text("Fermer C") button[data-decide="PARTIAL"]').first().click(); await pg.waitForTimeout(700);
  await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(1800);
  const fb=await prisma.user.findUnique({where:{id:fu.id}}); ok(fb.penaltyPoints===5&&!fb.isActive&&fb.bannedAt,'PARTIAL +0.5 -> 5.0 -> account BANNED');
  ok((await prisma.product.findUnique({where:{id:p.id}})).status==='FROZEN','listings frozen');
  const r=await fetch(API+'/profile',{headers:{Authorization:'Bearer '+f.accessToken}}); ok(r.status===401,'banned user API access denied (401)');
  const lg=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:fph,password:PW})}); const lj=await lg.json(); ok(lg.status===401&&/BANNED/.test(lj.message),'login refused with BANNED message');
  console.log('errs',pg.errs);
  await b0.close(); await prisma.$disconnect();
})();
