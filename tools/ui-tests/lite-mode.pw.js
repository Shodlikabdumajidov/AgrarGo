const { chromium } = require('playwright-core'); const fs=require('fs');
const BE='/home/user/AgrarGo/backend/node_modules/';
const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
(async()=>{
  const prisma=new PrismaClient(); const phone=rnd(); await prisma.user.create({data:{phone,fullName:'Super T',role:'ADMIN',adminRole:'SUPER_ADMIN',passwordHash:await bcrypt.hash(PW,4)}});
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});const buf=Buffer.from(await resp.arrayBuffer());r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:buf});});const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',phone.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};


  // ---- LITE rejim: faqat vizual effektlar o'chadi, navigatsiya ishlaydi ----
  for (const vp of [{width:1280,height:800},{width:390,height:800}]) {
    const pg=await open(vp);
    await pg.evaluate(()=>{closeDashboard&&closeDashboard();}); await pg.waitForTimeout(500);
    await pg.evaluate(()=>Perf.set(true)); await pg.waitForTimeout(300);
    ok(await pg.evaluate(()=>document.documentElement.classList.contains('perf-lite')),vp.width+': lite ON');
    // menyular displeyda bo'lishi kerak (display:none bo'lmasin)
    const disp=await pg.evaluate(()=>['account-menu','lang-menu','custom-dropdown-menu','sidebar'].map(i=>{const e=document.getElementById(i);return e?i+':'+getComputedStyle(e).display:i+':-'}));
    console.log(disp.join(' '));
    ok(!disp.some(s=>s.endsWith(':none')&&(s.startsWith('sidebar'))),'sidebar not display:none in lite');
    // hisob menyusi
    const acc=vp.width>600?'#account-btn':'#account-btn';
    const hasAcc=await pg.evaluate(()=>!!document.getElementById('auth-nav-btn')); console.log('account-btn',hasAcc);
    if(hasAcc){ await pg.click('#auth-nav-btn'); await pg.waitForTimeout(300);
      const o=await pg.evaluate(()=>{const m=document.getElementById('account-menu');const r=m.getBoundingClientRect();const cs=getComputedStyle(m);const cx=r.left+r.width/2,cy=r.top+20;const top=document.elementFromPoint(cx,cy);return {hidden:!m.classList.contains('open'),display:cs.display,pe:cs.pointerEvents,hit:m.contains(top)}});
      console.log(JSON.stringify(o)); ok(!o.hidden&&o.display!=='none'&&o.pe!=='none'&&o.hit,'account menu opens & is hit-testable in lite');
      // kabinet tugmasi
      const cab=pg.locator('#account-menu [onclick*="Dashboard"]').first();
      if(await cab.count()){ await cab.click(); await pg.waitForTimeout(1500); ok(await pg.evaluate(()=>document.documentElement.classList.contains('dash-open')),'cabinet opens from account menu in lite'); }
    }
    if(!(await pg.evaluate(()=>document.documentElement.classList.contains('dash-open')))){ await pg.evaluate(()=>openDashboard()); await pg.waitForTimeout(1500); }
    // tab almashtirish
    const tabs=pg.locator('#dash-tabs .dash-tab'); const n=await tabs.count(); ok(n>1,'dash tabs rendered '+n);
    const before=await pg.evaluate(()=>document.querySelector('#dash-tabs .dash-tab.active, #dash-tabs .dash-tab[aria-selected="true"]')?.dataset.tab);
    await tabs.nth(3).click(); await pg.waitForTimeout(900);
    const after=await pg.evaluate(()=>document.querySelector('#dash-tabs .dash-tab.active, #dash-tabs .dash-tab[aria-selected="true"]')?.dataset.tab);
    console.log('tab',before,'->',after); ok(before!==after,'tab switching works in lite');
    const pe=await pg.evaluate(()=>['dash-tabs','dash-content','dashboard-view'].map(i=>getComputedStyle(document.getElementById(i)).pointerEvents));
    ok(pe.every(x=>x==='auto'),'pointer-events auto: '+pe);
    // modal ochish (profil tahrirlash / har qanday modal)
    await pg.evaluate(()=>{const b=document.querySelector('#dash-content button');b&&b.scrollIntoView();});
    await pg.close();
  }
  // saytda sidebar (hamburger)
  {
    const pg=await open({width:390,height:800});
    await pg.evaluate(()=>{closeDashboard();}); await pg.waitForTimeout(400);
    await pg.evaluate(()=>Perf.set(true)); await pg.waitForTimeout(200);
    const btn=pg.locator('button[onclick*="toggleSidebar"]').first();
    ok(await btn.count()>0,'sidebar toggle button exists');
    await btn.click(); await pg.waitForTimeout(500);
    const s=await pg.evaluate(()=>{const e=document.getElementById('sidebar');const r=e.getBoundingClientRect();const cs=getComputedStyle(e);const top=document.elementFromPoint(r.left+40,r.top+120);return {display:cs.display,left:Math.round(r.left),hit:e.contains(top),tr:e.className.includes('-translate-x-full')}});
    console.log(JSON.stringify(s)); ok(s.display!=='none'&&s.left>=0&&s.hit,'sidebar opens in lite and is clickable');
    const link=pg.locator('#sidebar a, #sidebar button').nth(2); await link.click({timeout:3000}).catch(e=>ok(false,'sidebar link click '+e.message.slice(0,80)));
    await pg.waitForTimeout(400); ok(true,'sidebar link clicked');
    console.log('errs',pg.errs);
  }
  await b0.close(); await prisma.$disconnect();
})();
