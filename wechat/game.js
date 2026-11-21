'use strict';
// WeChat makes the first canvas the only on-screen surface.
const screenCanvas=wx.createCanvas();
const platform=require('./platform');
const createEngine=require('./engine');
const createInterface=require('./interface');
const createCompositor=require('./compositor');
const createAudio=require('./audio');
const createRewards=require('./rewards');

const clock={last:0,qScale:1};
const state={version:0,pressed:'',page:0,day:0,shopReturn:'home',settingsReturn:'home',
  catalogReturn:false,achievement:null,supplyIndex:0,spin:null,duelCard:null};
const sound=createAudio();
const e=createEngine({storage:platform.storage,timing:clock,open:go,toast:notice,
  rewards:createRewards(wx),sound:sound.sound,vibrate:p=>wx.vibrateShort?.({type:Array.isArray(p)?'medium':'light'})});
const {Game,G,UI,SAVE,tr}=e;
let vp,assets,ui,compositor,hidden=false,ready=false,graphicsLost=false,frameId=null,pointer=null,nightCheck=0;
let lastPaint=-1,lastHud='',hudAt=0,hudVersion=0,queuedLink=null;
let sampleMs=0,sampleCount=0,slowSamples=0,fastSamples=0;
const now=()=>Date.now();
const later=typeof requestAnimationFrame==='function'?fn=>requestAnimationFrame(fn):fn=>screenCanvas.requestAnimationFrame(fn);
const cancel=typeof cancelAnimationFrame==='function'?id=>cancelAnimationFrame(id):id=>screenCanvas.cancelAnimationFrame(id);
const pick=(zh,en)=>e.language==='zh'?zh:en;
function invalidate(){state.version++;lastHud='';hudAt=0;}
function notice(title){wx.showToast?.({title:String(title),icon:'none',duration:1800});}
function resize(){
  vp=platform.readViewport();UI.w=vp.width;UI.h=vp.height;
  const quality=SAVE.opts.q;
  const normal=Math.min(vp.pixelRatio,quality===1?2:1.65);
  let dpr=quality===2?Math.min(1,normal):quality===1?normal:normal*clock.qScale;
  dpr=Math.min(dpr,Math.sqrt((quality===1?2200000:1400000)/(vp.width*vp.height)));
  if(e.GFX.gl)e.GFX.resize(vp.width,vp.height,Math.max(.65,dpr));
  invalidate();
}
function soundtrack(){
  const track=UI.screen==='shop'?'bench':G.idx===9&&!G.demo?'fast':G.L?.world||0;
  sound.theme(track,SAVE.opts.music!==false);
}
function go(page){
  if(UI.screen==='wheel'&&page!=='wheel')state.spin=null;
  if(page!==UI.screen){UI.view++;state.pressed='';pointer=null;ui?.clearHits();}
  UI.screen=page;
  if(page==='home'){
    state.prizeBack=null;state.shopReturn='home';state.settingsReturn='home';
    if(!G.demo)Game.start(0,{demo:true});
  }
  if(page!=='shop')e.shopDraw.theme=-1;
  state.day=e.calendarDay();invalidate();soundtrack();clock.last=0;
  if(page==='home'&&ready&&queuedLink)handleLink(queuedLink);
}
function beginRun(start){
  start();UI.cur=G.idx;SAVE.plays++;e.recordPlayDay();e.saveWrite();
  go('play');sampleMs=sampleCount=slowSamples=fastSamples=0;
}
function classic(i){if(e.isOpen(i))beginRun(()=>Game.start(i));}
function settleCourse(r){
  if(G.dailyChallenge){e.finishDailyRun(true);return;}
  if(r.paid)return;
  e.bankRunProgress();r.paid=true;r.doubled=false;
  SAVE.coins+=r.total;SAVE.stars[r.idx]=Math.max(SAVE.stars[r.idx],r.stars);SAVE.best[r.idx]=Math.max(SAVE.best[r.idx],r.total);
  SAVE.unlocked=Math.max(SAVE.unlocked,Math.min(e.NUM_LEVELS,r.idx+2));e.saveWrite();go('result');
}
function cashOut(){
  if(!G.endless||G.mode!=='failed'||G.res?.paid)return;
  const receipt=e.bankEndlessReceipt();if(!receipt)return;
  G.res={total:receipt.coins,distance:receipt.pad,paid:true};go('endless-result');
}
function failed(){
  if(G.dailyChallenge){e.finishDailyRun(false);return;}
  if(G.endless&&(G.potionRevived||!SAVE.stock.revival)&&(G.adRevived||!e.rewardAvailable('revive'))){cashOut();return;}
  go('fail');
}
function validRevive(){return UI.screen==='fail'&&G.dead&&G.mode==='failed'&&!G.dailyChallenge&&!G.res?.paid;}
function revive(video){
  if(!validRevive())return;
  const knife=G.K;
  function respawn(){
    if(G.endless)SAVE.pendingEndless=null;
    e.gRespawn();e.saveWrite();go('play');
  }
  if(video){e.grantReward('revive',()=>G.K===knife&&validRevive()&&!G.adRevived,()=>{G.adRevived=true;respawn();});}
  else if(!G.potionRevived&&SAVE.stock.revival){SAVE.stock.revival--;G.potionRevived=true;respawn();}
}
function weapon(index){
  UI.shopIdx=(index+e.KNIVES.length)%e.KNIVES.length;UI.shopT=0;UI.sample=null;UI.sampleIndex=-1;UI.sampleFX.length=0;
  UI.pressBlend=0;UI.modelPressed=false;invalidate();
}
function openShop(from){
  state.shopReturn=from;state.catalogReturn=false;state.prizeBack=null;
  weapon(Math.max(0,e.KNIVES.findIndex(k=>k.id===SAVE.knife)));go('shop');
}
function back(){
  const p=UI.screen;
  if((p==='wheel'||p==='achievements')&&state.prizeBack){
    const idx=state.prizeBack.index;state.shopReturn=state.prizeBack.from;state.prizeBack=null;weapon(idx);go('shop');return;
  }
  if(p==='catalog'){state.catalogReturn=false;go('shop');return;}
  if(p==='shop'&&state.catalogReturn){state.catalogReturn=false;go('catalog');return;}
  if(p==='shop'){go(state.shopReturn);return;}
  if(p==='settings'){go(state.settingsReturn);return;}
  if(p==='achievement'){go('achievements');return;}
  go('home');
}
function shortfall(n){notice(tr('shortage',{n:Math.max(0,n-SAVE.coins)}));}
function equip(){
  const k=e.KNIVES[UI.shopIdx];
  if(!e.canEquip(k.id)){
    if(k.source){
      state.prizeBack={index:UI.shopIdx,from:state.shopReturn};
      state.page=0;go(k.source==='achievement'?'achievements':'wheel');return;
    }
    if(!e.spendCoins(k.price)){shortfall(k.price);return;}SAVE.owned.push(k.id);
  }
  SAVE.knife=k.id;e.saveWrite();e.sfx('preview',{knife:k});
  if(state.shopReturn==='fail'){classic(UI.cur);return;}
  if(state.shopReturn==='frenzy-result'){beginRun(()=>Game.startFrenzy());return;}
  invalidate();
}
function share(){
  let title=tr('shareMessage'),query='';
  if(UI.screen==='daily-result'){const r=G.dailyResult;title=tr('shareDailyResult',{title:e.byLanguage(r.spec),score:e.scoreText(r.spec,r.score)});query='screen=daily';}
  else if(UI.screen==='achievement'){const a=state.achievement;title=tr('shareEarned',{title:e.byLanguage(a),prize:a.knife?tr('shareBlade',{n:e.byLanguage(e.KNIFE_BY_ID[a.knife])}):''});}
  else if(UI.screen==='frenzy-result'){title=tr('frenzyShare',UI.frenzyResult);query='screen=frenzy';}
  return {title,query};
}
function sendDuel(reply){
  const id=reply?.id||e.issueDuel();if(!id)return;
  wx.shareAppMessage({title:reply?tr('duelScore',{n:reply.score}):tr('duelInvite'),query:e.duelQuery(id,reply?.score)});
}
function handleLink(query){
  if(!query||!(query.duel||query.screen))return;
  // Keep an interrupted run. Its invitation is presented when the player returns home.
  if(!ready||['play','pause','powers','fail'].includes(UI.screen)){queuedLink=query;return;}
  queuedLink=null;
  if(query.duel){state.duelCard=e.openDuel(query.duel,query.score);go('duel');}
  else if(query.screen==='daily')go('daily');
  else if(query.screen==='frenzy')go('frenzy-entry');
}

