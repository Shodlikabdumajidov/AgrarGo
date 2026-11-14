const BE='/home/user/AgrarGo/backend/node_modules/'; const { PrismaClient } = require(BE+'@prisma/client'); const bcrypt = require(BE+'bcrypt');
const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json();}catch(e){}return {status:r.status,body:j};};
(async()=>{
  const prisma=new PrismaClient(); const fph=rnd(), mph=rnd(), dph=rnd(), aph=rnd();
  await prisma.user.create({data:{phone:aph,fullName:'Admin TA',role:'ADMIN',adminRole:'SUPER_ADMIN',passwordHash:await bcrypt.hash(PW,4)}});
  const f=(await call('/auth/farmer/register',{phone:fph,password:PW,fullName:'Fermer TA',farmName:'Agro TA',region:'Samarqand',district:'Siyob',address:'Dehqon 5'})).body;
  const m=(await call('/auth/market/register',{phone:mph,password:PW,fullName:'Market TA',companyName:'Mkt TA',region:'Toshkent shahri',district:'Chilonzor',address:'Bunyodkor 12'})).body;
  await call('/auth/driver/register',{phone:dph,password:PW,fullName:'Haydovchi TA',vehicleType:'Isuzu',plateNumber:'01A'+(100+Date.now()%800)+'TA',capacityKg:30000,region:'Samarqand'});
  const p=(await call('/products',{name:'Pomidor TA',category:'Sabzavot',quantityKg:20000,pricePerKg:3000},f.accessToken)).body;
  const bk=(await call('/bookings',{productId:p.id,quantityKg:2000},m.accessToken)).body; await call(`/bookings/${bk.id}/approve`,null,f.accessToken,'PATCH'); await call('/payments/init',{bookingId:bk.id},m.accessToken);
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(ph,theme,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp||{width:1280,height:900},serviceWorkers:'block'});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()||undefined});const buf=Buffer.from(await resp.arrayBuffer());r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*'},body:buf});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));
    await pg.addInitScript((t)=>{window.tailwind=window.tailwind||{}; try{localStorage.setItem('agrargo_theme',t);}catch(e){} const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},theme);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(3000);
    if(ph){await pg.click('#auth-nav-btn');await pg.fill('#login-phone',ph.slice(4));await pg.fill('#login-password',PW);await pg.click('#login-form .auth-submit');await pg.waitForTimeout(1800);}
    return pg;};
  const audit=async(pg,rootSel,label,theme)=>{
    const bad=await pg.evaluate(([sel,theme])=>{
      const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
      const page=theme==='light'?{r:245,g:240,b:235}:{r:2,g:6,b:23};
      const bgOf=el=>{let n=el; const stack=[]; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){stack.push(c); if(c.a>=.98)break;} n=n.parentElement;} let base=page; for(let i=stack.length-1;i>=0;i--){const c=stack[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;};
      const out=[]; const root=document.querySelector(sel); if(!root) return ['missing '+sel];
      root.querySelectorAll('*').forEach(el=>{ const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1); if(!own) return; const cs=getComputedStyle(el); let g=el, grad=false; while(g&&g!==root.parentElement){ if(getComputedStyle(g).backgroundImage.includes('gradient')||getComputedStyle(g).backgroundImage.includes('url(')){grad=true;break;} g=g.parentElement;} if(grad) return; if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return; const r=el.getBoundingClientRect(); if(r.width===0||r.height===0||r.bottom<0||r.top>innerHeight*3) return; let p=el,hid=false; while(p&&p!==root){ if(getComputedStyle(p).display==='none'||getComputedStyle(p).visibility==='hidden'){hid=true;break;} p=p.parentElement;} if(hid) return;
        const fg=parse(cs.color); if(!fg||fg.a<0.1) return; const bg=bgOf(el); const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(ratio<2.2) out.push(el.tagName+'.'+String(el.className).slice(0,34)+' "'+el.textContent.trim().slice(0,22)+'" '+ratio.toFixed(2)); });
      return out.slice(0,12);}, [rootSel,theme]);
    ok(bad.length===0,`${label} [${theme}]: contrast OK ${JSON.stringify(bad)}`); };
  const darkLeft=async(pg,label)=>{ // yorug' rejimda to'q fon qolib ketmagan: kartalar/panel fonlari
    const bad=await pg.evaluate(()=>{ const out=[]; document.querySelectorAll('#dash-content *, #dashboard-view .dash-side *, #main-nav, #top-util').forEach(el=>{const r=el.getBoundingClientRect(); if(r.width<60||r.height<24) return; const c=getComputedStyle(el).backgroundColor.match(/[\d.]+/g); if(!c) return; const a=c[3]===undefined?1:+c[3]; if(a<.9) return; const l=(+c[0]*0.2126+ +c[1]*0.7152+ +c[2]*0.0722); if(l<70){ const cs=getComputedStyle(el); if(cs.backgroundImage.includes('gradient')||cs.backgroundImage.includes('url(')) return; out.push(el.tagName+'.'+String(el.className).slice(0,34)+' rgb('+c.slice(0,3)+')'); }}); return out.slice(0,8); });
    ok(bad.length===0,`${label}: no leftover dark backgrounds in light mode ${JSON.stringify(bad)}`); };
  for(const theme of ['light','dark']){
    let pg=await open(null,theme); await audit(pg,'body','landing',theme); await pg.evaluate(()=>document.getElementById('leaderboard').scrollIntoView()); await pg.waitForTimeout(1500); await audit(pg,'#leaderboard','monthly ranking',theme); await pg.screenshot({path:`ta-landing-${theme}.png`}); await pg.context().close();
    for(const [ph,tab,label] of [[fph,'overview','farmer overview'],[fph,'products','farmer listings'],[fph,'bookings','farmer bookings'],[fph,'shipments','farmer shipments'],[fph,'agrostore','farmer agro-store'],[fph,'payments','farmer finance'],[mph,'overview','market overview'],[mph,'bookings','market bookings'],[mph,'payments','market finance'],[dph,'loads','driver loads'],[dph,'agrodriver','driver agro (soon)'],[aph,'agrosuppliers','admin suppliers'],[aph,'adm-dashboard','admin dashboard']]){
      pg=await open(ph,theme); await pg.evaluate((t)=>openDashboard(t),tab); await pg.waitForTimeout(2300);
      await audit(pg,'#dashboard-view',label,theme); if(theme==='light') await darkLeft(pg,label);
      if(label==='farmer listings'||label==='market bookings') await pg.screenshot({path:`ta-${label.replace(/\W+/g,'-')}-${theme}.png`});
      ok(pg.errs.length===0,label+' no page errors '+pg.errs.join('|')); await pg.context().close(); }
  }
  await prisma.$disconnect(); await b0.close();
})();
