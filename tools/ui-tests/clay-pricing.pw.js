const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json();}catch(e){}return {status:r.status,body:j};};
const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f645400000000049454e44ae426082','hex');
(async()=>{
  const fph=rnd(), mph=rnd(), dph=rnd();
  const f=(await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer CP',farmName:'Agro CP',region:'Samarqand',district:'Siyob',address:"Dehqon ko'chasi 5"})).body;
  const m=(await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market CP',companyName:'Mkt CP',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'})).body;
  const d=(await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi CP',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'CP',capacityKg:30000,region:'Samarqand'})).body;
  const mk=async(name,kg)=>{const p=(await call('/products',{name,category:'Sabzavot',quantityKg:20000,pricePerKg:3000},f.accessToken)).body; const bk=(await call('/bookings',{productId:p.id,quantityKg:kg},m.accessToken)).body; await call(`/bookings/${bk.id}/approve`,null,f.accessToken,'PATCH'); await call('/payments/init',{bookingId:bk.id},m.accessToken); const ship=(await call('/shipments/mine',null,f.accessToken,'GET')).body.find(s=>s.bookingId===bk.id); return {p,bk,ship};};
  const A=await mk('Pomidor CP-A',2000);
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,theme,lang,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp||{width:1280,height:900},serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()||undefined});const buf=Buffer.from(await resp.arrayBuffer());r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*'},body:buf});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(([t,l])=>{window.tailwind=window.tailwind||{}; try{ if(t) localStorage.setItem('agrargo_theme',t); if(l) localStorage.setItem('agrargo_lang',l);}catch(e){} const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},[theme,lang]);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(3200);
    if(ph){await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);}
    return pg;};
  const lumAudit=async(pg,rootSel,label)=>{
    const bad=await pg.evaluate((sel)=>{
      const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
      const bgOf=el=>{let n=el; const stack=[]; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){stack.push(c); if(c.a>=.98)break;} n=n.parentElement;} let base={r:245,g:240,b:235}; for(let i=stack.length-1;i>=0;i--){const c=stack[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;};
      const out=[]; const root=document.querySelector(sel); if(!root) return ['missing '+sel];
      root.querySelectorAll('*').forEach(el=>{ const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1); if(!own) return; const cs=getComputedStyle(el); let g=el, grad=false; while(g&&g!==root.parentElement){ const gs=getComputedStyle(g); if(gs.backgroundImage.includes('gradient')){grad=true;break;} g=g.parentElement;} if(grad) return; if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return; const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return; let p=el,hid=false; while(p&&p!==root){ if(getComputedStyle(p).display==='none'||getComputedStyle(p).visibility==='hidden'){hid=true;break;} p=p.parentElement;} if(hid) return;
        const fg=parse(cs.color); if(!fg) return; const bg=bgOf(el); const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(ratio<2.2) out.push(el.tagName+'.'+String(el.className).slice(0,30)+' "'+el.textContent.trim().slice(0,22)+'" '+ratio.toFixed(2)); });
      return out.slice(0,10);}, rootSel);
    ok(bad.length===0,label+': contrast OK '+JSON.stringify(bad)); };

  // ===== 1. Default LIGHT, hero rasmlari o'chiq, Claymorphism =====
  let pg=await open(null,null,null);
  ok(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','default theme is LIGHT (nothing stored)');
  ok(await pg.evaluate(()=>[...document.querySelectorAll('.hero-layer')].filter(e=>e.style.backgroundImage).length)===0,'light: rotating hero background images are not loaded');
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('.hero-bg')).display)!=='block'||await pg.evaluate(()=>[...document.querySelectorAll('.hero-layer')].every(e=>!e.style.backgroundImage)),'light: hero layers empty');
  const bodyBg=await pg.evaluate(()=>getComputedStyle(document.body).backgroundColor+'|'+getComputedStyle(document.body).backgroundImage);
  ok(/rgb\(245, 240, 235\)|#F5F0EB|250, 247, 244/i.test(bodyBg)||/gradient/.test(bodyBg),'cream background ('+bodyBg.slice(0,80)+')');
  ok(await pg.evaluate(()=>getComputedStyle(document.body).color)==='rgb(45, 52, 54)','text color #2D3436');
  await pg.screenshot({path:'cp-landing-light.png'});
  await pg.click('#theme-toggle'); await pg.waitForTimeout(2500);
  ok(await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark','toggle -> dark');
  ok(await pg.evaluate(()=>[...document.querySelectorAll('.hero-layer')].filter(e=>e.style.backgroundImage).length)>=1,'dark: hero background images run');
  ok(await pg.evaluate(()=>{const c=getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);return c[0]<40&&c[1]<40;}),'dark mode keeps the dark background');
  await pg.context().close();
  // saqlangan 'dark' tanlovi hurmat qilinadi
  pg=await open(null,'dark',null); ok(await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark','stored dark preference is respected'); await pg.context().close();

  // ===== 2. Soddalashtirilgan fermer formasi =====
  pg=await open(fph,null,null);
  await pg.evaluate(()=>openDashboard('products')); await pg.waitForTimeout(1800);
  await pg.evaluate(()=>openProductModal()); await pg.waitForTimeout(900);
  const vis=async(sel)=>pg.locator(sel).first().isVisible();
  ok(await vis('#prod-name')&&await vis('#prod-photos')&&await vis('#prod-quantity')&&await vis('#prod-unit')&&await vis('#prod-price')&&await vis('#prod-address'),'form shows only: name, photo, volume(kg/tonna), price, address');
  ok(!(await vis('#prod-category'))&&!(await vis('#prod-harvest'))&&!(await vis('#prod-payer')),'technical fields hidden (category, harvest date, delivery payer)');
  ok(await pg.locator('#product-form .auth-input:visible').count()+await pg.locator('#product-form input[type=file]:visible').count()<=7,'compact: few visible inputs');
  await pg.waitForTimeout(800);
  ok((await pg.inputValue('#prod-address')).includes('Dehqon'),'address prefilled from the farmer profile');
  await pg.screenshot({path:'cp-form-light.png'});
  await pg.fill('#prod-name','Bodring Tonna'); await pg.fill('#prod-quantity','2'); await pg.selectOption('#prod-unit','tonna'); await pg.fill('#prod-price','4000'); await pg.fill('#prod-address',"Yangi manzil, Urgut 7");
  await pg.setInputFiles('#prod-photos',{name:'p.png',mimeType:'image/png',buffer:PNG});
  await pg.click('#product-form .auth-submit'); await pg.waitForTimeout(2500);
  const list=(await call('/products',null,f.accessToken,'GET')).body; const bod=list.find(p=>p.name==='Bodring Tonna');
  ok(!!bod&&Number(bod.quantityKg)===2000,'2 tonna saved as 2000 kg');
  ok(bod&&bod.category==='Boshqa'&&bod.deliveryPayer==='BUYER','hidden fields get defaults (Boshqa / BUYER)');
  ok((await call('/profile',null,f.accessToken,'GET')).body.farmer.address==='Yangi manzil, Urgut 7','changed address saved to the profile');
  ok(pg.errs.length===0,'no page errors (form) '+pg.errs.join('|'));
  await lumAudit(pg,'#dash-content','Farmer listings (light default)');
  await pg.context().close();

  // ===== 3. Kalkulyator + narx oralig'i =====
  pg=await open(fph,null,null);
  await pg.evaluate(()=>openDashboard('shipments')); await pg.waitForTimeout(2200);
  await pg.locator('.fp-q').first().click(); await pg.waitForTimeout(500);
  ok(await pg.locator('.fp-pop [data-pb-calc]').count()===1,'formula popover has the road-fee calculator');
  const sel=pg.locator('.fp-pop [data-pb-calc] select');
  ok(await sel.count()===2,'fuel type + cargo type selects');
  const fuelOpts=await pg.locator('.fp-pop [data-fuel] option').allInnerTexts(), cargoOpts=await pg.locator('.fp-pop [data-cargo] option').allInnerTexts();
  ok(['Metan','Propan','Dizel'].every((x,i)=>fuelOpts[i]===x),'fuel options: Metan, Propan, Dizel ('+fuelOpts+')');
  ok(/Standart.*1/.test(cargoOpts[0])&&/Nozik.*1\.15/.test(cargoOpts[1])&&/Refrijerator.*1\.3/.test(cargoOpts[2]),'cargo options with x1.0 / x1.15 / x1.3 ('+cargoOpts+')');
  const rangeTxt=async()=>pg.locator('.fp-pop [data-pb-range]').innerText();
  const r0=await rangeTxt(); ok(/oralig/i.test(r0)&&/–/.test(r0),'price range shown ('+r0.replace(/\n/g,' | ')+')');
  const num=t=>t.match(/[\d\s]+(?=\s*so'm)/g).map(x=>Number(x.replace(/\s/g,'')));
  await pg.selectOption('.fp-pop [data-cargo]','REFRIGERATED'); await pg.selectOption('.fp-pop [data-fuel]','DIESEL'); await pg.waitForTimeout(200);
  const r1=await rangeTxt(); ok(num(r1)[0]>num(r0)[0],'range grows for diesel + refrigerator');
  const srv=(await call(`/pricing/road-fee?originRegion=Samarqand&destRegion=${encodeURIComponent('Toshkent shahri')}&weightKg=2000&fuel=DIESEL&cargo=REFRIGERATED`,null,m.accessToken,'GET')).body;
  const shown=num(r1); ok(shown[0]===srv.min&&shown[1]===srv.max&&shown[2]===srv.recommended,`UI range equals the server (${shown} vs ${srv.min},${srv.max},${srv.recommended})`);
  await pg.screenshot({path:'cp-calc-light.png'}); await pg.context().close();

  // ===== 4. Haydovchi narx taklifi + egasi qabul qiladi =====
  pg=await open(dph,null,null);
  await pg.evaluate(()=>openDashboard('loads')); await pg.waitForTimeout(2500);
  const bf=pg.locator('.gc-slide.is-active form[data-bid]');
  ok(await bf.count()===1,'driver: counter-offer (bid) input on an open load');
  const hint=await bf.innerText(); ok(/oralig/i.test(hint),'bid range hint shown');
  const fee=Number(A.ship.price.deliveryFee||A.ship.price.delivery||0)||null;
  const ph0=await bf.locator('input').getAttribute('placeholder'); const maxFee=Number(ph0), minFee=Number(await bf.locator('input').getAttribute('min'));
  await bf.locator('input').fill(String(maxFee+5000)); await bf.locator('button[type=submit]').click(); await pg.waitForTimeout(600);
  ok(await bf.locator('[data-bid-status]:not(.hidden)').count()===0,'out-of-range bid is rejected client-side');
  const myBid=Math.ceil(maxFee*0.85/1000)*1000;
  await bf.locator('input').fill(String(myBid)); await bf.locator('button[type=submit]').click(); await pg.waitForTimeout(1500);
  ok(await bf.locator('[data-bid-status]').innerText().then(t=>t.includes('javob kutilmoqda')),'bid submitted: "javob kutilmoqda"');
  await pg.context().close();
  pg=await open(fph,null,null);
  await pg.evaluate(()=>openDashboard('shipments')); await pg.waitForTimeout(2200);
  const panel=pg.locator('[data-bids]').first(); ok(await panel.count()===1,'owner: driver offers panel');
  await panel.locator('button:has-text("Takliflarni ko\'rish")').click(); await pg.waitForTimeout(900);
  ok((await panel.innerText()).includes('Haydovchi CP'),'owner sees the driver\'s offer');
  await panel.locator('[data-bid-accept]').first().click(); await pg.waitForTimeout(2500);
  const ship2=(await call('/shipments/mine',null,f.accessToken,'GET')).body.find(s=>s.id===A.ship.id);
  ok(ship2&&ship2.status==='LOADING'&&ship2.agreedDeliveryFee===myBid,'accepted: driver assigned, agreed fee = '+myBid);
  await pg.context().close();

  // ===== 5. Dispute tugmasi (PIN yonida) =====
  const pin=(await call('/shipments/mine',null,d.accessToken,'GET')).body.find(s=>s.id===A.ship.id).pin;
  const cp=await call(`/shipments/${A.ship.id}/confirm-pickup`,{pin:pin.pickup},f.accessToken); ok(cp.status===200,'pickup PIN confirmed by the farmer (setup) '+cp.status+JSON.stringify(cp.body).slice(0,120));
  pg=await open(dph,null,null);
  await pg.evaluate(()=>openDashboard('myloads')); await pg.waitForTimeout(2500);
  const pf=pg.locator('form[data-pin-entry]').first();
  ok(await pf.locator('button:has-text("Topshirish")').count()===1&&await pf.locator('[data-dispute]').count()===1,'driver receive window: "Topshirish (PIN)" + "Sifatsiz yuk / Rad etish (Dispute)" side by side');
  ok(/Dispute/.test(await pf.locator('[data-dispute]').innerText()),'dispute button label');
  await pf.locator('[data-dispute]').click(); await pg.waitForTimeout(600);
  ok(await pg.locator('#dispute-form').isVisible(),'dispute reason modal');
  await pg.fill('#dispute-form textarea','Mahsulot chirigan: 30% sifatsiz'); await pg.click('#dispute-form button[type=submit]'); await pg.waitForTimeout(2200);
  ok(await pg.locator('[data-dispute-banner]').count()>=1,'dispute banner appears on the card');
  const sh=(await call('/shipments/mine',null,d.accessToken,'GET')).body.find(s=>s.id===A.ship.id);
  ok(sh.dispute&&sh.dispute.by==='DRIVER','dispute saved on the server');
  const dpin=(await call('/shipments/mine',null,m.accessToken,'GET')).body.find(x=>x.id===A.ship.id).pin.delivery;
  const blocked=await call(`/shipments/${A.ship.id}/deliver`,{pin:dpin},d.accessToken);
  ok(blocked.status===409,'delivery blocked while the dispute is open');
  await pg.screenshot({path:'cp-dispute-light.png'}); await pg.context().close();

  // ===== 6. Escrow 20/80 indikatori (market, buyurtma rasmiylashtirish) =====
  const B=(await call('/products',{name:'Sabzi CP-B',category:'Sabzavot',quantityKg:9000,pricePerKg:3000},f.accessToken)).body;
  pg=await open(mph,null,null);
  await pg.evaluate(async(pid)=>{ const r=await authed('GET','/products'); const p=(r.items||r).find(x=>x.id===pid)||r[0]; openBookingModal(p); },B.id).catch(()=>{});
  await pg.waitForTimeout(800);
  if(!(await pg.locator('#booking-modal.open').count())){ await pg.evaluate((p)=>openBookingModal(p),{id:B.id,name:B.name,pricePerKg:3000,quantityKg:9000,photos:[],farmer:{farmName:'Agro CP',region:'Samarqand',district:'Siyob',penaltyPoints:0}}); await pg.waitForTimeout(600); }
  await pg.fill('#booking-qty','1000'); await pg.waitForTimeout(1500);
  const esc=pg.locator('#booking-est [data-escrow]');
  ok(await esc.count()===1,'booking: escrow 20/80 indicator visible');
  const et=await esc.innerText(); ok(/20%/.test(et)&&/80%/.test(et),'indicator shows 20% / 80%');
  const tot=num((await pg.locator('#booking-est').innerText()).split('Taxminiy jami')[1])[0];
  const nums=num(et.replace(/\n/g,' ')); ok(nums[0]===Math.round(tot*0.2)&&nums[1]===tot-Math.round(tot*0.2),`20% of total (${tot}) = ${nums[0]}, 80% = ${nums[1]}`);
  ok(/1\.5%.*300 000/.test(await pg.locator('#booking-est').innerText()),'service-fee label: 1.5%, max 300 000');
  await pg.screenshot({path:'cp-booking-light.png'}); await lumAudit(pg,'#booking-modal','Booking modal (light)');
  await pg.context().close();

  // ===== 7. Agro-Store: ommaviy oferta roziligi (majburiy chekboks) =====
  const prisma=new PrismaClient(); const aph=rnd(); const supPh=rnd();
  await prisma.user.create({data:{phone:aph,fullName:'Admin CP',role:'ADMIN',adminRole:'SUPER_ADMIN',passwordHash:await bcrypt.hash(PW,4)}});
  const adm=(await call('/auth/login',{phone:aph,password:PW})).body;
  const sup=await call('/agro-store/suppliers',{type:'FERTILIZER',orgName:'Oferta Test Do\'kon',contactName:'Aziz Karimov',phone:supPh,password:'Sotuvchi1234'},adm.accessToken);
  ok(sup.status===201,'supplier created for the oferta test');
  const sctx=await open(null,null,null); await sctx.click('#auth-nav-btn'); await sctx.fill('#login-phone',supPh.slice(4)); await sctx.fill('#login-password','Sotuvchi1234'); await sctx.click('#login-form .auth-submit'); await sctx.waitForTimeout(1800);
  await sctx.evaluate(()=>openDashboard()); await sctx.waitForTimeout(1800);
  await sctx.click('#asp-add'); await sctx.waitForSelector('#asp-form');
  const cb=sctx.locator('#asp-offer'); ok(await cb.count()===1&&await cb.getAttribute('required')!==null,'oferta checkbox is present and required');
  ok(/Ommaviy oferta/.test(await sctx.locator('#asp-form [data-offer]').innerText())&&/shaxsan javobgarlig/.test(await sctx.locator('#asp-form [data-offer]').innerText()),'text: public offer + personal responsibility for product quality');
  ok(!(await cb.isChecked()),'unchecked by default');
  await sctx.locator('#asp-form input').first().fill('Oferta Mahsulot'); await sctx.locator('#asp-form input[type=number]').first().fill('5000');
  await sctx.locator('#asp-form button[type=submit]').click(); await sctx.waitForTimeout(1200);
  ok(await sctx.locator('#toast-stack').innerText().then(t=>/oferta/i.test(t)),'submit without consent -> error toast');
  const tokS=(await call('/auth/login',{phone:supPh,password:'Sotuvchi1234'})).body.accessToken;
  ok((await call('/agro-store/me/products',null,tokS,'GET')).body.length===0,'no post is created without consent');
  await cb.check(); await sctx.locator('#asp-form button[type=submit]').click(); await sctx.waitForTimeout(2000);
  const mine=(await call('/agro-store/me/products',null,tokS,'GET')).body;
  ok(mine.length===1&&!!mine[0].offerAcceptedAt,'with consent the post is created and the consent time is stored');
  await sctx.context().close(); await prisma.$disconnect();
  // ===== 8. i18n: RU va EN =====
  for(const lang of ['ru','en']){
    let q=await open(fph,null,lang);
    await q.evaluate(()=>openDashboard('shipments')); await q.waitForTimeout(2000); await q.locator('.fp-q').first().click().catch(()=>{}); await q.waitForTimeout(500);
    await q.keyboard.press('Escape'); await q.evaluate(()=>openProductModal()); await q.waitForTimeout(900);
    const miss=await q.evaluate(()=>Object.keys(window.I18N_MISSES||{}));
    const UZ=/[oOgG][\u0027\u2018\u2019\u02bb]|\b(va|uchun|yoki|bilan|kerak|qilinadi|narx|taklif|manzil)\b/i; const NOISE=/01A777AA|Dehqon|Samarqand|Siyob|Agro CP|Fermer CP|Pomidor|Bodring|Sabzi|Yangi manzil|\+998/;
    const own=miss.filter(x=>UZ.test(x)&&!NOISE.test(x)); ok(own.length===0,`[${lang}] product form / calculator: no untranslated strings ${JSON.stringify(own.slice(0,8))}`);
    const labels=await q.locator('#product-form label').allInnerTexts(); ok(lang==='ru'?labels.some(t=>/Объём/i.test(t))&&labels.some(t=>/Адрес/i.test(t)):labels.some(t=>/Volume/i.test(t))&&labels.some(t=>/Address/i.test(t)),`[${lang}] product form labels translated (${labels.slice(0,4).map(t=>t.slice(0,12))})`);
    await q.context().close();
    q=await open(mph,null,lang);
    await q.evaluate((p)=>openBookingModal(p),{id:B.id,name:B.name,pricePerKg:3000,quantityKg:9000,photos:[],farmer:{farmName:'Agro CP',region:'Samarqand',district:'Siyob',penaltyPoints:0}}); await q.waitForTimeout(500); await q.fill('#booking-qty','1000'); await q.waitForTimeout(1500);
    const et=await q.locator('#booking-est [data-escrow]').innerText(); ok(lang==='ru'?/Гарантия.*20%/.test(et)&&/Остальные 80%/.test(et):/Guarantee.*20%/.test(et)&&/Remaining 80%/.test(et),`[${lang}] escrow indicator translated`);
    const miss2=await q.evaluate(()=>Object.keys(window.I18N_MISSES||{})).then(a=>a.filter(x=>UZ.test(x)&&!NOISE.test(x))); ok(miss2.length===0,`[${lang}] booking modal: no untranslated strings ${JSON.stringify(miss2.slice(0,8))}`);
    await q.context().close();
  }
  await b0.close();
})();
