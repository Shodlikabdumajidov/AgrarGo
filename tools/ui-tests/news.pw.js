const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json();}catch(e){}return {status:r.status,body:j};};
const CYR=/[А-Яа-яЁё]/;
(async()=>{
  const prisma=new PrismaClient(); const fph=rnd(),mph=rnd(),dph=rnd(),aph=rnd();
  await prisma.user.create({data:{phone:aph,fullName:'Admin NW',role:'ADMIN',adminRole:'SUPER_ADMIN',passwordHash:await bcrypt.hash(PW,4)}});
  await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer NW',farmName:'Agro NW',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market NW',companyName:'Mkt NW',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi NW',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'NW',capacityKg:30000,region:'Samarqand'});
  const tokens={}; for(const [k,p] of [['FARMER',fph],['MARKET',mph],['DRIVER',dph],['ADMIN',aph]]) tokens[k]=(await call('/auth/login',{phone:p,password:PW})).body.accessToken;
  const apiNews=async(role)=>(await call('/news?limit=50',null,tokens[role]||null,'GET')).body;
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(vw,vh,theme,phone,lang)=>{const ctx=await b.newContext({locale:'uz-UZ',viewport:{width:vw,height:vh},serviceWorkers:'block',hasTouch:vw<1000,isMobile:vw<700});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:Object.fromEntries(resp.headers),body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage(); pg.errs=[]; pg.on('pageerror',e=>pg.errs.push(e.message)); pg.on('dialog',d=>d.accept()); pg.ctx=ctx; pg.news=[];
    pg.on('response',async r=>{ if(/\/news(\?|$)/.test(r.url())&&r.request().method()==='GET'){ try{pg.news.push({auth:!!r.request().headers()['authorization'],text:await r.text()});}catch(e){} } });
    await pg.addInitScript(([t,l])=>{window.tailwind=window.tailwind||{}; try{localStorage.setItem('agrargo_theme',t); if(l) localStorage.setItem('agrargo_lang',l);}catch(e){} const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},[theme||'light',lang||null]);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html'); await pg.waitForTimeout(3300);
    if(phone){ await pg.evaluate(()=>{}); await pg.click('#auth-nav-btn'); await pg.fill('#login-phone',phone.slice(4)); await pg.fill('#login-password',PW); await pg.click('#login-form .auth-submit'); await pg.waitForTimeout(2000); }
    return pg;};
  const lum=c=>{const n=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*n[0]+.7152*n[1]+.0722*n[2];};
  const contrast=async(pg,sel,label,theme)=>{
    const bad=await pg.evaluate(([sel,theme])=>{
      const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
      const page=theme==='light'?{r:245,g:240,b:235}:{r:2,g:6,b:23};
      const bgOf=el=>{let n=el; const st=[]; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){st.push(c); if(c.a>=.98)break;} n=n.parentElement;} let base=page; for(let i=st.length-1;i>=0;i--){const c=st[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;};
      const out=[]; document.querySelectorAll(sel+' *').forEach(el=>{ const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1); if(!own) return; if(el.closest('.nw-lock-bg')) return; let g=el,grad=false; while(g&&g.id!==sel.slice(1)){ if(getComputedStyle(g).backgroundImage.includes('gradient')&&g.classList.contains('nw-login')){grad=true;break;} g=g.parentElement;} const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return; const r=el.getBoundingClientRect(); if(!r.width||!r.height) return; const fg=parse(cs.color); if(!fg) return;
        // yumshoq gradient fonli bloklar (.nw-ai): fon sifatida eng qorong'i/yorug' to'xtash rangini hisobga olamiz
        let bg=bgOf(el); const ai=el.closest('.nw-ai'); if(ai&&!ai.classList.contains('locked')){ bg= theme==='light'?{r:230,g:240,b:238}:{r:20,g:50,b:55}; }
        const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(ratio<3.2&&!grad) out.push(el.tagName+'.'+String(el.className).slice(0,26)+' "'+el.textContent.trim().slice(0,18)+'" '+ratio.toFixed(2)); });
      return out.slice(0,8);},[sel,theme]);
    ok(bad.length===0,`${label}: contrast OK ${JSON.stringify(bad)}`); };
  const inter=await apiNews(null);
  ok(inter.items.length>=5,'API: '+inter.items.length+' seeded news (3 languages, 4 categories)');

  for(const theme of ['light','dark']) for(const [vw,vh] of [[375,812],[768,1024],[1280,900]]){
    const L=`[${vw} ${theme} guest]`; const pg=await open(vw,vh,theme);
    await pg.evaluate(()=>document.getElementById('news').scrollIntoView()); await pg.waitForTimeout(900);
    const g=await pg.evaluate(()=>({cards:document.querySelectorAll('#news-grid .nw-card').length,locked:document.querySelectorAll('#news-grid .nw-card .nw-ai.locked').length,open:document.querySelectorAll('#news-grid .nw-ai.open').length,chips:[...document.querySelectorAll('#news-filters .nw-chip')].map(x=>x.textContent.trim()),h:document.getElementById('news-title').textContent.trim(),lockP:(document.querySelector('.nw-lock-p')||{}).textContent,btn:(document.querySelector('.nw-login')||{}).textContent,sw:document.documentElement.scrollWidth<=innerWidth+1}));
    ok(g.cards>=4&&g.locked===g.cards&&g.open===0,L+` ${g.cards} news cards, every AI block is locked (no open AI text)`);
    ok(g.chips.join('|')==="Barchasi|Yo'llar|Qishloq xo'jaligi|Bozorlar|Yuk tashish",L+' filters: '+g.chips.join(', '));
    ok(g.lockP==="Rolingizga mos AI ogohlantirish va yo'l tavsiyalarini ko'rish uchun tizimga kiring"&&/Kirish \/ Ro'yxatdan o'tish/.test(g.btn),L+' locked text + "Kirish / Ro\'yxatdan o\'tish" button');
    ok(g.sw,L+' no horizontal scroll');
    const resp=pg.news.find(x=>!x.auth); ok(resp&&!/aiInsight|ai_insight|aiSource/.test(resp.text),L+' network response for a guest contains NO ai_insight fields');
    ok(!(await pg.evaluate(()=>/Fermer uchun|Haydovchi uchun|Market uchun/.test(document.getElementById('news').innerText))),L+' no role-specific AI text in the DOM');
    // kartochkalar sig'adi, ustma-ust tushmaydi
    const geo=await pg.evaluate(()=>{const cs=[...document.querySelectorAll('#news-grid .nw-card')].map(c=>c.getBoundingClientRect()); let ov=0; for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){const a=cs[i],c=cs[j]; if(Math.min(a.right,c.right)-Math.max(a.left,c.left)>1&&Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top)>1)ov++;} const vw=innerWidth; return {ov,inside:cs.every(r=>r.left>=-1&&r.right<=vw+1),cols:new Set(cs.map(r=>Math.round(r.left))).size,lock:(()=>{const l=document.querySelector('.nw-ai.locked'),f=l.querySelector('.nw-lock-fg'),b=l.querySelector('.nw-login'); const lr=l.getBoundingClientRect(),br=b.getBoundingClientRect(); return br.top>=lr.top-1&&br.bottom<=lr.bottom+1&&br.left>=lr.left&&br.right<=lr.right;})()};});
    ok(geo.ov===0&&geo.inside,L+` cards do not overlap and stay in the viewport (${geo.cols} column(s))`); ok(geo.lock,L+' lock overlay button fits inside the AI block');
    ok(vw>=1000?geo.cols>=2:geo.cols===1||vw>=700,L+' responsive grid columns');
    await contrast(pg,'#news',L+' news section',theme);
    await pg.screenshot({path:`nw-${vw}-${theme}-guest.png`});
    if(vw===1280&&theme==='light'){
      // filtrlar
      const ids=async()=>pg.evaluate(()=>[...document.querySelectorAll('#news-grid .nw-card')].map(c=>c.dataset.cat));
      await pg.click('#news-filters [data-cat="ROADS"]'); await pg.waitForTimeout(300); let c=await ids(); ok(c.length>=2&&c.every(x=>x==='ROADS'),L+' filter "Yo\'llar" shows only ROADS ('+c.length+')');
      await pg.click('#news-filters [data-cat="AGRO"]'); await pg.waitForTimeout(300); c=await ids(); ok(c.length>=1&&c.every(x=>x==='AGRO'),L+' filter "Qishloq xo\'jaligi" shows only AGRO');
      await pg.click('#news-filters [data-cat="MARKET"]'); await pg.waitForTimeout(300); c=await ids(); ok(c.length>=1&&c.every(x=>x==='MARKET'),L+' filter "Bozorlar" shows only MARKET');
      ok(await pg.evaluate(()=>document.querySelector('#news-filters .on').dataset.cat)==='MARKET','active chip highlighted');
      await pg.click('#news-filters [data-cat=""]'); await pg.waitForTimeout(300); c=await ids(); ok(c.length>=5,L+' "Barchasi" shows everything');
      // login tugmasi
      await pg.click('.nw-login >> nth=0'); await pg.waitForTimeout(600); ok(await pg.evaluate(()=>document.getElementById('auth-modal').classList.contains('open')),L+' locked button opens the login / register window');
      await pg.evaluate(()=>closeAuthModal&&closeAuthModal());
      // til: ru / en
      await pg.evaluate(()=>I18N.setLang('ru')); await pg.waitForTimeout(500);
      let t=await pg.evaluate(()=>({h:document.getElementById('news-title').textContent,lock:document.querySelector('.nw-lock-p').textContent,title:document.querySelector('.nw-title').textContent,chip:[...document.querySelectorAll('#news-filters .nw-chip')].map(x=>x.textContent.trim()).join('|')}));
      ok(/Агро-логистические/i.test(t.h)&&/Войдите/.test(t.lock)&&CYR.test(t.title)&&/Все\|Дороги/.test(t.chip),L+' RU: heading, lock text, filters and news titles translated');
      await pg.evaluate(()=>I18N.setLang('en')); await pg.waitForTimeout(500);
      t=await pg.evaluate(()=>({h:document.getElementById('news-title').textContent,lock:document.querySelector('.nw-lock-p').textContent,title:document.querySelector('.nw-title').textContent,chip:[...document.querySelectorAll('#news-filters .nw-chip')].map(x=>x.textContent.trim()).join('|'),btn:document.querySelector('.nw-login').textContent}));
      ok(/Agro-Logistics News/i.test(t.h)&&/Sign in to see/.test(t.lock)&&!CYR.test(t.title)&&/^All\|Roads/.test(t.chip)&&/Log in/.test(t.btn),L+' EN: everything translated');
    }
    ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close(); }

  // ===== Kirgan foydalanuvchi: roliga mos AI blok =====
  for(const [role,ph,ru,noun,hdr] of [['FARMER',fph,'farmer','Fermer','Fermer uchun'],['DRIVER',dph,'driver','Haydovchi','Haydovchi uchun'],['MARKET',mph,'market','Market','Market uchun']]) for(const [vw,vh,theme] of [[375,812,'light'],[1280,900,'dark']]){
    const L=`[${vw} ${theme} ${role}]`; const pg=await open(vw,vh,theme,ph);
    await pg.evaluate(()=>document.getElementById('news').scrollIntoView()); await pg.waitForTimeout(1200);
    const api=await apiNews(role); const first=api.items[0];
    const d=await pg.evaluate(()=>({cards:document.querySelectorAll('#news-grid .nw-card').length,open:[...document.querySelectorAll('#news-grid .nw-card .nw-ai.open')].map(x=>({role:x.dataset.role,h:x.querySelector('.nw-ai-h').textContent.trim(),t:x.querySelector('.nw-ai-t').textContent.trim()})),locked:document.querySelectorAll('.nw-ai.locked').length,authReq:true}));
    ok(d.cards>=4&&d.open.length===d.cards&&d.locked===0,L+` AI block is open on every card (${d.open.length}/${d.cards}), none locked`);
    ok(d.open.every(x=>x.role===role),L+' only the '+role+' insight is shown');
    ok(d.open[0].h==='✨ AI Maslahat ('+noun+' uchun)',L+' header: "'+d.open[0].h+'"');
    ok(d.open[0].t===first.aiInsight.uz,L+' text equals the server '+role+' insight (uz)');
    const others=['farmer','driver','market'].filter(r=>r!==ru); const all=await pg.evaluate(()=>document.getElementById('news').innerText); const raw=(await call('/news?limit=50',null,tokens.ADMIN,'GET')).body.items.find(x=>x.id===first.id).aiInsights;
    ok(others.every(o=>!all.includes(raw[o].uz)),L+' other roles\' advice never reaches the page');
    ok(pg.news.some(x=>x.auth&&/aiInsight/.test(x.text)),L+' request carried the JWT and got the aiInsight');
    if(vw===375&&theme==='light'){ await pg.evaluate(()=>I18N.setLang('ru')); await pg.waitForTimeout(500); const t=await pg.evaluate(()=>[document.querySelector('.nw-ai-h').textContent.trim(),document.querySelector('.nw-ai-t').textContent.trim()]);
      ok(t[1]===first.aiInsight.ru&&/ИИ-совет/.test(t[0]),L+' RU: header + advice switch language ('+t[0]+')');
      await pg.evaluate(()=>I18N.setLang('en')); await pg.waitForTimeout(500); const e=await pg.evaluate(()=>[document.querySelector('.nw-ai-h').textContent.trim(),document.querySelector('.nw-ai-t').textContent.trim()]); ok(e[1]===first.aiInsight.en&&/AI Advice \(for /.test(e[0])&&!CYR.test(e[0]+e[1]),L+' EN: header + advice ('+e[0]+')');
      await pg.evaluate(()=>I18N.setLang('uz')); await pg.waitForTimeout(400); }
    await contrast(pg,'#news',L+' news section',theme);
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),L+' no horizontal scroll');
    // ===== Kabinet bo'limi =====
    await pg.evaluate(()=>openDashboard('news')); await pg.waitForTimeout(1800);
    const tabs=await pg.evaluate(()=>[...document.querySelectorAll('.dash-tab')].map(x=>x.dataset.tab));
    ok(tabs.includes('news'),L+' cabinet menu has the "Yangiliklar va AI Tahlil" section');
    const cab=await pg.evaluate(()=>({title:document.querySelector('#dash-content h3').textContent,cards:document.querySelectorAll('#nw-cab-list .nw-card').length,open:document.querySelectorAll('#nw-cab-list .nw-ai.open').length,roles:[...new Set([...document.querySelectorAll('#nw-cab-list .nw-ai.open')].map(x=>x.dataset.role))],regions:[...document.querySelectorAll('#nw-cab-region option')].map(o=>o.value),chips:document.querySelectorAll('#nw-cab-chips .nw-chip').length}));
    ok(cab.title==='Yangiliklar va AI Tahlil'&&cab.cards>=4&&cab.open===cab.cards&&cab.roles.length===1&&cab.roles[0]===role,L+` cabinet: ${cab.cards} news with full ${role} AI summary`);
    ok(cab.regions.includes("Farg'ona")&&cab.regions.includes('Samarqand')&&cab.chips===5,L+' region select + category chips present');
    await pg.selectOption('#nw-cab-region',"Farg'ona"); await pg.waitForTimeout(900);
    const fr=await pg.evaluate(()=>[...document.querySelectorAll('#nw-cab-list .nw-card .nw-reg')].map(x=>x.textContent.trim())); ok(fr.length>=1&&fr.every(x=>x==="Farg'ona"),L+' region filter works ('+fr.length+' item)');
    await pg.click('#nw-cab-chips [data-cat="MARKET"]'); await pg.waitForTimeout(900); const e0=await pg.evaluate(()=>document.querySelectorAll('#nw-cab-list .nw-card').length+'|'+document.querySelectorAll('#nw-cab-list .nw-empty').length); ok(e0==='0|1','region + category combine (empty state)');
    await pg.selectOption('#nw-cab-region',''); await pg.waitForTimeout(900); const mk=await pg.evaluate(()=>[...document.querySelectorAll('#nw-cab-list .nw-card')].map(c=>c.dataset.cat)); ok(mk.length>=1&&mk.every(x=>x==='MARKET'),L+' category filter in the cabinet');
    await contrast(pg,'#dash-content',L+' cabinet news',theme);
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),L+' cabinet: no horizontal scroll');
    await pg.screenshot({path:`nw-${vw}-${theme}-${role}-cab.png`});
    ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close(); }

  // ===== Admin: yaratish (AI xulosa avtomatik), yashirish, o'chirish =====
  { const L='[admin]'; const pg=await open(1280,900,'light',aph); await pg.evaluate(()=>openDashboard('news')); await pg.waitForTimeout(1800);
    ok(await pg.locator('#nw-form').count()===1,L+' add-news form is available');
    const title='Samarqandda yuk mashinalari uchun yangi tunnel yo\'li ochildi '+Date.now();
    await pg.fill('#nw-f-title',title); await pg.fill('#nw-f-sum',"Yangi yo'l yuk mashinalarining yetkazib berish vaqtini qisqartirishi kutilmoqda, tirbandlik kamayadi."); await pg.selectOption('#nw-f-cat','LOGISTICS'); await pg.selectOption('#nw-f-reg','Samarqand');
    await pg.click('#nw-f-save'); await pg.waitForTimeout(2500);
    ok(/AI xulosalar avtomatik/.test(await pg.locator('#nw-f-msg').innerText()),L+' created: AI summaries generated automatically');
    const card=pg.locator('#nw-cab-list .nw-card',{hasText:title}); ok(await card.count()===1&&await card.locator('.nw-ai.open').count()===3,L+' new card shows all 3 role insights');
    const row=await prisma.agroNews.findFirst({where:{titleUz:title}}); ok(!!row&&row.aiInsightFarmerEn.length>40&&row.aiInsightDriverRu.length>40&&row.aiInsightMarketUz.length>40,L+' DB row has 9 insight texts');
    await card.locator('.nw-mini').first().click(); await pg.waitForTimeout(1500);
    ok((await prisma.agroNews.findFirst({where:{titleUz:title}})).isActive===false,L+' hide works'); ok((await apiNews(null)).items.every(x=>x.titleUz!==title),L+' hidden news disappears for guests');
    await pg.locator('#nw-cab-list .nw-card',{hasText:title}).locator('.nw-mini').nth(1).click(); await pg.waitForTimeout(1500);
    ok(!(await prisma.agroNews.findFirst({where:{titleUz:title}})),L+' delete works');
    await contrast(pg,'#dash-content',L+' admin news','light'); await pg.screenshot({path:'nw-admin.png'});
    ok(pg.errs.length===0,L+' no page errors '+pg.errs.join('|')); await pg.ctx.close(); }
  await prisma.$disconnect(); await b.close();
})();
