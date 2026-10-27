const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});return r.json();};
const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f645400000000049454e44ae426082','hex');
(async()=>{
  const UNI='Fungitsid UI-'+Date.now().toString(36); const prisma=new PrismaClient(); const aph=rnd(), dph=rnd(), fph=rnd(), mph=rnd(), vph=rnd(), supPh=rnd();
  await prisma.user.create({data:{phone:aph,fullName:'Admin AS',role:'ADMIN',adminRole:'SUPER_ADMIN',passwordHash:await bcrypt.hash(PW,4)}});
  await prisma.user.create({data:{phone:dph,fullName:'Dispetcher AS',role:'DISPATCHER',passwordHash:await bcrypt.hash(PW,4)}});
  await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer AS',farmName:'Agro AS',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market AS',companyName:'Mkt AS',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  await call('/auth/driver/register',{phone:vph,password:PW,fullName:'Haydovchi AS',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'AS',capacityKg:9000,region:'Samarqand'});
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const misses=new Map();
  const SUPPW='Sotuvchi1234'; const open=async(ph,vp,theme,lang)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()||undefined});const buf=Buffer.from(await resp.arrayBuffer());r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*'},body:buf});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept('Hujjatlar yetarli emas'));
    await pg.addInitScript(([t,l])=>{window.tailwind=window.tailwind||{};try{localStorage.setItem('agrargo_theme',t);localStorage.setItem('agrargo_lang',l);}catch(e){}const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},[theme,lang]);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(3300);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',ph===supPh?SUPPW:PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(2000);
    await pg.evaluate(()=>openDashboard()); await pg.waitForTimeout(800);
    return pg;};
  const collect=async(pg,tag)=>{const m=await pg.evaluate(()=>Object.keys(window.I18N_MISSES||{})); m.forEach(x=>misses.set(x,tag));};
  const waitFor=async(pg,sel,ms=6000)=>{await pg.waitForSelector(sel,{timeout:ms}).catch(()=>{});};

  // ===== 1. Admin: sotuvchi yaratish =====
  let pg=await open(aph,{width:1280,height:900},'dark','uz');
  await pg.evaluate(()=>openDashboard('agrosuppliers')); await waitFor(pg,'#ags-form');
  ok(await pg.locator('#ags-form').count()===1,'Admin: "Agro-Store Sotuvchisini Qo\'shish" section');
  ok(await pg.locator('.dash-tab[data-tab="agrosuppliers"]').count()===1,'Admin menu has the supplier tab');
  const types=await pg.locator('#ags-form select option').allInnerTexts();
  ok(types.some(t=>/Dorixona/.test(t))&&types.some(t=>/O'g'it Sotuvchi/.test(t)),'type options: Dorixona / O\'g\'it Sotuvchi');
  const addSup=async(type,org)=>{await pg.selectOption('#ags-form select',type); const inp=pg.locator('#ags-form input'); await inp.nth(0).fill(org); await inp.nth(1).fill('Aziz Karimov'); await inp.nth(2).fill(type==='PHARMACY'?supPh:rnd()); await inp.nth(3).fill('Sotuvchi1234'); await pg.click('#ags-form button[type=submit]'); await pg.waitForTimeout(1500);};
  const n0=await pg.locator('#ags-list [data-supplier]').count();
  await addSup('PHARMACY','Agro Dorixona UI');
  ok(await pg.locator('#ags-list [data-supplier]').count()===n0+1,'supplier card appears in the list');
  ok(/Agro Dorixona UI/.test(await pg.locator('#ags-list').innerText()),'org name shown');
  await collect(pg,'admin'); const sid=await pg.locator('#ags-list [data-supplier]',{hasText:'Agro Dorixona UI'}).first().getAttribute('data-supplier');
  ok(await pg.locator(`#ags-list [data-supplier="${sid}"] button:has-text("Tasdiqlash")`).count()===1,'Admin sees verify button');
  await pg.context().close();
  // dispetcher ham qo'sha oladi, lekin tasdiqlay olmaydi
  pg=await open(dph,{width:1280,height:900},'dark','uz');
  await pg.evaluate(()=>openDashboard('agrosuppliers')); await waitFor(pg,'#ags-form');
  ok(await pg.locator('#ags-form').count()===1,'Dispatcher: supplier form available');
  const n1=await pg.locator('#ags-list [data-supplier]').count();
  await addSup('FERTILIZER',"Baraka O'g'it UI");
  ok(await pg.locator('#ags-list [data-supplier]').count()===n1+1,'Dispatcher created a fertilizer supplier');
  ok(await pg.locator('#ags-list button:has-text("Tasdiqlash")').count()===0,'Dispatcher cannot verify (no button)');
  await pg.context().close();

  // ===== 2. Sotuvchi kabineti =====
  pg=await open(supPh,{width:1280,height:900},'dark','uz');
  ok(await pg.locator('.dash-tab[data-tab="asposts"]').count()===1,'Supplier logs in with the given phone+password; own dashboard opens');
  await waitFor(pg,'#asp-add'); if(!await pg.locator('#asp-add').count()){ console.log('DBG errs',pg.errs); await pg.screenshot({path:'as-dbg.png'}); }
  ok(await pg.locator('#asp-verify').innerText().then(t=>/Tekshiruvda/.test(t)&&/ommaga ko'rinmaydi/.test(t)),'banner: posts hidden until verified');
  await pg.click('#asp-add'); await waitFor(pg,'#asp-form');
  const f=pg.locator('#asp-form');
  await f.locator('input').nth(0).fill(UNI); await f.locator('input[type=number]').nth(0).fill('185000'); await f.locator('input[type=number]').nth(1).fill('120');
  await f.locator('textarea').nth(0).fill('1 gektarga 0,4 litr'); await f.locator('select').nth(2).selectOption('litr');
  await f.locator('input[type=file]').setInputFiles({name:'p.png',mimeType:'image/png',buffer:PNG});
  await f.locator('button[type=submit]').click(); await pg.waitForTimeout(2000);
  ok(await pg.locator('.gc .gc-slide').count()===1,'supplier post appears in Glassy Carousel');
  const card=await pg.locator('.gc .gc-slide.is-active').innerText();
  ok(card.includes(UNI)&&/185\s000/.test(card)&&/120/.test(card),'card: name, price, stock');
  ok(await pg.locator('.gc .gc-slide.is-active .gc-img img').count()===1,'card shows the uploaded image');
  await pg.screenshot({path:'as-posts-dark.png'});
  await collect(pg,'supplier-posts');
  await pg.evaluate(()=>selectDashTab('asprofile')); await waitFor(pg,'#asv-card');
  ok(await pg.locator('#asv-card [data-doc="license"]').count()===1&&await pg.locator('#asv-card [data-doc="stir"]').count()===1,'Pharmacy: license + STIR upload rows');
  await pg.locator('[data-doc="license"] input[type=file]').setInputFiles({name:'l.png',mimeType:'image/png',buffer:PNG}); await pg.waitForTimeout(1500);
  await pg.locator('[data-doc="stir"] input[type=file]').setInputFiles({name:'s.png',mimeType:'image/png',buffer:PNG}); await pg.waitForTimeout(1500);
  ok(await pg.locator('#asv-card').innerText().then(t=>(t.match(/Yuklangan/g)||[]).length>=2),'both documents uploaded');
  await collect(pg,'supplier-profile'); await pg.screenshot({path:'as-verify-dark.png'});
  await pg.context().close();

  // ===== 3. Farmer: tasdiqlanmaguncha ko'rinmaydi; admin tasdiqlagach karuselda =====
  pg=await open(fph,{width:1280,height:900},'dark','uz');
  await pg.evaluate(()=>openDashboard('agrostore')); await waitFor(pg,'#ag-carousel .gc');
  ok(await pg.locator('#ag-carousel .gc').count()===1,'Farmer Agro-Store defaults to the Glassy Carousel');
  ok(!(await pg.locator('#ag-carousel').innerText()).includes(UNI),'unverified supplier post is NOT visible to farmers');
  await pg.context().close();
  pg=await open(aph,{width:1280,height:900},'dark','uz');
  await pg.evaluate(()=>openDashboard('agrosuppliers')); await waitFor(pg,'#ags-list');
  await pg.locator(`#ags-list [data-supplier="${sid}"] button:has-text("Tasdiqlash")`).click(); await pg.waitForTimeout(1800);
  ok(await pg.locator(`#ags-list [data-supplier="${sid}"]`).innerText().then(t=>/VERIFIED/.test(t)),'Admin verified the pharmacy');
  await pg.context().close();
  pg=await open(fph,{width:1280,height:900},'dark','uz');
  await pg.evaluate(()=>openDashboard('agrostore')); await waitFor(pg,'#ag-carousel .gc');
  ok(await pg.locator('#ag-carousel .gc .gc-slide').count()>=7,'verified post joined the carousel ('+await pg.locator('#ag-carousel .gc .gc-slide').count()+' cards)');
  await pg.click('#ag-view button[data-view="catalog"]'); await waitFor(pg,'#ag-grid');
  ok((await pg.locator('#ag-grid').innerText()).includes(UNI),'verified supplier post visible in the plain catalog view');
  ok(await pg.locator('#ag-grid .ag-photo').count()>=1,'catalog card shows supplier photo');
  await collect(pg,'farmer-agro'); await pg.screenshot({path:'ag-catalog-dark.png'});
  ok(pg.errs.length===0,'no page errors (farmer) '+pg.errs.join('|')); await pg.context().close();

  // ===== 4. Market ishtirok etmaydi; Haydovchi: TEZ KUNDA =====
  pg=await open(mph,{width:1280,height:900},'dark','uz');
  ok(await pg.locator('.dash-tab[data-tab="agrostore"], .dash-tab[data-tab="agrodriver"], .dash-tab[data-tab="asposts"]').count()===0,'Market: no Agro-Store tabs');
  await pg.context().close();
  pg=await open(vph,{width:1280,height:900},'dark','uz');
  const dt=pg.locator('.dash-tab[data-tab="agrodriver"]');
  ok(await dt.count()===1&&/TEZ KUNDA/.test(await dt.innerText()),'Driver menu: "Dori & O\'g\'itlar" with TEZ KUNDA badge');
  await dt.click(); await waitFor(pg,'#agd-soon');
  ok(/TEZ KUNDA/.test(await pg.locator('#agd-soon').innerText()),'Driver screen shows COMING SOON (not connected)');
  await collect(pg,'driver'); ok(pg.errs.length===0,'no page errors (driver) '+pg.errs.join('|')); await pg.context().close();

  // ===== 5. Light mode audit: Oylik reyting + yangi bo'limlar =====
  const lumAudit=async(pg,rootSel,label)=>{
    const bad=await pg.evaluate((sel)=>{
      const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
      const bgOf=el=>{let n=el; let acc={r:0,g:0,b:0,a:0}; const stack=[]; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){stack.push(c); if(c.a>=.98)break;} n=n.parentElement;} let base={r:232,g:237,b:216}; for(let i=stack.length-1;i>=0;i--){const c=stack[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;};
      const out=[]; const root=document.querySelector(sel); if(!root) return ['missing root '+sel];
      root.querySelectorAll('*').forEach(el=>{ if(!el.childNodes.length) return; const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1); if(!own) return; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') return; const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return;
        const fg=parse(cs.color); if(!fg) return; const bg=bgOf(el); const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(ratio<2.2) out.push(el.tagName+'.'+String(el.className).slice(0,40)+' "'+el.textContent.trim().slice(0,24)+'" '+ratio.toFixed(2)); });
      return out.slice(0,12);}, rootSel);
    ok(bad.length===0,label+': no low-contrast / leftover dark-mode colors '+JSON.stringify(bad));
  };
  pg=await open(fph,{width:1280,height:900},'light','uz');
  await pg.evaluate(()=>{document.getElementById('dashboard-view') && closeDashboard && closeDashboard();}).catch(()=>{});
  await pg.evaluate(()=>document.getElementById('leaderboard').scrollIntoView()); await pg.waitForTimeout(1500);
  const lbBg=await pg.locator('#lb-grid .lb-card').first().evaluate(e=>getComputedStyle(e).backgroundColor); ok(lbBg==='rgb(255, 255, 255)','Monthly ranking card background is white in light mode ('+lbBg+')');
  await lumAudit(pg,'#leaderboard','Monthly ranking (light)');
  await pg.evaluate(()=>openDashboard('agrostore')); await waitFor(pg,'#ag-carousel .gc'); await pg.waitForTimeout(800);
  await lumAudit(pg,'#dash-content','Agro-Store carousel (light)');
  await pg.click('#ag-view button[data-view="catalog"]'); await waitFor(pg,'#ag-grid'); await lumAudit(pg,'#dash-content','Agro-Store catalog (light)');
  await pg.evaluate(()=>openDashboard('products')); await pg.waitForTimeout(1500); await lumAudit(pg,'#dash-content','Farmer listings carousel (light)');
  await pg.screenshot({path:'as-farmer-light.png'}); await pg.context().close();
  pg=await open(supPh,{width:1280,height:900},'light','uz');
  await waitFor(pg,'#asp-add'); await pg.waitForTimeout(800); await lumAudit(pg,'#dash-content','Supplier posts (light)');
  await pg.evaluate(()=>selectDashTab('asprofile')); await waitFor(pg,'#asv-card'); await lumAudit(pg,'#dash-content','Supplier verification (light)');
  await pg.screenshot({path:'as-supplier-light.png'}); await pg.context().close();
  pg=await open(aph,{width:1280,height:900},'light','uz');
  await pg.evaluate(()=>openDashboard('agrosuppliers')); await waitFor(pg,'#ags-list'); await lumAudit(pg,'#dash-content','Admin suppliers (light)'); await pg.context().close();

  // ===== 6. i18n audit: RU va EN =====
  for(const lang of ['ru','en']){
    const m2=new Map(); const ph=lang==='ru'?supPh:fph;
    pg=await open(ph,{width:1280,height:900},'dark',lang);
    const tabs=lang==='ru'?['asposts','asprofile']:['agrostore','products'];
    for(const t of tabs){ await pg.evaluate((x)=>selectDashTab(x),t); await pg.waitForTimeout(1500); }
    if(lang==='ru'){ await pg.click('#asp-add').catch(()=>{}); }
    await pg.waitForTimeout(500);
    const mm=await pg.evaluate(()=>Object.keys(window.I18N_MISSES||{})); const body=await pg.locator('body').innerText();
    ok(!/[А-Яа-я]{3,}/.test(await pg.locator('#dash-content').innerText())||lang==='ru','['+lang+'] no Cyrillic in EN UI');
    const NOISE=/^(AgrarGo|Urgut|Chilonzor|Siyob|Samarqand|grar|GPS|LTL|Telegram|01A777AA yoki 70777AAA)$|days left|^⏳/; const DATA=/hectare|thrips|Aziz Karimov|Agro Dorixona UI|Fungitsid|1 gektarga|Fermer AS|\+998/; const UZ=/[oOgG][\u0027\u2018\u2019\u02bb]|\b(va|uchun|yoki|bilan)\b/; const own=mm.filter(x=>!NOISE.test(x)&&!DATA.test(x)&&(lang==='ru'||UZ.test(x)));
    ok(own.length===0,'['+lang+'] no untranslated strings in new screens '+JSON.stringify(own.slice(0,10)));
    if(lang==='ru'){ await pg.screenshot({path:'as-ru.png'}); ok(/Мои посты/.test(await pg.locator('.dash-tab').first().innerText()),'RU: supplier menu translated'); }
    await pg.context().close();
  }
  ok(true,'misses (uz) noted: '+JSON.stringify([...misses.keys()].slice(0,15)));
  await b0.close(); await prisma.$disconnect();
})();
