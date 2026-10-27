const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+' '+r.status+JSON.stringify(j));return j;};
(async()=>{



  const prisma=new PrismaClient(); const fph=rnd(), mph=rnd(), dph=rnd();
  const f=await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer T',farmName:'Agro T',region:'Samarqand',district:'Siyob',address:'Dehqon 5'});
  const m=await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market T',companyName:'Mkt T',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'});
  const d=await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi T',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'TG',capacityKg:9000,region:'Samarqand'});
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp,serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer','content-length'].includes(k))),body:q.postDataBuffer()||undefined});r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:Buffer.from(await resp.arrayBuffer())});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(()=>{window.tailwind=window.tailwind||{};const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};});
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(900);
    await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);await pg.evaluate(()=>openDashboard());await pg.waitForTimeout(1800);return pg;};



  let pg=await open(fph,{width:1280,height:900});
  await pg.evaluate(()=>selectDashTab('profile')); await pg.waitForTimeout(1800);
  ok(await pg.locator('text=Telegram xabarnomalar').count()>=1,'Profile has the Telegram card');
  ok(await pg.locator('button:has-text("Telegram botni ulash")').count()===1,'"Telegram botni ulash" button shown when not linked');
  pg.on('popup',p=>p.close());
  await pg.locator('button:has-text("Telegram botni ulash")').click(); await pg.waitForTimeout(1500);
  const href=await pg.locator('a[href^="https://t.me/AgrarGoBot?start="]').first().getAttribute('href'); console.log('LINK',href);
  ok(/^https:\/\/t\.me\/AgrarGoBot\?start=[A-Za-z0-9_-]{32}$/.test(href||''),'unique one-time deep link https://t.me/AgrarGoBot?start=TOKEN');
  // Bot /start TOKEN yuborilganini simulyatsiya qilamiz (chat ID biriktiriladi)
  await prisma.user.updateMany({where:{phone:fph},data:{telegramChatId:'777001',telegramLinkedAt:new Date()}});
  await pg.waitForTimeout(4500);
  ok(await pg.locator('[data-tg-linked]').innerText().then(t=>/Telegram ulandi ✅/.test(t)),'card auto-updates to "Telegram ulandi ✅"');
  const card=await pg.locator('[data-tg-linked]').locator('xpath=ancestor::div[contains(@class,"glass")][1]').innerText();
  ok(/Tasdiqlash \/ Rad etish/.test(card)&&/Yangi bron yoki narx taklifi/.test(card),'farmer sees the list of Telegram events (with quick-action buttons)');
  ok(await pg.locator('button:has-text("Uzish (Unlink)")').count()===1,'Unlink button shown');
  await pg.locator('button:has-text("Uzish (Unlink)")').click(); await pg.waitForTimeout(2500);
  ok((await prisma.user.findFirst({where:{phone:fph}})).telegramChatId===null,'Unlink detaches the chat');
  ok(await pg.locator('button:has-text("Telegram botni ulash")').count()===1,'card returns to the "link" state');
  await pg.context().close();
  // haydovchi: "Yetib keldim" va rolga mos ro'yxat
  pg=await open(dph,{width:1280,height:900});
  await prisma.user.updateMany({where:{phone:dph},data:{telegramChatId:'777002',telegramLinkedAt:new Date()}});
  await pg.evaluate(()=>selectDashTab('profile')); await pg.waitForTimeout(1800);
  ok(await pg.locator('main#dash-content').innerText().then(t=>/Dispetcher sizga yuk biriktirganda/.test(t)),'driver sees driver-specific events');
  console.log('errs',pg.errs);
  await b0.close(); await prisma.$disconnect();
})();