function command(action){
  const [id,value]=action.split(':');
  const page=UI.screen;
  e.sfx(id==='back'||id==='home'?'back':'ui');
  switch(id){
    case 'play':classic(e.nextLevelIdx());break;
    case 'frenzy':beginRun(()=>Game.startFrenzy());break;
    case 'endless':case 'daily':case 'achievements':case 'wheel':case 'levels':case 'supplies':
      state.page=0;state.supplyIndex=0;go(id);break;
    case 'invite':if(page==='endless')go('invite');break;
    case 'sendDuel':if(page==='invite')sendDuel();break;
    case 'replyDuel':{
      const reply=page==='duel'?state.duelCard?.reply:page==='frenzy-result'?UI.frenzyResult?.reply:null;
      if(reply&&e.openDuel(reply.id).kind==='invite')sendDuel(reply);break;
    }
    case 'playDuel':{
      const id=state.duelCard?.id;
      if(page==='duel'&&id&&e.openDuel(id).kind==='invite')beginRun(()=>e.startDuel(id));
      break;
    }
    case 'startEndless':{
      const q=e.endlessQuota();if(!e.endlessRemaining(q)){invalidate();break;}
      beginRun(()=>{Game.start(0,{endlessSeed:e.newEndlessSeed()});q.started++;e.saveEndlessQuota(q);});break;
    }
    case 'startDaily':{
      const spec=e.dailyChallengeFor();if(e.dailyRecord(spec.day).started){invalidate();break;}
      beginRun(()=>{Game.start(2,{dailyChallenge:spec});e.beginDailyAttempt(spec);});break;
    }
    case 'pause':if(page==='play'&&!G.fin&&!G.dead){Game.pause();go('pause');}break;
    case 'resume':Game.resume();go('play');break;
    case 'home':if(page==='fail'&&G.endless)cashOut();go('home');break;
    case 'back':back();break;
    case 'nextLevel':classic(G.idx+1);break;
    case 'retry':if(G.frenzy)beginRun(()=>Game.startFrenzy());else if(!G.dailyChallenge&&!G.endless)classic(UI.cur);break;
    case 'cashOut':cashOut();break;
    case 'revive':case 'videoRevive':revive(id==='videoRevive');break;
    case 'double':{
      const r=G.res;e.grantReward('double',()=>page==='result'&&r===G.res&&!r.doubled,()=>{r.doubled=true;SAVE.coins+=r.total;e.saveWrite();invalidate();});break;
    }
    case 'settings':state.settingsReturn=page==='pause'?'pause':'home';go('settings');break;
    case 'reset':go('confirmReset');break;
    case 'cancelReset':go('settings');break;
    case 'confirmReset':Object.assign(SAVE,{...e.freshSave(),opts:SAVE.opts});e.saveWrite();go('home');break;
    case 'sfx':case 'music':case 'vib':SAVE.opts[id]=!SAVE.opts[id];e.saveWrite();soundtrack();invalidate();break;
    case 'language':e.setLanguage(e.language==='zh'?'en':'zh');invalidate();break;
    case 'quality':SAVE.opts.q=(SAVE.opts.q+1)%3;e.saveWrite();resize();break;
    case 'prev':case 'nextPage':state.page=Math.max(0,state.page+(id==='prev'?-1:1));invalidate();break;
    case 'level':classic(Number(value));break;
    case 'shop':case 'failGear':openShop(page);break;
    case 'catalog':state.page=Math.floor(UI.shopIdx/9);go('catalog');break;
    case 'pick':state.catalogReturn=true;weapon(e.KNIVES.findIndex(k=>k.id===value));go('shop');break;
    case 'prevKnife':case 'nextKnife':weapon(UI.shopIdx+(id==='prevKnife'?-1:1));break;
    case 'equip':equip();break;
    case 'powers':if(page==='play'&&!G.frenzy&&!G.dailyChallenge&&!G.dead&&!G.fin&&!G.manualPowerUsed){Game.pause();go('powers');}break;
    case 'use':{
      const item=e.TIMED_POWERS.find(it=>it.id===value);
      if(page!=='powers'||!item||G.manualPowerUsed)break;
      const apply=()=>{G.manualPowerUsed=true;e.activatePower(item);Game.resume();go('play');};
      if(SAVE.stock[value]){SAVE.stock[value]--;e.saveWrite();apply();}
      else e.grantReward('run:'+value,()=>UI.screen==='powers'&&!G.manualPowerUsed,apply);
      break;
    }
    case 'checkin':{
      const p=e.claimDaily();if(p){const s=e.ALL_SUPPLIES.find(i=>i.id===p.item);
        const bonus=p.power?e.byLanguage(e.ALL_SUPPLIES.find(i=>i.id===p.power))+' ×1':'';
        notice([e.byLanguage(s)+' ×'+p.n,bonus,p.coins?'+'+p.coins+' '+tr('coins'):''].filter(Boolean).join(' · '));invalidate();}break;
    }
    case 'supply':state.supplyIndex=e.ALL_SUPPLIES.findIndex(v=>v.id===value);invalidate();break;
    case 'buySupply':case 'supplyVideo':case 'carry':{
      const it=e.ALL_SUPPLIES[state.supplyIndex];
      const receive=()=>{SAVE.stock[it.id]++;e.saveWrite();e.sfx('buy');invalidate();};
      if(id==='supplyVideo'){e.grantReward('supply:'+it.id,()=>UI.screen==='supplies',receive);break;}
      if(id==='carry'){if(e.SUPPLIES.includes(it)&&(SAVE.stock[it.id]||SAVE.loadout===it.id)){SAVE.loadout=SAVE.loadout===it.id?'':it.id;e.saveWrite();invalidate();}}
      else if(e.spendCoins(it.price))receive();else shortfall(it.price);
      break;
    }
    case 'ach':state.achievement=e.ACHIEVEMENTS.find(v=>v.id===value);go('achievement');break;
    case 'claimAchievement':{const p=e.claimAchievement(state.achievement.id);if(p){e.sfx('buy');notice(ui.prizeLabel(p));invalidate();}break;}
    case 'previewPrize':{const item=state.achievement;openShop('achievement');weapon(e.KNIVES.findIndex(v=>v.id===item.knife));break;}
    case 'shareScore':wx.shareAppMessage(share());break;
    case 'spin':{
      if(state.spin)break;
      const prev=SAVE.progression.lastPrize,result=e.drawWheelPrize();
      if(!result){shortfall(e.WHEEL_COST);break;}
      state.spin={motion:e.wheelMotion(prev,result),ms:0,result,sector:-1};e.sfx('wheelStart');invalidate();break;
    }
  }
}
function tapPoint(t){return {x:(t.clientX??t.pageX)/vp.scale,y:(t.clientY??t.pageY)/vp.scale};}
function tapStart(ev){
  if(!ready||hidden||graphicsLost||pointer)return;
  const touch=ev.changedTouches?.[0]||ev.touches?.[0];if(!touch)return;
  const {x,y}=tapPoint(touch);if(y<vp.top||y>vp.bottom)return;
  sound.init();soundtrack();
  const id=ui.hitAt(x,y);pointer={touch:touch.identifier,id,x,y,view:UI.view};
  if(id){state.pressed=id;invalidate();return;}
  if(UI.screen==='play'){if(G.frenzy)Game.tapFrenzy(x/vp.w,y/vp.h);else Game.tap();}
  else if(UI.screen==='shop')UI.modelPressed=true;
}
function tapEnd(ev,aborted){
  if(!pointer)return;
  const touch=Array.from(ev.changedTouches||[]).find(t=>t.identifier===pointer.touch);if(!touch&&!aborted)return;
  const p=pointer;pointer=null;state.pressed='';UI.modelPressed=false;
  if(aborted||p.view!==UI.view){invalidate();return;}
  const {x,y}=tapPoint(touch),dx=x-p.x,dy=y-p.y;
  if(p.id){if(Math.hypot(dx,dy)<22&&ui.hitAt(x,y)===p.id)command(p.id);invalidate();}
  else if(UI.screen==='shop'){
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))weapon(UI.shopIdx+(dx<0?1:-1));
    else if(Math.hypot(dx,dy)<22)e.previewCut();
  }
}
function effects(){
  const max=Math.min(vp.w,380)/420;
  function label(str,color,size,x,y,alpha,scale=1){
    if(!str||alpha<=0)return;
    const font=Math.max(12,Math.round(size*max)),w=Math.max(35,Math.ceil(String(str).length*font*1.13)+12),h=Math.ceil(font*1.65);
    const key='text:'+str+color+font;
    const sprite=compositor.layer(key,key,w,h,1.35,g=>{
      g.font='bold '+font+'px sans-serif';g.textBaseline='middle';g.textAlign='center';g.lineJoin='round';
      g.lineWidth=Math.max(2,font*.13);g.strokeStyle='rgba(23,35,52,.78)';g.strokeText(str,w/2,h/2);
      g.fillStyle=color;g.fillText(str,w/2,h/2);
    });
    compositor.draw(sprite,x-w*scale/2,y-h*scale/2,w*scale,h*scale,alpha);
  }
  for(const list of [e.FX.pops,e.FX.texts])for(const p of list){
    if(p.t<0)continue;const f=p.t/p.life,xy=e.GFX.project(p.x,p.y+p.vy*p.t,p.z??.8);
    label(p.text,p.col,p.size,xy[0]/vp.scale,xy[1]/vp.scale,Math.max(0,Math.min(1,f*10,(1-f)*4)));
  }
  const r=e.FX.rate;if(r){const f=r.t/r.life;
    label(r.text,r.col,r.size,vp.cx,vp.top+114-f*14,Math.min(1,f*10,(1-f)*4),1+.1*Math.sin(Math.min(1,f*6)*Math.PI));
    if(r.sub)label(r.sub,'#fff',r.size*.58,vp.cx,vp.top+139-f*14,Math.min(1,f*10,(1-f)*4));}
}
function hud(t,density){
  if(t>=hudAt||!lastHud){
    hudAt=t+83;
    const f=G.frenzy,spec=G.dailyChallenge;
    const key=[state.version,G.mode,Math.round(G.coinsShown),Math.round(G.progress*100),G.farthest,G.manualPowerUsed,
      !!G.fin,G.dead,G.item,G.hint?.k,f?.score,f?.combo,Math.ceil(f?.timeLeft||0),!!f?.feverLeft,!!f?.rainLeft,!!f?.freezeLeft,
      spec?e.dailyRunScore(spec,e.dailyElapsed()):'',...e.TIMED_POWERS.map(p=>Math.max(0,Math.ceil((G.powerEnds?.[p.id]||0)-G.K.t)))].join('|');
    if(key!==lastHud){lastHud=key;hudVersion++;}
  }
  const top=compositor.layer('hud',hudVersion,vp.w,79,density,g=>ui.hud(g,vp));compositor.draw(top,0,vp.top,vp.w,79);
  const hint=G.frenzy?!G.frenzy.tapped?tr('frenzyHint'):'':G.hint?tr(G.hint.k):'';
  if(hint){const w=Math.min(vp.content,Math.max(138,hint.length*(e.language==='zh'?14.5:8)+30));
    const bar=compositor.layer('hint',hint,w,36,density,g=>ui.hint(g,w,36,hint));compositor.draw(bar,vp.cx-w/2,vp.bottom-38,w,36);}
}
function draw(t,dt){
  const renderVersion=state.version;
  const page=UI.screen,live=page==='home'||page==='shop'||page==='play',moving=live||state.spin;
  if(!moving&&lastPaint===state.version)return;
  if(page==='shop')e.shopDraw(dt);
  else Game.draw();
  const density=Math.min(2,Math.max(1,vp.pixelRatio*vp.scale));
  compositor.begin(vp.w,vp.h);
  if(page==='play'){
    effects();hud(t,density);
  }else{
    const menu=compositor.layer('menu',state.version,vp.w,vp.h,density,g=>ui.paint(g,vp));
    compositor.draw(menu,0,0,vp.w,vp.h);
    if(page==='wheel'){
      const r=state.wheelRect,spin=state.spin;
      const wheel=compositor.layer('disc',e.language,r.w,r.w,density,g=>ui.disc(g,r.w));
      const angle=spin?e.wheelAngleAt(spin.motion,spin.ms):e.wheelStop(SAVE.progression.lastPrize);
      compositor.draw(wheel,r.x,r.y,r.w,r.w,1,angle*Math.PI/180);
      const pin=compositor.layer('pointer','pin',24,22,2,g=>{g.beginPath();g.moveTo(2,2);g.lineTo(22,2);g.lineTo(12,21);g.closePath();g.fillStyle='#ffecaa';g.fill();});
      compositor.draw(pin,vp.cx-12,r.y-3,24,22);
      if(spin){spin.ms+=dt*1000;const sector=Math.round(angle/45);
        if(sector!==spin.sector){spin.sector=sector;e.sfx('wheelTick');}
        if(spin.ms>=e.WHEEL_DURATION){state.spin=null;e.sfx('prizeReveal');notice(ui.prizeLabel(spin.result));invalidate();}}
    }
  }
  compositor.end();lastPaint=renderVersion;
}
function adapt(ms){
  if(UI.screen!=='play'||SAVE.opts.q!==0||ms<=0||ms>120)return;
  sampleMs+=ms;sampleCount++;
  if(sampleMs<1300)return;
  const mean=sampleMs/sampleCount;sampleMs=sampleCount=0;
  slowSamples=mean>19?slowSamples+1:0;fastSamples=mean<17.3?fastSamples+1:0;
  let next=clock.qScale;
  if(slowSamples>=2){next=Math.max(.6,next-.12);slowSamples=0;fastSamples=0;}
  if(fastSamples>=10){next=Math.min(1,next+.06);fastSamples=0;}
  if(next!==clock.qScale){clock.qScale=next;resize();}
}
function schedule(){if(ready&&!hidden&&!graphicsLost&&frameId===null)frameId=later(frame);}
function frame(stamp){
  frameId=null;if(!ready||hidden||graphicsLost)return;
  const t=Number.isFinite(stamp)?stamp:now();
  let ms=clock.last?t-clock.last:1000/60;clock.last=t;
  if(!(ms>0)||ms>1500)ms=1000/60;
  const dt=Math.min(ms/1000,.12);
  if(UI.screen==='home'||UI.screen==='play')Game.update(dt);
  if(t>=nightCheck){nightCheck=t+1000;if(e.calendarDay()!==state.day){state.day=e.calendarDay();invalidate();}}
  draw(t,dt);adapt(ms);schedule();
}
function background(){
  hidden=true;if(frameId!==null){cancel(frameId);frameId=null;}pointer=null;state.pressed='';UI.modelPressed=false;
  if(ready&&UI.screen==='play'){
    if(G.fin&&!G.res&&!G.demo)e.gFinishResult();
    else if(!G.dead){Game.pause();go('pause');}
  }
  sound.suspend(true);clock.last=0;
}
function restore(options){
  hidden=false;clock.last=0;nightCheck=0;hudAt=0;
  handleLink(options?.query);
  if(ready){resize();sound.suspend(false);soundtrack();schedule();}
}
function failure(message){wx.showModal?.({title:'小刀飞飞飞',content:message,showCancel:false});}
function initGraphics(){
  if(!e.GFX.init(screenCanvas,{atlas:assets.atlas}))throw Error('此设备无法创建 WebGL 画面');
  compositor=createCompositor(e.GFX.gl);resize();lastPaint=-1;lastHud='';
}
async function start(){
  e.initSave();wx.setPreferredFramesPerSecond?.(60);
  const [atlas,icons,models]=await Promise.all(['atlas.png','icons.png','models.png'].map(platform.readImage));
  assets={atlas,icons,models};initGraphics();ui=createInterface(e,state,assets);
  Game.onFail=failed;Game.onFinish=settleCourse;go('home');ready=true;
  handleLink(queuedLink||wx.getLaunchOptionsSync?.().query);
  let lastTouch=0;
  wx.onTouchStart(ev=>{lastTouch=now();tapStart(ev);});
  wx.onTouchEnd(ev=>{lastTouch=now();tapEnd(ev,false);});
  wx.onTouchCancel(ev=>tapEnd(ev,true));
  const mouseEvent=ev=>({changedTouches:[{identifier:'mouse',clientX:ev.x,clientY:ev.y}]});
  wx.onMouseDown?.(ev=>{if(ev.button===0&&now()-lastTouch>400)tapStart(mouseEvent(ev));});
  wx.onMouseUp?.(ev=>{if(ev.button===0&&pointer?.touch==='mouse')tapEnd(mouseEvent(ev),false);});
  wx.onWindowResize?.(resize);
  wx.showShareMenu?.({menus:['shareAppMessage']});wx.onShareAppMessage?.(share);
  // Some hosts emit canvas events, others expose the native context lifecycle.
  const lost=ev=>{ev?.preventDefault?.();graphicsLost=true;if(frameId!==null){cancel(frameId);frameId=null;}if(UI.screen==='play'&&!G.dead&&!G.fin){Game.pause();go('pause');}};
  const restored=()=>{try{initGraphics();graphicsLost=false;clock.last=0;schedule();}catch(err){failure(err.message);}};
  if(wx.onWebGLContextLost){wx.onWebGLContextLost(lost);wx.onWebGLContextRestored?.(restored);}
  else {screenCanvas.addEventListener?.('webglcontextlost',lost);screenCanvas.addEventListener?.('webglcontextrestored',restored);}
  wx.onMemoryWarning?.(()=>{e.GFX.pruneModels(true);if(SAVE.opts.q===0){clock.qScale=.7;resize();}});
  schedule();
}
wx.onHide(background);wx.onShow(restore);
start().catch(err=>{console.error(err);failure(err.message||String(err));});
