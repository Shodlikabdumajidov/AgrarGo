const { chromium } = require('playwright-core'); const fs=require('fs');
const API='http://localhost:3000'; const rnd=()=>'+99890'+String(Math.floor(1000000+Math.random()*8999999)); const PW='parol1234';
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const call=async(path,body,tok,method='POST')=>{const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
(async()=>{
  const b0=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}); const css=fs.readFileSync('tw.css','utf8');
  const open=async(theme,lang,vp)=>{const ctx=await b0.newContext({locale:'uz-UZ',viewport:vp||{width:1280,height:900},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
    await ctx.route('https://agrargo-backend.onrender.com/**',async r=>{const q=r.request();const resp=await fetch(q.url().replace('https://agrargo-backend.onrender.com','http://localhost:3000'),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()||undefined});const buf=Buffer.from(await resp.arrayBuffer());r.fulfill({status:resp.status,headers:{'content-type':resp.headers.get('content-type')||'application/json','access-control-allow-origin':'*'},body:buf});});
    const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));pg.on('dialog',x=>x.accept());
    await pg.addInitScript(([t,l])=>{window.tailwind=window.tailwind||{};try{localStorage.setItem('agrargo_theme',t);localStorage.setItem('agrargo_lang',l);}catch(e){}const o=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('agrargo_tour_v1_')?'1':o.call(this,k);};},[theme,lang]);
    await pg.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'application/javascript',body:"var s=document.createElement('style');s.textContent="+JSON.stringify(css)+";document.head.appendChild(s);"}));
    await pg.route('https://unpkg.com/aos**',r=>r.fulfill({contentType:'application/javascript',body:'window.AOS={init(){}}'}));
    await pg.goto('http://localhost:8080/index.html');await pg.waitForTimeout(3300);
    return pg;};
  const typeCode=async(pg,code)=>{ await pg.locator('.otp-box').first().click(); await pg.keyboard.type(code,{delay:90}); };
  const devCode=async(pg)=>pg.locator('#dev-code').innerText();
  const lumAudit=async(pg,rootSel,label)=>{
    const bad=await pg.evaluate((sel)=>{
      const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
      const bgOf=el=>{let n=el; const stack=[]; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){stack.push(c); if(c.a>=.98)break;} n=n.parentElement;} let base={r:232,g:237,b:216}; for(let i=stack.length-1;i>=0;i--){const c=stack[i]; base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};} return base;};
      const out=[]; const root=document.querySelector(sel); if(!root) return ['missing '+sel];
      root.querySelectorAll('*').forEach(el=>{ const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1); if(!own) return; const cs=getComputedStyle(el); let g=el, grad=false; while(g&&g!==root.parentElement){ if(getComputedStyle(g).backgroundImage.includes('gradient')){grad=true;break;} g=g.parentElement;} if(grad) return; if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return; const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return; let p=el, hid=false; while(p&&p!==root){ if(getComputedStyle(p).display==='none'||getComputedStyle(p).visibility==='hidden'){hid=true;break;} p=p.parentElement;} if(hid) return;
        const fg=parse(cs.color); if(!fg) return; const bg=bgOf(el); const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(ratio<2.2) out.push(el.tagName+'.'+String(el.className).slice(0,30)+' "'+el.textContent.trim().slice(0,22)+'" '+ratio.toFixed(2)); });
      return out.slice(0,10);}, rootSel);
    ok(bad.length===0,label+': contrast OK '+JSON.stringify(bad)); };

  // ===== 1. Login kartasi: Glassy V3 =====
  let pg=await open('dark','uz');
  await pg.click('#auth-nav-btn'); await pg.waitForTimeout(700);
  const st=await pg.locator('#auth-modal .auth-card').evaluate(e=>{const c=getComputedStyle(e);return {bf:c.backdropFilter||c.webkitBackdropFilter,bc:c.borderTopColor,sh:c.boxShadow};});
  ok(/blur\(24px\)/.test(st.bf),'login card has backdrop-blur-xl ('+st.bf+')');
  ok(/rgba?\(16, 185, 129/.test(st.bc),'emerald border ('+st.bc+')');
  ok(/rgba\(16, 185, 129, 0\.15\)/.test(st.sh),'neon emerald glow shadow');
  ok(await pg.locator('#login-form').isVisible(),'Login form visible');
  await pg.screenshot({path:'ga-login-dark.png'});
  // ===== 2. Register -> OTP =====
  await pg.click('#tab-register'); await pg.waitForTimeout(400);
  await pg.click('.role-pill[data-role="CONSUMER"]'); await pg.waitForTimeout(300);
  const ph=rnd(); const f='#register-consumer-form';
  await pg.fill(f+' [name=fullName]','Dilnoza OTP'); await pg.fill(f+' [name=phone]',ph.slice(4)); await pg.selectOption(f+' [name=region]',{index:1},{force:true}).catch(async()=>{await pg.evaluate(()=>{const s=document.querySelector('#register-consumer-form [name=region]'); s.selectedIndex=1; s.dispatchEvent(new Event('change',{bubbles:true}));});});
  await pg.fill(f+' [name=district]','Siyob'); await pg.fill(f+' [name=password]',PW);
  ok(/Kodni yuborish/.test(await pg.locator(f+' .auth-submit').innerText()),'register button says "Kodni yuborish"');
  await pg.click(f+' .auth-submit'); await pg.waitForSelector('#verify-form:not(.hidden)',{timeout:6000}).catch(()=>{});
  ok(await pg.locator('#verify-form').isVisible(),'register -> OTP verification screen');
  ok(await pg.locator('.otp-box').count()===4,'4 OTP inputs');
  const code1=await devCode(pg); ok(/^\d{4}$/.test(code1),'simulation: 4-digit code shown in note ('+code1+')');
  ok(await pg.locator('#toast-stack').innerText().then(t=>t.includes(code1)),'simulation code shown in toast');
  await pg.waitForTimeout(400);
  ok(await pg.locator('.otp-box').first().evaluate(e=>document.activeElement===e),'first box focused');
  const anim=await pg.locator('.otp-box').first().evaluate(e=>getComputedStyle(e).animationName); ok(/otp-glow/.test(anim),'focused box has neon glow animation');
  ok(/Qayta yuborish: \d+ s/.test(await pg.locator('#resend-btn').innerText())&&await pg.locator('#resend-btn').isDisabled(),'resend disabled with countdown timer');
  await pg.screenshot({path:'ga-otp-dark.png'});
  // noto'g'ri kod
  const wrong=String((Number(code1)+1)%10000).padStart(4,'0');
  await typeCode(pg,wrong); await pg.waitForTimeout(2800);
  ok(await pg.locator('#verify-form.err').count()===1,'wrong code: error state (shake)');
  ok((await pg.locator('#verify-code').inputValue())==='','wrong code: boxes cleared');
  ok(await pg.locator('#auth-alert').innerText().then(t=>/noto'g'ri/i.test(t)),'wrong code message');
  // to'g'ri kod: loading -> success -> ro'yxatdan o'tildi
  await typeCode(pg,code1);
  await pg.waitForFunction(()=>document.getElementById('otp-overlay').dataset.state==='loading',null,{timeout:4000}).catch(()=>{});
  ok(await pg.locator('#otp-overlay').getAttribute('data-state')==='loading','loading state: neon ring overlay');
  await pg.screenshot({path:'ga-loading-dark.png'});
  await pg.waitForFunction(()=>document.getElementById('otp-overlay').dataset.state==='success',null,{timeout:6000}).catch(()=>{});
  ok(await pg.locator('#otp-overlay').getAttribute('data-state')==='success','success state');
  ok(/Muvaffaqiyatli tasdiqlandi/.test(await pg.locator('.otp-success').innerText()),'success card: "Muvaffaqiyatli tasdiqlandi"');
  await pg.waitForTimeout(500); await pg.screenshot({path:'ga-success-dark.png'});
  await pg.waitForTimeout(3200);
  ok(await pg.locator('#auth-nav-btn').innerText().then(t=>/Dilnoza/.test(t)),'after OTP the account is registered and signed in');
  const acc=await call('/auth/login',{phone:ph,password:PW}); ok(acc.status===200&&acc.body.user.role==='CONSUMER','account exists in the backend');
  ok(pg.errs.length===0,'no page errors (register) '+pg.errs.join('|')); await pg.context().close();

  // ===== 3. Parolni unutdim: OTP -> yangi parol =====
  pg=await open('dark','uz');
  await pg.click('#auth-nav-btn'); await pg.waitForTimeout(600);
  await pg.fill('#login-phone',ph.slice(4)); await pg.click('text=Parolni unutdingizmi?'); await pg.waitForTimeout(600);
  ok(await pg.locator('#forgot-form').isVisible(),'Login -> Forgot password slide');
  await pg.click('#forgot-form .auth-submit'); await pg.waitForSelector('#verify-form:not(.hidden)',{timeout:6000}).catch(()=>{});
  ok(await pg.locator('#verify-form').isVisible()&&await pg.locator('.otp-box').count()===4,'forgot -> 4-box OTP');
  const rc=await devCode(pg); ok(/^\d{4}$/.test(rc),'reset simulation code ('+rc+')');
  // paste
  await pg.evaluate((c)=>{const b=document.querySelector('.otp-box'); b.focus(); const dt=new DataTransfer(); dt.setData('text',c); b.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},rc);
  await pg.waitForFunction(()=>document.getElementById('otp-overlay').dataset.state==='success',null,{timeout:8000}).catch(()=>{});
  ok(await pg.locator('#otp-overlay').getAttribute('data-state')==='success','paste fills all boxes, auto-verifies');
  await pg.waitForSelector('#newpass-form:not(.hidden)',{timeout:6000}).catch(()=>{});
  ok(await pg.locator('#newpass-form').isVisible(),'success -> new password form');
  await pg.fill('#np-password','yangiParol777'); await pg.fill('#np-confirm','yangiParol777'); await pg.click('#newpass-form .auth-submit'); await pg.waitForTimeout(2000);
  ok(await pg.locator('#login-form').isVisible(),'back to login after reset');
  const relog=await call('/auth/login',{phone:ph,password:'yangiParol777'}); ok(relog.status===200,'new password works');
  // backspace + resend
  await pg.click('text=Parolni unutdingizmi?'); await pg.waitForTimeout(500); await pg.click('#forgot-form .auth-submit'); await pg.waitForSelector('#verify-form:not(.hidden)',{timeout:6000}).catch(()=>{});
  await pg.locator('.otp-box').first().click(); await pg.keyboard.type('12',{delay:60}); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace');
  ok((await pg.locator('#verify-code').inputValue())==='','Backspace moves back and clears boxes');
  await pg.waitForTimeout(5500); ok(await pg.locator('#resend-btn').isEnabled(),'resend enabled after timer'); const before=await devCode(pg);
  await pg.click('#resend-btn'); await pg.waitForTimeout(1200); ok(await pg.locator('#resend-btn').isDisabled(),'resend restarts the countdown');
  ok(pg.errs.length===0,'no page errors (reset) '+pg.errs.join('|')); await pg.context().close();

  // ===== 4. Light mode + i18n =====
  for(const [theme,lang,titleRe,okRe,qRe] of [['light','uz',/Telefonni tasdiqlang/,/Muvaffaqiyatli tasdiqlandi/,/Kod kelmadimi\?/],['light','ru',/Подтвердите телефон/,/Успешно подтверждено/,/Не пришёл код\?/],['dark','en',/Verify your phone/,/Verified successfully/,/Didn't receive the code\?/]]){
    pg=await open(theme,lang); await pg.click('#auth-nav-btn'); await pg.waitForTimeout(700);
    await lumAudit(pg,'#auth-modal',`[${theme}/${lang}] login card`);
    await pg.click('#tab-register'); await pg.waitForTimeout(300); await pg.click('.role-pill[data-role="CONSUMER"]'); await pg.waitForTimeout(300);
    const p2=rnd(); await pg.fill(f+' [name=fullName]','Test Tili'); await pg.fill(f+' [name=phone]',p2.slice(4)); await pg.evaluate(()=>{const s=document.querySelector('#register-consumer-form [name=region]'); s.selectedIndex=1; s.dispatchEvent(new Event('change',{bubbles:true}));}); await pg.fill(f+' [name=district]','Siyob'); await pg.fill(f+' [name=password]',PW);
    await pg.click(f+' .auth-submit'); await pg.waitForSelector('#verify-form:not(.hidden)',{timeout:6000}).catch(()=>{});
    ok(titleRe.test(await pg.locator('#auth-title').innerText()),`[${lang}] OTP title translated`);
    ok(qRe.test(await pg.locator('.otp-resend').innerText()),`[${lang}] "didn't receive code" translated`);
    ok(/\d s|\d с/.test(await pg.locator('#resend-btn').innerText()),`[${lang}] resend timer translated (${await pg.locator('#resend-btn').innerText()})`);
    await lumAudit(pg,'#auth-modal',`[${theme}/${lang}] OTP card`);
    await pg.screenshot({path:`ga-otp-${theme}-${lang}.png`});
    const c2=await devCode(pg); await typeCode(pg,c2);
    await pg.waitForFunction(()=>document.getElementById('otp-overlay').dataset.state==='success',null,{timeout:8000}).catch(()=>{});
    ok(okRe.test(await pg.locator('.otp-success').innerText()),`[${lang}] success card translated`);
    await lumAudit(pg,'#auth-modal',`[${theme}/${lang}] success card`);
    await pg.screenshot({path:`ga-success-${theme}-${lang}.png`});
    const misses=await pg.evaluate(()=>Object.keys(window.I18N_MISSES||{}).filter(x=>/otp|kod|SMS|Tasdiq|Simulyatsiya|raqam/i.test(x)&&!/[А-Яа-я]|Simulation/.test(x)));
    ok(lang==='uz'||misses.length===0,`[${lang}] no untranslated auth strings ${JSON.stringify(misses)}`);
    await pg.waitForTimeout(2500); await pg.context().close();
  }
  await b0.close();
})();
