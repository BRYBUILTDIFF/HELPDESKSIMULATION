require('dotenv').config({quiet:true});
const fs=require('fs');const path=require('path');const {spawn}=require('child_process');const {randomUUID,randomBytes}=require('crypto');const bcrypt=require('bcryptjs');const prisma=require('../src/prisma');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){const keepAlive=setInterval(()=>{},1000);let browser,ws;const users=[];let sequence=0;const pending=new Map();const errors=[];
 try{
  const password='Aa1!'+randomBytes(16).toString('hex');
  for(const role of ['ADMIN','USER'])users.push(await prisma.user.create({data:{email:'browser-'+randomUUID()+'@example.invalid',passwordHash:await bcrypt.hash(password,10),firstName:'Terminal',lastName:'Review',role}}));
  const profile=path.resolve('.security/browser-terminal-'+randomUUID());fs.mkdirSync(profile,{recursive:true});
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=18739','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let targets;for(let i=0;i<40;i++){try{targets=await (await fetch('http://127.0.0.1:18739/json')).json();break;}catch{await sleep(250);}}
  if(!targets)throw Error('Headless browser did not start');
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout: "+method));},10000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const login=async user=>{await cdp('Network.clearBrowserCookies');const response=await fetch('http://127.0.0.1:5000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password})});if(!response.ok)throw Error('Fixture login failed');const value=response.headers.get('set-cookie').match(/refreshToken=([^;]+)/)[1];await cdp('Network.setCookie',{name:'refreshToken',value,url:'http://localhost:5173',path:'/api/auth',httpOnly:true,sameSite:'Strict'});};
  const click=async text=>{for(let i=0;i<40;i++){const clicked=await evaluate('(()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent.includes('+JSON.stringify(text)+'));if(!button)return false;button.click();return true;})()');if(clicked){await sleep(700);return;}await sleep(250);}throw Error('Missing button: '+text+'; page: '+await evaluate('document.body.innerText.slice(0,400)')); };
  const screenshot=async name=>{const result=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve('.security/'+name+'.png'),Buffer.from(result.data,'base64'));};
  if(process.env.TERMINAL_BROWSER_USER_ONLY!=='1'){
  await login(users[0]);await cdp('Page.navigate',{url:'http://localhost:5173/admin'});await sleep(1300);
  await click('Simulation Modules');
  const openTerminal = async label => {await evaluate('(()=>{const card=[...document.querySelectorAll(".sim-card")].find(c=>c.textContent.includes("Account Lockout"));const b=[...card.querySelectorAll("button")].find(b=>b.textContent.includes('+JSON.stringify(label)+'));if(!b)throw Error("Missing terminal action");b.click();})()');await sleep(700);};
  await openTerminal('View Simulation');
  if(await evaluate('Boolean(document.querySelector(".terminal-module-tester"))'))throw Error('View unexpectedly opened the editor');
  if(!await evaluate('Boolean(document.querySelector(".sim-runtime-body"))'))throw Error('Read-only preview missing');
  await evaluate('document.querySelector(".sim-preview-close-btn").click()');await sleep(200);
  await openTerminal('Edit Simulation');
  if(!await evaluate('Boolean(document.querySelector(".terminal-module-tester"))'))throw Error('Edit did not open the editor');
  await click('Validate and restart test');await click('Perform simulated checkpoint');
  const fields=await evaluate('document.querySelector(".terminal-step-guide")?.innerText || ""');if(!fields.includes('Instruction')||!fields.includes('Expected output')||!fields.includes('Copy command'))throw Error('Step fields missing');await screenshot('terminal-admin-desktop');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);await screenshot('terminal-admin-mobile');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  if(process.env.TERMINAL_BROWSER_ADMIN_ONLY==='1'){console.log('Admin browser checks passed: View opens the previous preview; Edit opens the action editor; checkpoint verification works; desktop/mobile captures taken.');return;}
  }
  await login(users[1]);await cdp('Page.navigate',{url:'http://localhost:5173/simulations'});await sleep(1300);
  for(let i=0;i<40;i++){if((await evaluate('document.body.innerText')).includes('Account Lockout'))break;await sleep(250);}
  const body=await evaluate('document.body.innerText');if(!body.includes('Account Lockout'))throw Error('Terminal catalog missing; page: '+body.slice(0,600));
  await evaluate('(()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Account Lockout") && (b.classList.contains("quick-card")||b.classList.contains("simulation-card")));if(!button)throw Error("Terminal module card missing");button.click();})()');await sleep(1000);
  await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(b=>/Skip all|Skip tour|Skip guide/i.test(b.textContent));if(b)b.click();})()');await sleep(500);
  await click('Perform simulated checkpoint');
  const text=await evaluate('document.body.innerText');if(!text.includes('Verified progress: 1 / 6'))throw Error('Verified progress did not advance');
  await screenshot('terminal-user-desktop');
  await evaluate('document.querySelector(".terminal-shell .xterm-helper-textarea").focus()');
  await cdp('Browser.grantPermissions',{origin:'http://localhost:5173',permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await cdp('Page.bringToFront');
  await evaluate('window.originalClipboard = navigator.clipboard; Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined}); document.querySelector(".terminal-command-copy").click()');await sleep(250);
  const copied=await evaluate('document.querySelector(".terminal-step-guide [role=status]").textContent');if(copied!=='Copied')throw Error('Selection-based clipboard fallback failed: '+copied+' '+await evaluate('JSON.stringify({focused:document.hasFocus(),enabled:document.queryCommandEnabled("copy")})'));
  await evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:window.originalClipboard})');
  const clipboard=await evaluate('navigator.clipboard.readText()');if(clipboard!==require('../src/services/terminalRuntime').ACTIONS['account.inspect'].command)throw Error('Clipboard contents do not match command');
  await evaluate('document.querySelector(".terminal-shell .xterm-helper-textarea").focus()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:2});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:2});await sleep(200);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await sleep(800);
  const entered=await evaluate('document.body.innerText');if(!entered.includes('Verified progress: 2 / 6'))throw Error('Typed terminal command did not advance verified progress');
  await cdp('Page.reload');await sleep(1500);const resumed=await evaluate('document.body.innerText');if(!resumed.includes('Verified progress: 2 / 6'))throw Error('Reload did not resume server progress');
  await evaluate('localStorage.setItem("helpdesk_simulation_theme_v2","dark")');await cdp('Page.reload');await sleep(1500);
  for(let i=0;i<28;i++){
    await evaluate('document.querySelector(".terminal-shell .xterm-helper-textarea").focus()');await cdp('Input.insertText',{text:'help'});await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await sleep(120);
  }
  await sleep(500);
  const scroll=await evaluate('(()=>{const slider=document.querySelector(".terminal-shell .xterm-scrollable-element .scrollbar.vertical .slider");const area=document.querySelector(".terminal-shell .xterm-screen");if(!slider)return null;const r=area.getBoundingClientRect();return {top:slider.style.top,height:slider.style.height,x:r.x+30,y:r.y+30};})()');
  if(!scroll)throw Error('Terminal scrollbar missing');
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:scroll.x,y:scroll.y,deltaX:0,deltaY:-2000});await sleep(600);
  const after=await evaluate('document.querySelector(".terminal-shell .xterm-scrollable-element .scrollbar.vertical .slider").style.top');
  if(scroll.top===after)throw Error('Terminal wheel scrolling did not move scrollback: '+JSON.stringify(scroll));
  await screenshot('terminal-user-dark-scrollback');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);await screenshot('terminal-user-mobile');
  if(errors.length)throw Error('Browser runtime exceptions: '+errors.join(', '));
  console.log('Browser checks passed: admin action editor and verified test, user checkpoint and reload/resume, desktop/mobile captures, no uncaught runtime exceptions.');
 }finally{clearInterval(keepAlive);if(ws)ws.close();if(browser)browser.kill();for(const user of users)await prisma.user.delete({where:{id:user.id}});await prisma.$disconnect();}}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

