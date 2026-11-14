const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{


  const prisma=new PrismaClient(); const fph=rnd(), dph=rnd(), mph=rnd();
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer L',farmName:'Agro L',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market L',companyName:'Mkt L',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  const d=await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi L',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'LL',capacityKg:9000,region:'Samarqand'});
  const p=await call('/products',{name:'Pomidor L',category:'Sabzavot',quantityKg:5000,pricePerKg:3000},f.accessToken);
  const bk=await call('/bookings',{productId:p.id,quantityKg:1500},m.accessToken); await call(`/bookings/${bk.id}/approve`,null,f.accessToken,'PATCH'); await call('/payments/init',{bookingId:bk.id},m.accessToken);
  const sh=(await call('/shipments/mine',null,m.accessToken,'GET'))[0]; await call('/shipments/'+sh.id+'/accept',null,d.accessToken);
  const row=await prisma.shipment.findUnique({where:{id:sh.id}}); await call('/shipments/'+sh.id+'/confirm-pickup',{pin:row.pickupPin},f.accessToken);
  const pay0=await prisma.payment.findFirst({where:{bookingId:bk.id}}); const KM=pay0.distanceKm; console.log('km',KM);
  await prisma.driver.updateMany({data:{monthlyKm:0}}); await prisma.farmer.updateMany({data:{monthlySotuvTons:0}}); await prisma.market.updateMany({data:{monthlyXaridTons:0,monthlyOrders:0}});
  // TOP-3 ko'rsatkichlari: boshqa foydalanuvchilar uchun qo'lda to'ldiriladi
  const dr=await prisma.driver.findFirst({where:{user:{phone:dph}}});
  for (const [i,km] of [[1,980],[2,640],[3,410]]) { const u=await call('/auth/driver/register',{phone:rnd(),password:PW,fullName:'Top Haydovchi '+i,vehicleType:'Isuzu',plateNumber:'0'+(i+1)+'A'+(300+Math.floor(Math.random()*600))+'TT',capacityKg:9000,region:'Buxoro'}); await prisma.driver.updateMany({where:{user:{phone:u.user.phone}},data:{monthlyKm:km}}); }
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};


  // --- Bosh sahifa: e'lonlar ro'yxati yo'q, reyting bor ---
  let pg=await open(mph,{width:1280,height:900});
  await pg.evaluate(()=>{closeDashboard()}); await pg.waitForTimeout(800);
  ok(await pg.locator('#leaderboard').isVisible(),'main page shows the OYLIK REYTING (TOP-3) block');
  ok(await pg.locator('#market-grid').isVisible()===false,'listings grid is not on the main page');
  ok(await pg.locator('#leaderboard h3').allInnerTexts().then(a=>a.join('|')).then(t=>/TOP Haydovchilar/.test(t)&&/TOP Fermerlar/.test(t)&&/TOP Marketlar/.test(t)),'3 categories: Haydovchilar / Fermerlar / Marketlar');
  await pg.waitForTimeout(1200);
  const rows=await pg.locator('#lb-drivers .lb-row').allInnerTexts(); console.log(rows.map(r=>r.replace(/\n/g,' ')));
  ok(rows.length===3&&/980 km/.test(rows[0])&&/640 km/.test(rows[1])&&/410 km/.test(rows[2]),'TOP Haydovchilar: top-3 sorted by km (980/640/410)');
  ok(await pg.locator('#lb-countdown').innerText().then(t=>/kun qoldi/.test(t)),'countdown to month end shown');
  // --- Katalog alohida oyna ---
  await pg.fill('#market-search','Pomidor'); await pg.click('#market-search-btn'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(()=>document.getElementById('catalog-view').classList.contains('open')),'nav search opens the Katalog window');
  ok(await pg.locator('#market-grid article').count()>=1,'Katalog lists farmers\' listings');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
  ok(!(await pg.evaluate(()=>document.getElementById('catalog-view').classList.contains('open'))),'Esc closes the Katalog');
  await pg.evaluate(()=>openCatalog()); await pg.waitForTimeout(400); await pg.click('#catalog-view .catalog-bar button'); await pg.waitForTimeout(400);
  ok(!(await pg.evaluate(()=>document.getElementById('catalog-view').classList.contains('open'))),'"Bosh sahifa" button closes the Katalog');
  await pg.context().close();

  // --- Haydovchi: PIN bilan topshirish -> animatsiya + ovoz + reyting ---
  const mkRow=await prisma.shipment.findUnique({where:{id:sh.id}});
  pg=await open(dph,{width:1280,height:900});
  await pg.evaluate(()=>{window.__plays=[];const o=sfx.play.bind(sfx);sfx.play=function(n){window.__plays.push(n);return o(n)};});
  await pg.evaluate(()=>selectDashTab('myloads')); await pg.waitForTimeout(1800);
  ok(await pg.locator('#my-rating-chip').isVisible(),'"Reytingim" chip in the cabinet header');
  await pg.locator('[data-pin-entry] input').fill(mkRow.deliveryPin); await pg.evaluate(()=>document.querySelector('[data-pin-entry] button').click()); await pg.waitForTimeout(900);
  ok(await pg.locator('#success-burst .tick').count()===1,'green check animation shown');
  ok((await pg.evaluate(()=>window.__plays)).includes('victory'),'victory sound effect played');
  await pg.waitForTimeout(1200);
  const fly=await pg.locator('#lb-fly').innerText().catch(()=>''); console.log('FLY',fly);
  ok(new RegExp('\\+'+KM+' km').test(fly)&&/Reytingga qo'shildi/.test(fly),'flying text "+'+KM+' km Reytingga qo\'shildi!"');
  const pos1=await pg.evaluate(()=>{const e=document.getElementById('lb-fly');const r=e.getBoundingClientRect();return [r.left,r.top]});
  await pg.waitForTimeout(600);
  const pos2=await pg.evaluate(()=>{const e=document.getElementById('lb-fly');if(!e)return null;const r=e.getBoundingClientRect();return [r.left,r.top]});
  ok(pos2===null||Math.abs(pos2[0]-pos1[0])+Math.abs(pos2[1]-pos1[1])>20,'text flies toward the Reytingim chip');
  await pg.waitForTimeout(2500);
  ok(await pg.locator('#lb-fly').count()===0,'flying text disappears after reaching the chip');
  ok(await pg.locator('#my-rating-val').innerText().then(t=>new RegExp(String(KM)).test(t.replace(/\s/g,''))),'Reytingim shows +'+KM+' km');
  const dd=await prisma.driver.findUnique({where:{id:dr.id}}); ok(dd.monthlyKm===KM,'driver monthlyKm = '+KM);
  await pg.click('#my-rating-chip'); await pg.waitForTimeout(800);
  ok(await pg.locator('#wh-body').innerText().then(t=>/o'rin/.test(t)),'Reytingim modal shows the position');
  console.log('errs',pg.errs);
  await b0.close(); await prisma.$disconnect();
})();
