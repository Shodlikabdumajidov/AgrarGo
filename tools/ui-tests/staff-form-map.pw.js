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


  const pg=await open({width:1280,height:800});
  await pg.evaluate(()=>{selectDashTab('adm-users');}); await pg.waitForTimeout(1500);
  await pg.evaluate(()=>admStaffDialog()); await pg.waitForTimeout(600);
  const st=()=>pg.evaluate(()=>{const s=document.getElementById('whf-adminRole');return {dis:s.disabled,val:s.value,pe:getComputedStyle(s).pointerEvents}});
  let s=await st(); console.log(JSON.stringify(s)); ok(s.dis&&s.val==='','Dispetcher (default): Admin paneli disabled and cleared');
  await pg.selectOption('#whf-role','ADMIN'); await pg.waitForTimeout(300); s=await st(); console.log(JSON.stringify(s)); ok(!s.dis&&s.val!=='','Admin: panel select enabled with value');
  const trig=()=>pg.evaluate(()=>{const t=document.getElementById('whf-adminRole').parentElement.querySelector('.ds-trigger');return {dis:t.disabled,label:t.textContent.trim()}});
  let tg=await trig(); ok(!tg.dis,'custom dropdown trigger is enabled for Admin ('+tg.label+')');
  await pg.locator('#whf-adminRole').locator('xpath=..').locator('.ds-trigger').click(); await pg.waitForTimeout(300);
  ok(await pg.locator('.ds-pop .ds-opt').count()>=4,'real click opens the panel list (Safety/Finance/Hub/Super)');
  await pg.locator('.ds-pop .ds-opt:has-text("Finance")').click(); await pg.waitForTimeout(200);
  ok((await st()).val==='FINANCE_ADMIN','picked Finance admin via UI');
  await pg.selectOption('#whf-adminRole','FINANCE_ADMIN'); ok((await st()).val==='FINANCE_ADMIN','can choose Finance admin');
  await pg.selectOption('#whf-role','DISPATCHER'); s=await st(); tg=await trig(); ok(s.dis&&s.val===''&&tg.dis,'back to Dispetcher: disabled + reset, trigger not clickable');
  await pg.selectOption('#whf-role','ADMIN'); await pg.selectOption('#whf-adminRole','HUB_ADMIN');
  const ph=rnd(); await pg.fill('#whf-fullName','Test Admin'); await pg.fill('#whf-phone',ph); await pg.fill('#whf-password','parol1234x');
  await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(1500);
  const u=await prisma.user.findUnique({where:{phone:ph}}); ok(u&&u.role==='ADMIN'&&u.adminRole==='HUB_ADMIN','Admin created with chosen panel role');
  await pg.evaluate(()=>admStaffDialog()); await pg.waitForTimeout(400);
  const ph2=rnd(); await pg.fill('#whf-fullName','Test Disp'); await pg.fill('#whf-phone',ph2); await pg.fill('#whf-password','parol1234x');
  await pg.click('#wh-body form button[type=submit]'); await pg.waitForTimeout(1500);
  const u2=await prisma.user.findUnique({where:{phone:ph2}}); ok(u2&&u2.role==='DISPATCHER','Dispatcher created without panel role');
  // xarita
  const t=await pg.evaluate(()=>MAP_TILES); console.log(JSON.stringify(t));
  ok(t.url==='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'&&/OpenStreetMap/.test(t.options.attribution)&&!/carto/i.test(JSON.stringify(t)),'MAP_TILES = standard OSM, no CARTO');
  console.log('errs',pg.errs);
  await b0.close(); await prisma.$disconnect();
})();
