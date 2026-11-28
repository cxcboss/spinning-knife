'use strict';
// WeChat makes the first canvas the only on-screen surface.
const screenCanvas=wx.createCanvas();
const platform=require('./platform');
const createEngine=require('./engine');
const createInterface=require('./interface');
const createCompositor=require('./compositor');
const createAudio=require('./audio');
const createRewards=require('./rewards');
const {installShareMenu,shareGame}=require('./social');

const clock={last:0,qScale:1};
const state={version:0,pressed:'',scrollPositions:{},day:0,shopReturn:'home',settingsReturn:'home',
  catalogReturn:false,achievement:null,supplyIndex:0,spin:null,pocketScroll:0};
const sound=createAudio();
const ads=createRewards(wx,undefined,Date.now,invalidate);
const e=createEngine({storage:platform.storage,timing:clock,open:go,toast:notice,
  rewards:ads,sound:sound.sound,vibrate:p=>wx.vibrateShort?.({type:Array.isArray(p)?'medium':'light'})});
const {Game,G,UI,SAVE,tr}=e;
let vp,assets,ui,compositor,hidden=false,ready=false,graphicsLost=false,frameId=null,pointer=null,nightCheck=0;
let lastPaint=-1,lastRewardFrame=-1,lastHud='',hudAt=0,hudVersion=0;
let sampleMs=0,sampleCount=0,slowSamples=0,fastSamples=0;
let scrollSpeed=0;
const endlessVideoPlacement='supply:endless';
const frenzyStartPlacement='supply:frenzy-start',frenzyTimePlacement='supply:frenzy-time';
const {scrollScreens}=createInterface;
const now=()=>Date.now();
const later=typeof requestAnimationFrame==='function'?fn=>requestAnimationFrame(fn):fn=>screenCanvas.requestAnimationFrame(fn);
const cancel=typeof cancelAnimationFrame==='function'?id=>cancelAnimationFrame(id):id=>screenCanvas.cancelAnimationFrame(id);
const pick=(zh,en)=>e.language==='zh'?zh:en;
function invalidate(){state.version++;lastHud='';hudAt=0;}
function notice(title){wx.showToast?.({title:String(title),icon:'none',duration:1800});}
function resize(){
  vp=platform.readViewport();UI.w=vp.width;UI.h=vp.height;scrollSpeed=0;
  const quality=SAVE.opts.q;
  const normal=Math.min(vp.pixelRatio,quality===1?2:1.65);
  let dpr=quality===2?Math.min(1,normal):quality===1?normal:normal*clock.qScale;
  dpr=Math.min(dpr,Math.sqrt((quality===1?2200000:1400000)/(vp.width*vp.height)));
  if(e.GFX.gl)e.GFX.resize(vp.width,vp.height,Math.max(.65,dpr));
  invalidate();
}
function soundtrack(){
  const track=UI.screen==='shop'?'bench':e.isExpertLevel(G.idx)&&!G.demo?'fast':G.L?.world||0;
  sound.theme(track,SAVE.opts.music!==false);
}
function go(page){
  ads.prepareRewards();
  if(UI.screen==='wheel'&&page!=='wheel')state.spin=null;
  if(page!==UI.screen){
    UI.view++;state.pressed='';state.settlementExpanded=false;pointer=null;scrollSpeed=0;ui?.clearHits();
  }
  UI.screen=page;
  if(page==='home'||page==='endless'||page==='frenzy'){
    if(page==='home'){state.prizeBack=null;state.shopReturn='home';state.settingsReturn='home';}
    if(!G.demo)Game.start(0,{demo:true});
  }
  if(page!=='shop')e.shopDraw.theme=-1;
  state.day=e.calendarDay();invalidate();soundtrack();clock.last=0;
}
function beginRun(start){
  start();state.pocketScroll=0;UI.cur=G.idx;SAVE.plays++;e.recordPlayDay();e.saveWrite();
  go('play');sampleMs=sampleCount=slowSamples=fastSamples=0;
}
function classic(i){if(e.isOpen(i))beginRun(()=>Game.start(i));}
function settleCourse(r){
  if(G.dailyChallenge){e.finishDailyRun(true);return;}
  if(r.paid)return;
  e.bankRunProgress();r.paid=true;r.doubled=false;
  SAVE.coins+=r.total;SAVE.stars[r.idx]=Math.max(SAVE.stars[r.idx],r.stars);SAVE.best[r.idx]=Math.max(SAVE.best[r.idx],r.total);
  SAVE.unlocked=Math.max(SAVE.unlocked,Math.min(e.NUM_LEVELS,r.idx+2));e.saveWrite();go('result');
  if(!hidden)ads.interstitialAfterResult();
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
function validRevive(){return UI.screen==='fail'&&G.dead&&G.mode==='failed'&&!G.dailyChallenge&&G.K.why!=='courseTime'&&!G.res?.paid;}
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
  if((p==='wheel'||p==='achievements'||p==='achievement')&&state.prizeBack){
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
  const purchase=!e.canEquip(k.id);
  const previous=SAVE.knife;
  if(purchase){
    if(k.source){
      state.prizeBack={index:UI.shopIdx,from:state.shopReturn};
      if(k.source==='achievement'){
        state.achievement=e.ACHIEVEMENTS.find(item=>item.knife===k.id);
        go(state.achievement?'achievement':'achievements');
      }else go('wheel');
      return;
    }
    if(!e.spendCoins(k.price)){shortfall(k.price);return;}SAVE.owned.push(k.id);
  }
  SAVE.knife=k.id;
  if(!e.saveWrite()){
    SAVE.knife=previous;
    if(purchase){SAVE.owned.pop();SAVE.coins+=k.price;}
    notice(pick('暂时无法保存，请重试','Could not save. Try again.'));
    return;
  }
  e.sfx('preview',{knife:k});
  if(state.shopReturn==='fail'){classic(UI.cur);return;}
  if(state.shopReturn==='frenzy-result'){go('frenzy');return;}
  invalidate();
}
function command(action){
  const [id,value]=action.split(':');
  const page=UI.screen;
  e.sfx(id==='back'||id==='home'||id.startsWith('cancel')?'back':'ui');
  switch(id){
    case 'play':classic(e.nextLevelIdx());break;
    case 'frenzy':go('frenzy');break;
    case 'startFrenzy':if(page==='frenzy')startFrenzyRun();break;
    case 'frenzyVideo':if(page==='frenzy')watchFrenzyStart();break;
    case 'frenzyTime':if(page==='play')watchFrenzyTime();break;
    case 'cancelFrenzy':if(page==='frenzy')go('home');break;
    case 'endless':case 'daily':case 'achievements':case 'wheel':case 'levels':case 'supplies':
      state.supplyIndex=0;go(id);break;
    case 'startEndless':if(page==='endless')startEndless();break;
    case 'endlessVideo':if(page==='endless')watchEndlessVideo();break;
    case 'cancelEndless':if(page==='endless')go('home');break;
    case 'startDaily':{
      const spec=e.dailyChallengeFor();if(e.dailyRecord(spec.day).started){invalidate();break;}
      beginRun(()=>{Game.start(2,{dailyChallenge:spec});e.beginDailyAttempt(spec);});break;
    }
    case 'pause':if(page==='play'&&!G.fin&&!G.dead){Game.pause();go('pause');}break;
    case 'resume':Game.resume();go('play');break;
    case 'home':if(page==='fail'&&G.endless)cashOut();go('home');break;
    case 'back':back();break;
    case 'nextLevel':classic(G.idx+1);break;
    case 'retry':if(G.frenzy)go('frenzy');else if(!G.dailyChallenge&&!G.endless)classic(UI.cur);break;
    case 'cashOut':cashOut();break;
    case 'settlementOptions':state.settlementExpanded=!state.settlementExpanded;invalidate();break;
    case 'revive':case 'videoRevive':revive(id==='videoRevive');break;
    case 'double':{
      const r=G.res;e.grantReward('double',()=>page==='result'&&r===G.res&&!r.doubled,()=>{r.doubled=true;SAVE.coins+=r.total;e.saveWrite();invalidate();});break;
    }
    case 'settings':state.settingsReturn=page==='pause'?'pause':'home';go('settings');break;
    case 'cancelDaily':if(page==='daily')go('home');break;
    case 'sfx':case 'music':case 'vib':SAVE.opts[id]=!SAVE.opts[id];e.saveWrite();soundtrack();invalidate();break;
    case 'language':e.setLanguage(e.language==='zh'?'en':'zh');invalidate();break;
    case 'quality':SAVE.opts.q=(SAVE.opts.q+1)%3;e.saveWrite();resize();break;
    case 'level':classic(Number(value));break;
    case 'shop':case 'failGear':openShop(page);break;
    case 'catalog':go('catalog');break;
    case 'pick':state.catalogReturn=true;weapon(e.KNIVES.findIndex(k=>k.id===value));go('shop');break;
    case 'prevKnife':case 'nextKnife':weapon(UI.shopIdx+(id==='prevKnife'?-1:1));break;
    case 'equip':equip();break;
    case 'pocket':
      if(page==='play')usePocketItem(value);
      break;
    case 'checkin':{
      const p=e.claimDaily();if(p){const s=e.ALL_SUPPLIES.find(i=>i.id===p.item);
        const bonus=p.power?e.byLanguage(e.ALL_SUPPLIES.find(i=>i.id===p.power))+' ×1':'';
        notice([e.byLanguage(s)+' ×'+p.n,bonus,p.coins?'+'+p.coins+' '+tr('coins'):''].filter(Boolean).join(' · '));invalidate();}break;
    }
    case 'supply':state.supplyIndex=e.ALL_SUPPLIES.findIndex(v=>v.id===value);invalidate();break;
    case 'buySupply':case 'supplyVideo':{
      const it=e.ALL_SUPPLIES[state.supplyIndex];
      const receive=()=>{SAVE.stock[it.id]++;e.saveWrite();e.sfx('buy');invalidate();};
      if(id==='supplyVideo'){e.grantReward('supply:'+it.id,()=>UI.screen==='supplies',receive);break;}
      if(e.spendCoins(it.price))receive();else shortfall(it.price);
      break;
    }
    case 'ach':state.achievement=e.ACHIEVEMENTS.find(v=>v.id===value);go('achievement');break;
    case 'claimAchievement':{const p=e.claimAchievement(state.achievement.id);if(p){e.sfx('buy');notice(ui.prizeLabel(p));invalidate();}break;}
    case 'previewPrize':{const item=state.achievement;openShop('achievement');weapon(e.KNIVES.findIndex(v=>v.id===item.knife));break;}
    case 'shareGame':wx.shareAppMessage?.(shareGame(e.language));break;
    case 'spin':if(page==='wheel'&&!state.wheelAd)startWheelSpin();break;
    case 'spinVideo':if(page==='wheel')watchWheelVideo();break;
  }
}
function startEndless(video=false){
  if(!e.recordEndlessStart(video)){invalidate();return;}
  beginRun(()=>{
    Game.start(0,{endlessSeed:e.newEndlessSeed()});
    G.endless.videoEntry=video;
  });
}
async function watchEndlessVideo(){
  const eligible=()=>UI.screen==='endless'&&!e.endlessRemaining()&&e.endlessVideoRemaining()>0;
  if(state.endlessAd||!eligible()||!e.rewardAvailable(endlessVideoPlacement))return;
  state.endlessAd=true;invalidate();
  try{
    // A completed video still opens its round if the daily reset occurred during playback.
    await e.grantReward(endlessVideoPlacement,()=>UI.screen==='endless'&&e.endlessVideoRemaining()>0,()=>startEndless(true));
  }finally{
    state.endlessAd=false;invalidate();
  }
}
function startFrenzyRun(video=false){
  if(!video&&!e.recordFrenzyFreeStart()){invalidate();return;}
  beginRun(()=>{
    Game.startFrenzy().videoEntry=video;
  });
}
async function watchFrenzyStart(){
  if(state.frenzyAd||e.frenzyFreeLeft()||!e.rewardAvailable(frenzyStartPlacement))return;
  state.frenzyAd='start';invalidate();
  try{
    await e.grantReward(frenzyStartPlacement,()=>UI.screen==='frenzy',()=>startFrenzyRun(true));
  }finally{
    state.frenzyAd=null;clock.last=0;invalidate();
  }
}
async function watchFrenzyTime(){
  const round=G.frenzy;
  const eligible=()=>UI.screen==='play'&&G.mode==='frenzy'&&G.frenzy===round&&!!round&&
    !round.timeExtended&&!round.settled&&round.timeLeft>0;
  if(state.frenzyAd||!eligible()||!e.rewardAvailable(frenzyTimePlacement))return;
  state.frenzyAd='time';invalidate();
  try{
    await e.grantReward(frenzyTimePlacement,eligible,()=>Game.addFrenzyTime());
  }finally{
    state.frenzyAd=null;clock.last=0;invalidate();
  }
}
function startWheelSpin(fromVideo=false){
  if(state.spin)return;
  const previous=SAVE.progression.lastPrize,result=e.drawWheelPrize(undefined,undefined,fromVideo);
  if(!result){shortfall(e.WHEEL_COST);return;}
  state.spin={motion:e.wheelMotion(previous,result),ms:0,result,sector:-1};
  e.sfx('wheelStart');invalidate();
}
async function watchWheelVideo(){
  if(state.spin||state.wheelAd||!e.rewardAvailable('supply:wheel'))return;
  state.wheelAd=true;invalidate();
  try{
    await e.grantReward('supply:wheel',()=>UI.screen==='wheel'&&!state.spin,()=>startWheelSpin(true));
  }finally{
    state.wheelAd=false;invalidate();
  }
}
async function usePocketItem(id){
  if(state.pocketAd||G.mode!=='play'||!e.pocketAvailable())return;
  if(id==='revival'){notice(pick('复活药水在失败后使用','Use revival after a failed landing'));return;}
  if(!e.POCKET_POWERS.some(item=>item.id===id))return;
  if(G.usedPowers.includes(id)){notice(pick('本局已使用','Already used this run'));return;}
  if(e.useRunPower(id)){invalidate();return;}
  const placement='supply:'+id;
  if(!e.rewardAvailable(placement)){notice(tr('emptyStock'));return;}
  const knife=G.K;
  state.pocketAd=id;invalidate();
  try{
    await e.grantReward(placement,
      ()=>UI.screen==='play'&&G.K===knife&&G.mode==='play'&&e.pocketAvailable()&&!G.usedPowers.includes(id),
      ()=>e.useRunPower(id,true));
  }finally{
    state.pocketAd=null;clock.last=0;invalidate();
  }
}
function tapPoint(t){return {x:(t.clientX??t.pageX)/vp.scale,y:(t.clientY??t.pageY)/vp.scale};}
function tapStart(ev){
  if(!ready||hidden||graphicsLost||state.pocketAd||state.wheelAd||state.endlessAd||state.frenzyAd)return;
  const touch=ev.changedTouches?.[0]||ev.touches?.[0];if(!touch)return;
  const {x,y}=tapPoint(touch);
  const bottom=UI.screen==='play'?vp.safeBottom/vp.scale:vp.bottom;
  if(!['daily','endless','frenzy'].includes(UI.screen)&&(y<vp.top||y>bottom))return;
  sound.init();soundtrack();
  const id=ui.hitAt(x,y),area=UI.screen==='play'?ui.pocketArea(vp):null;
  const inPocket=area&&x>=area.x&&x<=area.x+area.w&&y>=area.y&&y<=area.y+area.h;
  if(pointer){
    if(pointer.pocket&&!inPocket&&!id&&UI.screen==='play')Game.tap();
    return;
  }
  const wasScrolling=Math.abs(scrollSpeed)>.08;
  if(inPocket||UI.screen!=='play')scrollSpeed=0;
  if(inPocket){
    const pocketId=wasScrolling?undefined:id;
    pointer={touch:touch.identifier,id:pocketId,x,y,view:UI.view,pocket:true,scroll:state.pocketScroll,max:area.max,
      lastScrollPoint:x,lastScrollAt:now(),scrollSpeed:0,dragged:wasScrolling};
    state.pressed=pocketId||'';return;
  }
  // Jump immediately. Frenzy keeps the same touch to steer after takeoff.
  if(UI.screen==='play'&&!id){
    if(!G.frenzy)Game.tap();
    else if(Game.tapFrenzy(x/vp.w,y/vp.h)){
      pointer={touch:touch.identifier,x,y,view:UI.view,frenzy:true};
    }
    return;
  }
  pointer={touch:touch.identifier,id,x,y,view:UI.view};
  const list=ui.scrollList;
  if(list&&list.max>0&&x>=list.x&&x<=list.x+list.w+8&&y>=list.top&&y<=list.bottom){
    pointer.scrollStart=state.scrollPositions[UI.screen]||0;
    pointer.lastScrollPoint=y;pointer.lastScrollAt=now();pointer.scrollSpeed=0;
    if(wasScrolling){pointer.id=undefined;pointer.dragged=true;}
  }
  if(pointer.id){state.pressed=pointer.id;invalidate();return;}
  if(UI.screen==='shop')UI.modelPressed=true;
}
function scrollTo(value){
  const list=ui.scrollList,positions=state.scrollPositions,page=UI.screen;
  if(!list||!scrollScreens.has(page))return false;
  const next=Math.max(0,Math.min(list.max,value));
  if(next===positions[page])return false;
  positions[page]=next;invalidate();
  return next>0&&next<list.max;
}
function scrollPocketTo(value,max){
  state.pocketScroll=Math.max(0,Math.min(max,value));
  return state.pocketScroll>0&&state.pocketScroll<max;
}
function sampleScroll(point){
  if(point===pointer.lastScrollPoint)return;
  const stamp=now(),dt=stamp-pointer.lastScrollAt;
  const velocity=(pointer.lastScrollPoint-point)/Math.max(dt,8);
  pointer.scrollSpeed=Math.max(-3,Math.min(3,dt>100?velocity:pointer.scrollSpeed*.4+velocity*.6));
  pointer.lastScrollPoint=point;pointer.lastScrollAt=stamp;
}
function moveTouch(touch){
  if(pointer?.frenzy){
    const {x,y}=tapPoint(touch);
    const axis=value=>Math.sign(value)*Math.max(0,Math.abs(value)-4)/48;
    Game.steerFrenzy(axis(x-pointer.x),axis(y-pointer.y));
    return;
  }
  if(pointer?.pocket){
    const {x,y}=tapPoint(touch),dx=x-pointer.x,dy=y-pointer.y;
    if(!pointer.dragged&&Math.hypot(dx,dy)<7)return;
    if(pointer.horizontal===undefined)pointer.horizontal=Math.abs(dx)>=Math.abs(dy);
    pointer.dragged=true;state.pressed='';
    if(pointer.horizontal){sampleScroll(x);scrollPocketTo(pointer.scroll-dx,pointer.max);}
    return;
  }
  if(pointer?.scrollStart===undefined)return;
  const y=tapPoint(touch).y,dy=y-pointer.y;
  if(!pointer.dragged&&Math.abs(dy)<7)return;
  if(!pointer.dragged){pointer.dragged=true;state.pressed='';invalidate();}
  sampleScroll(y);scrollTo(pointer.scrollStart-dy);
}
function tapEnd(ev,aborted){
  if(!pointer)return;
  const touch=Array.from(ev.changedTouches||[]).find(t=>t.identifier===pointer.touch);if(!touch&&(!aborted||ev.changedTouches?.length))return;
  if(!aborted&&touch)moveTouch(touch);
  const p=pointer;pointer=null;state.pressed='';UI.modelPressed=false;
  if(aborted||p.dragged||p.view!==UI.view){
    if(!aborted&&p.dragged&&p.view===UI.view&&now()-p.lastScrollAt<100)scrollSpeed=p.scrollSpeed;
    invalidate();return;
  }
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
    const key=[state.version,G.mode,Math.round(G.coinsShown),Math.round(G.progress*100),G.farthest,G.usedPowers?.join(','),Math.ceil(e.courseRemaining()??0),
      !!G.fin,G.dead,G.item,G.hint?.k,f?.score,f?.combo,Math.ceil(f?.timeLeft||0),!!f?.feverLeft,!!f?.rainLeft,!!f?.freezeLeft,
      spec?e.dailyRunScore(spec,e.dailyElapsed()):'',...e.TIMED_POWERS.map(p=>Math.max(0,Math.ceil((G.powerEnds?.[p.id]||0)-G.K.t)))].join('|');
    if(key!==lastHud){lastHud=key;hudVersion++;}
  }
  const top=compositor.layer('hud',hudVersion,vp.w,79,density,g=>ui.hud(g,vp));compositor.draw(top,0,vp.top,vp.w,79);
  const area=ui.pocketArea(vp);
  if(area){
    const key=[e.language,state.pressed,state.pocketAd,G.usedPowers.join(','),...e.ALL_SUPPLIES.map(item=>SAVE.stock[item.id])].join('|');
    const background=compositor.layer('pocket-background',0,area.w,area.h,density,g=>ui.paintPocketBackground(g,area));
    const tray=compositor.layer('pocket',key,area.stripWidth,area.h,density,g=>ui.pocket(g,area));
    compositor.draw(background,area.x,area.y,area.w,area.h);
    compositor.drawClipped(tray,area.x-state.pocketScroll,area.y,area.stripWidth,area.h,
      area.x+4,area.y,area.w-8,area.h);
  }
  const timeButton=ui.frenzyTimeControl(vp);
  if(timeButton){
    const urgent=G.frenzy.timeLeft<=8;
    drawRewardControl(timeButton,e.language+'|'+state.pressed+'|'+state.frenzyAd,t,density,urgent&&!state.frenzyAd);
  }
  const hint=G.frenzy?!G.frenzy.tapped?pick('点击起跳，按住滑动微调','Tap to jump, then drag to steer'):'':G.hint?tr(G.hint.k):'';
  if(hint){const w=Math.min(vp.content,Math.max(138,hint.length*(e.language==='zh'?14.5:8)+30));
    const bar=compositor.layer('hint',hint,w,36,density,g=>ui.hint(g,w,36,hint));
    compositor.draw(bar,vp.cx-w/2,(timeButton?.y??area?.y??vp.bottom)-42,w,36);}
}
function drawRewardControl(control,key,t,density,pulse){
  const {id,x,y,w,h}=control;
  const layer=compositor.layer('reward-'+id,key,w,h,density,g=>ui.paintReward(g,control));
  const timeButton=id==='frenzyTime';
  const period=timeButton?1100:1600;
  const wave=pulse?(1-Math.cos(t*Math.PI*2/period))/2:0;
  const scale=state.pressed===id ? .95 : 1+(timeButton ? .045 : -.035)*wave;
  const lift=timeButton?2*wave:0;
  compositor.draw(layer,x+w*(1-scale)/2,y+h*(1-scale)/2-lift,w*scale,h*scale);
}
function draw(t,dt){
  const page=UI.screen,live=page==='home'||page==='endless'||page==='frenzy'||page==='shop'||page==='play';
  const renderVersion=state.version;
  const rewardFrame=ui.rewardControl?Math.floor(t/33):-1;
  const moving=live||state.spin||rewardFrame!==lastRewardFrame;
  if(!moving&&lastPaint===state.version)return;
  const staticList=scrollScreens.has(page);
  if(page==='shop')e.shopDraw(dt);
  else if(!staticList)Game.draw();
  const density=Math.min(2,Math.max(1,vp.pixelRatio*vp.scale));
  compositor.begin(vp.w,vp.h);
  if(page==='play'){
    effects();hud(t,density);
  }else{
    const menu=compositor.layer('menu',state.version,vp.w,vp.h,density,g=>ui.paint(g,vp));
    compositor.draw(menu,0,0,vp.w,vp.h);
    const reward=ui.rewardControl;
    if(reward)drawRewardControl(reward,renderVersion,t,density,true);
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
  compositor.end();lastPaint=renderVersion;lastRewardFrame=rewardFrame;
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
  // Reserve the next frame before calling the game and native APIs. onHide can still cancel it.
  schedule();
  const t=Number.isFinite(stamp)?stamp:now();
  let ms=clock.last?t-clock.last:1000/60;clock.last=t;
  if(!(ms>0)||ms>1500)ms=1000/60;
  const dt=Math.min(ms/1000,.12);
  if(Math.abs(scrollSpeed)>.025){
    const step=Math.min(ms,42);
    const area=UI.screen==='play'?ui.pocketArea(vp):null;
    const moving=area?scrollPocketTo(state.pocketScroll+scrollSpeed*step,area.max):
      scrollTo(state.scrollPositions[UI.screen]+scrollSpeed*step);
    scrollSpeed=moving?scrollSpeed*Math.exp(-step/150):0;
  }
  if(UI.screen==='home'||UI.screen==='endless'||UI.screen==='frenzy'||
    (UI.screen==='play'&&!state.pocketAd&&!state.frenzyAd))Game.update(dt);
  if(t>=nightCheck){nightCheck=t+1000;if(e.calendarDay()!==state.day){state.day=e.calendarDay();ads.prepareRewards();invalidate();}}
  draw(t,dt);adapt(ms);
}
function background(){
  hidden=true;scrollSpeed=0;if(frameId!==null){cancel(frameId);frameId=null;}pointer=null;state.pressed='';UI.modelPressed=false;
  if(ready&&UI.screen==='play'&&!state.pocketAd&&!state.frenzyAd){
    if(G.fin&&!G.res&&!G.demo)e.gFinishResult();
    else if(!G.dead){Game.pause();go('pause');}
  }
  sound.suspend(true);clock.last=0;
}
function restore(){
  hidden=false;clock.last=0;nightCheck=0;hudAt=0;
  if(ready){ads.prepareRewards();resize();sound.suspend(false);soundtrack();schedule();}
}
function failure(message){wx.showModal?.({title:'小刀飞飞飞',content:message,showCancel:false});}
function initGraphics(){
  if(!e.GFX.init(screenCanvas,{atlas:assets.atlas}))throw Error('此设备无法创建 WebGL 画面');
  compositor=createCompositor(e.GFX.gl);
  resize();lastPaint=-1;lastHud='';
}
async function start(){
  e.initSave();wx.setPreferredFramesPerSecond?.(60);
  const [atlas,icons,models]=await Promise.all(['atlas.png','icons.png','models.png'].map(platform.readImage));
  assets={atlas,icons,models};initGraphics();ui=createInterface(e,state,assets);
  Game.onFail=failed;Game.onFinish=settleCourse;go('home');ready=true;
  let lastTouch=0;
  wx.onTouchStart(ev=>{lastTouch=now();tapStart(ev);});
  wx.onTouchMove(ev=>{
    const touch=Array.from(ev.changedTouches||ev.touches||[]).find(t=>t.identifier===pointer?.touch);
    if(touch)moveTouch(touch);
  });
  wx.onTouchEnd(ev=>{lastTouch=now();tapEnd(ev,false);});
  wx.onTouchCancel(ev=>tapEnd(ev,true));
  const mouseEvent=ev=>({changedTouches:[{identifier:'mouse',clientX:ev.x,clientY:ev.y}]});
  wx.onMouseDown?.(ev=>{if(ev.button===0&&now()-lastTouch>400)tapStart(mouseEvent(ev));});
  wx.onMouseMove?.(ev=>{if(pointer?.touch==='mouse')moveTouch(mouseEvent(ev).changedTouches[0]);});
  wx.onWheel?.(ev=>{if(scrollScreens.has(UI.screen)){scrollSpeed=0;scrollTo(state.scrollPositions[UI.screen]+ev.deltaY/vp.scale);}});
  wx.onMouseUp?.(ev=>{if(ev.button===0&&pointer?.touch==='mouse')tapEnd(mouseEvent(ev),false);});
  wx.onWindowResize?.(resize);
  installShareMenu(wx,()=>e.language);
  // Some hosts emit canvas events, others expose the native context lifecycle.
  const lost=ev=>{ev?.preventDefault?.();graphicsLost=true;if(frameId!==null){cancel(frameId);frameId=null;}if(UI.screen==='play'&&!state.pocketAd&&!state.frenzyAd&&!G.dead&&!G.fin){Game.pause();go('pause');}};
  const restored=()=>{try{initGraphics();graphicsLost=false;clock.last=0;schedule();}catch(err){failure(err.message);}};
  if(wx.onWebGLContextLost){wx.onWebGLContextLost(lost);wx.onWebGLContextRestored?.(restored);}
  else {screenCanvas.addEventListener?.('webglcontextlost',lost);screenCanvas.addEventListener?.('webglcontextrestored',restored);}
  wx.onMemoryWarning?.(()=>{e.GFX.pruneModels(true);if(SAVE.opts.q===0){clock.qScale=.7;resize();}});
  schedule();
}
wx.onHide(background);wx.onShow(restore);
start().catch(err=>{console.error(err);failure(err.message||String(err));});
