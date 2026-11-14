const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{

  const fph=rnd(), dph=rnd(), mph=rnd();
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer U',farmName:'Agro U',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market U',companyName:'Mkt U',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  const d=await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi U',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'UU',capacityKg:9000,region:'Samarqand'});
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};

  const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
  // ---------- 1) FERMER: e'lon (Incoterms + rasm) ----------
  let pg=await open(fph,{width:1280,height:800});
  await pg.evaluate(()=>openProductModal()); await pg.waitForTimeout(500);
  await pg.fill('#prod-name','Pomidor UI'); await pg.selectOption('#prod-category','Sabzavot',{force:true}); await pg.fill('#prod-quantity','2000'); await pg.fill('#prod-price','3000');
  await pg.selectOption('#prod-payer','FARMER',{force:true});
  ok(await pg.evaluate(()=>document.getElementById('prod-payer').value)==='FARMER','Incoterms select: FARMER chosen');
  console.log('DBG',await pg.evaluate(()=>{const b=document.querySelector('#product-form button[type=submit]');const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({vis:r.width,top:t&&t.outerHTML.slice(0,100),open:document.getElementById('product-modal').classList.contains('open')})}));
  await pg.click('#product-form button[type=submit]'); await pg.waitForTimeout(800);
  const al=await pg.locator('#product-alert').innerText(); console.log('ALERT:',al,'|',await pg.evaluate(()=>document.getElementById('prod-category').value)); ok(/rasm/i.test(al),'submit without photo is blocked (at least 1 photo)');
  await pg.setInputFiles('#prod-photos',[{name:'a.png',mimeType:'image/png',buffer:PNG},{name:'b.png',mimeType:'image/png',buffer:PNG}]); await pg.waitForTimeout(300);
  ok(await pg.locator('#prod-photo-previews > div').count()===2,'two photo previews shown');
  await pg.setInputFiles('#prod-photos',[1,2,3,4,5].map(i=>({name:i+'.png',mimeType:'image/png',buffer:PNG}))); await pg.waitForTimeout(300);
  ok(await pg.locator('#prod-photo-previews > div').count()===5,'max 5 photos enforced in UI');
  await pg.click('#product-form button[type=submit]'); await pg.waitForTimeout(2500); console.log('ALERT2:',await pg.locator('#product-alert').innerText(), pg.errs);
  const prods=await call('/products',null,f.accessToken,'GET'); ok(prods.length===1&&prods[0].photos.length===5&&prods[0].deliveryPayer==='FARMER','product saved with 5 photos and deliveryPayer=FARMER');
  await pg.context().close();

  // ---------- 2) MARKET: galereya + taklif ----------
  pg=await open(mph,{width:1280,height:800});
  await pg.waitForTimeout(1500);
  ok(await pg.locator('#mk-catalog-preview [data-gallery="5"]').count()>=1,'catalog card shows photo gallery (5 photos)');
  ok(await pg.locator('#mk-catalog-preview').innerText().then(t=>/fermer hisobidan/i.test(t)),'card shows "Yetkazish: fermer hisobidan"');
  await pg.locator('#mk-catalog-preview [data-gallery] img').first().click(); await pg.waitForTimeout(400);
  ok(await pg.locator('#photo-lightbox img').count()===1,'clicking a photo opens the lightbox'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  ok(await pg.locator('#photo-lightbox').count()===0,'Esc closes lightbox');
  console.log('OFFERBTN',await pg.evaluate(()=>{const b=document.querySelector('#mk-catalog-preview .offer-btn');if(!b)return 'none';const r=b.getBoundingClientRect();let a=b,chain=[];while(a&&a!==document.body){const c=getComputedStyle(a);if(c.visibility==='hidden'||c.contentVisibility==='hidden'||c.display==='none'||c.opacity==='0')chain.push(a.tagName+'.'+String(a.className).slice(0,60)+' v='+c.visibility+' cv='+c.contentVisibility);a=a.parentElement}return JSON.stringify(chain)}));
  await pg.locator('#mk-catalog-preview .offer-btn').first().click(); await pg.waitForTimeout(600);
  await pg.fill('#whf-quantityKg','500'); await pg.fill('#whf-pricePerKg','2400'); await pg.fill('#whf-message','Doimiy xarid');
  await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(2000);
  let mo=await call('/offers/mine',null,m.accessToken,'GET'); ok(mo.length===1&&mo[0].status==='PENDING','Make-an-offer created via UI');
  ok(await pg.locator('[data-offer][data-status="PENDING"]').count()===1,'market sees own pending offer in "Takliflarim"');
  await pg.context().close();

  // ---------- 3) FERMER: qarshi taklif ----------
  pg=await open(fph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('offers')); await pg.waitForTimeout(1500);
  ok(await pg.locator('[data-offer][data-status="PENDING"]').count()===1,'farmer sees "Kutishdagi taklif"');
  ok(await pg.locator('[data-offer] button:has-text("Tasdiqlash")').count()===1&&await pg.locator('[data-offer] button:has-text("Rad etish")').count()===1&&await pg.locator('[data-offer] button:has-text("Qayta taklif")').count()===1,'farmer has Tasdiqlash / Rad etish / Qayta taklif');
  await pg.locator('[data-offer] button:has-text("Qayta taklif")').click(); await pg.waitForTimeout(500);
  await pg.fill('#whf-pricePerKg','2700'); await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(1800);
  const fo=await call('/offers/incoming',null,f.accessToken,'GET'); ok(fo[0].status==='COUNTERED'&&Number(fo[0].counter.pricePerKg)===2700,'counter offer sent (2700)');
  await pg.context().close();

  // ---------- 4) MARKET: qarshi taklifni qabul qiladi ----------
  pg=await open(mph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('offers')); await pg.waitForTimeout(1500);
  await pg.locator('[data-offer] button:has-text("Qabul qilish")').click(); await pg.waitForTimeout(2000);
  mo=await call('/offers/mine',null,m.accessToken,'GET'); ok(mo[0].status==='ACCEPTED'&&mo[0].bookingId,'market accepted the counter offer -> booking');
  const bk=await call('/bookings/mine',null,m.accessToken,'GET'); ok(Number(bk[0].pricePerKg)===2700&&bk[0].status==='APPROVED'&&bk[0].breakdown.deliveryPayer==='FARMER','booking at 2700, FARMER pays delivery');
  console.log('breakdown',JSON.stringify(bk[0].breakdown));
  await call('/payments/init',{bookingId:bk[0].id},m.accessToken);
  const sh=(await call('/shipments/mine',null,m.accessToken,'GET'))[0];
  await call('/shipments/'+sh.id+'/accept',null,d.accessToken);
  await pg.context().close();

  // ---------- 5) PIN: haydovchi / fermer / market ----------
  pg=await open(dph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('myloads')); await pg.waitForTimeout(1800);
  ok(await pg.locator('[data-pin-show]').count()===1,'driver sees own pickup PIN');
  ok(await pg.locator('button:has-text("Yo\'lga chiqdim")').count()===0,'old "Yo\'lga chiqdim" hidden when PIN enforced');
  const dpin=await pg.locator('[data-pin-show]').getAttribute('data-pin-show'); console.log('pickup pin',dpin);
  await pg.context().close();
  pg=await open(fph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('shipments')); await pg.waitForTimeout(1800);
  await pg.locator('[data-pin-entry] input').fill(dpin==='1234'?'4321':'1234'); await pg.locator('[data-pin-entry] button').click(); await pg.waitForTimeout(1200);
  ok((await call('/shipments/mine',null,d.accessToken,'GET'))[0].status==='LOADING','wrong PIN does not move the load');
  await pg.locator('[data-pin-entry] input').fill(dpin); await pg.locator('[data-pin-entry] button').click(); await pg.waitForTimeout(1800);
  ok((await call('/shipments/mine',null,d.accessToken,'GET'))[0].status==='IN_TRANSIT','farmer entered driver PIN -> IN_TRANSIT');
  await pg.context().close();
  pg=await open(mph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('shipments')); await pg.waitForTimeout(1800);
  ok(await pg.locator('[data-pin-show]').count()===1,'market sees own receiving PIN');
  const mpin=await pg.locator('[data-pin-show]').getAttribute('data-pin-show'); await pg.context().close();
  pg=await open(dph,{width:1280,height:800});
  await pg.evaluate(()=>selectDashTab('myloads')); await pg.waitForTimeout(1800);
  ok(await pg.locator('button:has-text("Yetkazib berdim")').count()===0,'driver cannot deliver without market PIN');
  await pg.locator('[data-pin-entry] input').fill(mpin); await pg.evaluate(()=>document.querySelector('[data-pin-entry] button').click()); await pg.waitForTimeout(2500); 
  const fin=(await call('/shipments/mine',null,d.accessToken,'GET'))[0]; ok(fin.status==='DELIVERED','driver entered market PIN -> DELIVERED');
  const pays=await call('/payments',null,m.accessToken,'GET'); const pl=(pays.items||pays); ok(pl[0].status==='RELEASED','escrow released automatically');
  console.log('errs',pg.errs);
  await b0.close();
})();
