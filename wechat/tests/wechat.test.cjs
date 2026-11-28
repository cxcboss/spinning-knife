'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {viewport}=require('../game/platform');
const createEngine=require('../game/engine');
const createInterface=require('../game/interface');
const createRewards=require('../game/rewards');
const createAudio=require('../game/audio');
const cues=require('../game/assets/sounds');

function game(sound=()=>{},adUnits={},store=new Map()) {
  const rewards={available:placement=>!!adUnits.rewarded?.[placement.split(':')[0]]};
  const e=createEngine({storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},timing:{},rewards,
    open(){},toast(){},sound,vibrate(){}});
  e.GFX.batch=()=>({addMesh(){},clear(){},flat(){},dispose(){}});
  e.initSave();e.Game.start(0);
  return e;
}
function drawing(texts){
  return new Proxy({measureText:s=>({width:String(s).length*11}),fillText:s=>texts.push(String(s))},
    {get:(obj,key)=>obj[key]||(()=>{})});
}
test('微信广告使用各自的广告位，完整观看才发奖，插屏按通关数限频',async()=>{
  const timers={time:0}, options=[], videos=[];
  let shown=0, closeInterstitial;
  const makeVideo=()=>{
    const video={
      show:()=>Promise.resolve(),onClose(fn){this.close=fn;},onLoad(fn){this.loaded=fn;},
      offClose(){this.close=null;},onError(){},offError(){}
    };
    videos.push(video);
    return video;
  };
  const ads=createRewards({
    createRewardedVideoAd(option){options.push(option);return makeVideo();},
    createInterstitialAd(option){
      options.push(option);
      return {onClose(fn){closeInterstitial=fn;},onError(){},show(){shown++;return Promise.resolve();}};
    }
  },{rewarded:{revive:'reward-a',supply:'reward-b'},interstitial:'interstitial-a'},()=>timers.time);

  ads.prepareRewards();
  assert(!ads.available('supply:revival'));
  for(const video of videos)video.loaded();
  assert(ads.available('supply:revival'));
  assert(!ads.available('double'));
  const interrupted=ads.show('revive');
  videos[0].close({isEnded:false});
  assert.equal(await interrupted,false);
  timers.time=180000;
  const completed=ads.show('supply:revival');
  videos[1].close({isEnded:true});
  assert.equal(await completed,true);
  assert.deepEqual(options.slice(0,2),[
    {adUnitId:'reward-a',multiton:true,disableFallbackSharePage:true},
    {adUnitId:'reward-b',multiton:true,disableFallbackSharePage:true}
  ]);
  timers.time=300000;
  ads.interstitialAfterResult();
  ads.interstitialAfterResult();
  assert.equal(shown,0);
  ads.interstitialAfterResult();
  assert.equal(shown,1);
  assert.equal(await ads.show('revive'),false);
  closeInterstitial();
  ads.interstitialAfterResult();
  assert.equal(shown,1);
});
test('激励位按微信加载结果开关，共用同一广告位，失败不连播，后续可恢复',async()=>{
  let time=0,shows=0,changes=0;
  const videos=[];
  const ads=createRewards({createRewardedVideoAd(){
    const video={
      onLoad(fn){this.loaded=fn;},onError(fn){this.failed=fn;},onClose(fn){this.closed=fn;},
      show(){shows++;return Promise.resolve();},destroy(){this.destroyed=true;}
    };
    videos.push(video);
    return video;
  }},{rewarded:{supply:'shared',revive:'shared'}},()=>time,()=>changes++);
  ads.prepareRewards();
  assert.equal(videos.length,1);
  assert.equal(await ads.show('supply:wheel'),false);
  const first=videos[0];
  first.loaded();
  assert(ads.available('revive'));
  const attempt=ads.show('supply:wheel');
  assert.equal(await ads.show('revive'),false);
  first.failed({errCode:1004});
  assert.equal(await attempt,false);
  first.closed({isEnded:true});
  assert.equal(await ads.show('revive'),false);
  ads.prepareRewards();
  assert.equal(videos.length,1);
  time+=60001;
  ads.prepareRewards();
  assert(first.destroyed);
  first.loaded();
  assert(!ads.available('revive'));
  const second=videos[1];
  second.loaded();
  const success=ads.show('revive');
  second.closed({isEnded:true});
  assert.equal(await success,true);
  assert(!ads.available('supply:wheel'));
  second.loaded();
  assert(ads.available('supply:wheel'));
  second.show=()=>Promise.reject(new Error('show rejected'));
  assert.equal(await ads.show('revive'),false);
  assert(!ads.available('revive'));
  assert.equal(shows,2);
  assert(changes>0);
});
test('首页按钮回到底部安全区内的原位',()=>{
  const e=game(),ui=createInterface(e,{day:e.calendarDay()},{icons:{height:480},models:{}});
  e.UI.screen='home';
  for(const [width,height] of [[320,568],[390,844]]){
    const v=viewport({windowWidth:width,windowHeight:height});
    ui.paint(drawing([]),v);
    assert.equal(ui.zones().find(z=>z.id==='play').y,v.bottom-216+9);
    assert.equal(ui.zones().find(z=>z.id==='settings').y,v.bottom-216+156);
  }
});
test('关卡弹窗默认只有奖励和展开，展开后原按钮位置固定，限时关到时后可重试',()=>{
  const e=game(undefined,{rewarded:{revive:'test',double:'test',supply:'test'}});
  const state={day:e.calendarDay(),supplyIndex:0};
  const ui=createInterface(e,state,{icons:{height:576},models:{}});
  const v=viewport({windowWidth:320,windowHeight:568},{top:17,bottom:49,width:88});
  const texts=[],g=drawing(texts);
  e.G.res={idx:0,stars:2,base:3,mult:2,finishBonus:4,total:7};
  e.SAVE.stock.revival=1;
  for(const [page,id,label,otherActions] of [
    ['fail','videoRevive','复活',['revive','retry','failGear','home']],
    ['result','double','领双倍奖励',['nextLevel','retry','home']],
  ]){
    state.settlementExpanded=false;
    e.UI.screen=page;ui.paint(g,v);
    const range=ui.zones().find(z=>z.id===id);
    assert(range);
    assert.deepEqual(ui.zones().map(z=>z.id),[id,'settlementOptions']);
    const toggle=ui.zones()[1];
    assert.equal(ui.rewardControl.id,id);
    ui.paintReward(g);
    assert(texts.includes(label));
    assert(texts.includes('展开'));
    state.settlementExpanded=true;ui.paint(g,v);
    assert.deepEqual(ui.zones().map(z=>z.id),[id,'settlementOptions',...otherActions]);
    assert.deepEqual(ui.zones().slice(0,2),[range,toggle]);
    assert.equal(ui.hitAt(range.x+range.w/2,range.y+range.h/2),id);
    assert(texts.includes('收起'));
    state.settlementExpanded=false;ui.paint(g,v);
    assert.deepEqual(ui.zones(),[range,toggle]);
  }
  e.G.res.doubled=true;ui.paint(g,v);
  assert.deepEqual(ui.zones().map(z=>z.id),['nextLevel','settlementOptions']);
  e.UI.screen='supplies';ui.paint(g,v);
  assert.equal(ui.rewardControl.id,'supplyVideo');
  assert(ui.zones().some(z=>z.id==='buySupply'));
  e.UI.screen='fail';e.G.K.why='courseTime';ui.paint(g,v);
  assert.equal(ui.rewardControl,null);
  assert.deepEqual(ui.zones().map(z=>z.id),['retry','settlementOptions']);
});
test('横向视野裁剪保留跨过屏幕边缘的物体，并跟随相机移动',()=>{
  const {GFX}=game();
  const distance=10;
  const halfWidth=distance*GFX.cam.aspect;
  for(const center of [0,280]){
    GFX.setCamera([center,0,distance],[center,0,0],Math.PI/2);
    const left=center-halfWidth,right=center+halfWidth;
    const visible=(x0,x1)=>GFX.visibleWidth(x0,x1,-1,1,0,0);
    assert.equal(visible(left-2,left-1),false);
    assert.equal(visible(left-1,left+.01),true);
    assert.equal(visible(left-1,right+1),true);
    assert.equal(visible(right-.01,right+1),true);
    assert.equal(visible(right+1,right+2),false);
  }
});
test('微信胶囊、刘海、灵动岛和底部手势区不遮挡操作，触摸坐标命中同一按钮',()=>{
  const e=game(),texts=[],state={day:e.calendarDay(),supplyIndex:0,page:0,settingsReturn:'home'};
  const ui=createInterface(e,state,{icons:{height:384},models:{}}),g=drawing(texts);
  const devices=[
    [320,568,0,568,0,34],[390,844,47,810,0,76],[430,932,59,898,0,75],
    [393,864,45,843,0,81],[375,740,54,770,40,93]
  ];
  for(const [width,height,top,bottom,origin,capsuleBottom] of devices){
    const v=viewport({windowWidth:width,windowHeight:height,screenTop:origin,pixelRatio:3,
      safeArea:{left:0,right:width,top,bottom}}, {top:capsuleBottom-32,bottom:capsuleBottom,width:88});
    for(const page of ['home','play','pause','shop','catalog','levels','endless','settings','powers','supplies','wheel','achievements','fail','result']){
      e.UI.screen=page;e.G.res={idx:0,stars:2,base:3,mult:2,finishBonus:4,total:7};
      if(page==='play')ui.hud(g,v);else ui.paint(g,v);
      const zones=ui.zones();assert(zones.length>0,page);
      for(const z of zones){
        assert(z.y*v.scale>=capsuleBottom-origin+7.9,page+' '+z.id+' touches the capsule');
        assert((z.y+z.h)*v.scale<=Math.min(height-34,Math.min(height,bottom-origin)-20)+.01,page+' '+z.id+' touches the gesture bar');
        assert(z.x>=0&&(z.x+z.w)*v.scale<=width+.001);
        assert.equal(ui.hitAt(z.x+z.w/2,z.y+z.h/2),z.id);
      }
      assert(!zones.some(z=>['double','videoRevive','supplyVideo'].includes(z.id)));
    }
  }
  assert(!texts.some(s=>/广告|观看视频|Watch video/i.test(s)));
  assert(texts.includes('暂无库存')||texts.some(s=>s.endsWith('暂无库存')));
  assert.equal(e.PHYS.DT,1/120);
});
test('微信单机版载入旧档后保留金币、装备和无尽纪录，忽略旧邀请和挑战奖励',()=>{
  const key='spinning-knife.public.v1',store=new Map(),before=game();
  const day=before.calendarDay();
  const saved={...before.freshSave(),coins:380,endlessBest:22,knife:'heart-string',
    owned:['chef','heart-string'],invitation:{device:'d'.repeat(32),applied:60,slices:5}};
  store.set(key,JSON.stringify(saved));
  store.set(key+'.endless-quota',JSON.stringify({day,started:2,shares:['old-reward'],sent:[],replies:[]}));
  const e=game(undefined,{},store);

  assert.equal(e.SAVE.coins,380);
  assert.equal(e.SAVE.knife,'heart-string');
  assert.equal(e.SAVE.endlessBest,22);
  assert(e.canEquip('heart-string'));
  assert(!Object.hasOwn(e.SAVE,'invitation'));
  assert.deepEqual(e.endlessQuota(),{day,started:2});
  assert.equal(e.endlessRemaining(),1);

  e.saveWrite();
  e.saveEndlessQuota({...e.endlessQuota(),started:3});
  assert(!Object.hasOwn(JSON.parse(store.get(key)),'invitation'));
  assert.deepEqual(JSON.parse(store.get(key+'.endless-quota')),{day,started:3});
  assert.equal(e.endlessRemaining(),0);
  assert.equal(e.endlessRemaining(e.endlessQuota(day+1)),3);
});

test('无尽基础局数和激励视频局数各自限额，并且随存档跨启动、跨日重置',()=>{
  const store=new Map(),e=game(undefined,{rewarded:{supply:'test'}},store);
  const day=e.calendarDay();
  for(let i=0;i<3;i++)assert(e.recordEndlessStart());
  assert(!e.recordEndlessStart());
  assert.equal(e.endlessRemaining(),0);
  assert.equal(e.endlessVideoRemaining(),8);
  const v=viewport({windowWidth:320,windowHeight:568});
  const texts=[],ui=createInterface(e,{day},{icons:{height:480},models:{}});
  e.UI.screen='endless';ui.paint(drawing(texts),v);
  assert(texts.includes('今日可加开 8 局'));
  assert.equal(ui.rewardControl.id,'endlessVideo');
  assert.deepEqual(ui.zones().map(z=>z.id),['endlessVideo','cancelEndless']);

  for(let i=0;i<8;i++)assert(e.recordEndlessStart(true));
  assert(!e.recordEndlessStart(true));
  assert.equal(e.endlessRemaining(),0);
  assert.equal(e.endlessVideoRemaining(),0);
  ui.paint(drawing(texts),v);
  assert.deepEqual(ui.zones().map(z=>z.id),['cancelEndless']);
  assert(texts.includes('今日次数已用完'));

  const reopened=game(undefined,{},store);
  assert.deepEqual(reopened.endlessQuota(),{day,started:11,videoStarted:8});
  assert.equal(reopened.endlessVideoRemaining(),0);
  assert.equal(reopened.endlessRemaining(reopened.endlessQuota(day+1)),3);
  assert.equal(reopened.endlessVideoRemaining(reopened.endlessQuota(day+1)),8);
});
test('空中狂潮每天前三局免费，额外局有视频入口，所有局按得分结算',()=>{
  const store=new Map(),e=game(undefined,{rewarded:{supply:'test'}},store);
  const day=e.calendarDay(),ui=createInterface(e,{day},{icons:{height:480},models:{}});
  const v=viewport({windowWidth:320,windowHeight:568});
  const texts=[],g=drawing(texts);
  e.UI.screen='frenzy';ui.paint(g,v);
  assert.deepEqual(ui.zones().map(z=>z.id),['startFrenzy','cancelFrenzy']);
  assert.equal(ui.hitAt(v.x-2,v.top),'cancelFrenzy');
  assert(texts.includes('每 20 分得 1 金币'));
  for(let i=0;i<3;i++)assert(e.recordFrenzyFreeStart());
  assert(!e.recordFrenzyFreeStart());
  assert(e.saveWrite());
  assert.equal(game(undefined,{},store).frenzyFreeLeft(),0);
  assert.equal(e.frenzyFreeLeft(day+1),3);
  ui.paint(g,v);
  assert.deepEqual(ui.zones().map(z=>z.id),['frenzyVideo','cancelFrenzy']);
  assert.equal(ui.rewardControl.id,'frenzyVideo');

  const round=e.Game.startFrenzy(71);
  round.score=579;round.slices=60;round.coins=800;round.timeLeft=e.PHYS.DT;
  e.Game.update(1/60);
  assert.equal(round.result.earned,28);
  assert.equal(e.SAVE.coins,28);
  assert.equal(e.SAVE.frenzy.runsToday,3);
  e.Game.update(1/60);
  assert.equal(e.SAVE.coins,28);
});
test('视频加开的狂潮和无尽合用金币限额，重启结算时继续执行限额',()=>{
  const store=new Map(),e=game(undefined,{},store),day=e.calendarDay();
  const frenzy=(score,videoEntry)=>{
    const round=e.Game.startFrenzy(81);
    Object.assign(round,{score,videoEntry,timeLeft:e.PHYS.DT});
    e.Game.update(1/60);
    return round.result.earned;
  };
  assert.equal(frenzy(50,true),1);
  assert.equal(frenzy(1000,true),15);
  assert.equal(e.videoCoinRemaining(),24);
  e.SAVE.pendingEndless={coins:20,pad:5,videoEntry:true};
  assert.equal(e.bankEndlessReceipt().coins,8);
  assert.equal(e.videoCoinRemaining(),16);
  e.SAVE.pendingEndless={coins:150,pad:21,videoEntry:true};
  e.saveWrite();

  const reopened=game(undefined,{},store);
  assert.equal(reopened.SAVE.coins,39);
  assert.equal(reopened.SAVE.endlessBest,21);
  assert.equal(reopened.SAVE.pendingEndless,null);
  assert.equal(reopened.videoCoinRemaining(),1);
  reopened.SAVE.pendingEndless={coins:40,pad:22,videoEntry:true};
  assert.equal(reopened.bankEndlessReceipt().coins,1);
  reopened.SAVE.pendingEndless={coins:40,pad:23,videoEntry:true};
  assert.equal(reopened.bankEndlessReceipt().coins,0);
  reopened.SAVE.pendingEndless={coins:40,pad:24};
  assert.equal(reopened.bankEndlessReceipt().coins,40);
  assert.equal(reopened.SAVE.endlessBest,24);
  assert.equal(reopened.videoCoinRemaining(),0);
  assert.equal(reopened.videoCoinRemaining(day+1),40);
});
test('空中狂潮加时只生效一次，倒计时强化，滑动微调方向且不会瞬移',()=>{
  const e=game(undefined,{rewarded:{supply:'test'}}),state={};
  const ui=createInterface(e,state,{icons:{height:480},models:{}});
  const v=viewport({windowWidth:320,windowHeight:568});
  const round=e.Game.startFrenzy(72);round.timeLeft=8;
  e.UI.screen='play';
  const labels=[],g=drawing([]);
  g.fillText=function(text){labels.push({text,font:g.font});};
  ui.hud(g,v);
  assert(labels.some(({text,font})=>text==='8s'&&font.includes('24px')));
  const control=ui.frenzyTimeControl(v);
  assert.equal(control.label,'增加15s');
  assert.equal(ui.hitAt(control.x+control.w/2,control.y+control.h/2),'frenzyTime');
  assert(e.Game.addFrenzyTime());
  assert.equal(round.timeLeft,23);
  assert(!e.Game.addFrenzyTime());
  assert.equal(round.timeLeft,23);
  assert.equal(ui.frenzyTimeControl(v),null);
  assert.equal(ui.hitAt(control.x+control.w/2,control.y+control.h/2),undefined);

  const trajectory=dy=>{
    const mode=e.Game.startFrenzy(72);mode.targets=[];mode.waveTimer=100;
    assert(e.Game.tapFrenzy(.5,.5));
    const initial=e.G.K.y;
    assert(e.Game.steerFrenzy(0,dy));
    assert.equal(e.G.K.y,initial);
    for(let i=0;i<12;i++)e.Game.update(e.PHYS.DT);
    return e.G.K.y;
  };
  const neutral=trajectory(0),down=trajectory(4),up=trajectory(-4);
  assert(up>neutral+.7&&up<neutral+1.06);
  assert(down<neutral-.7&&down>neutral-1.06);
  e.Game.start(0);
  assert(!e.Game.steerFrenzy(0,-1));
  assert(!e.Game.addFrenzyTime());
});
test('狂潮里的三把特效刀具按三秒刀形与两秒特效形态循环',()=>{
  const e=game();
  for(const id of ['thousand','azure-dragon','heart-string','chef']){
    e.SAVE.knife=id;
    const round=e.Game.startFrenzy(73);
    round.targets=[];round.waveTimer=100;
    e.Game.tapFrenzy(.5,.5);
    assert.equal(e.G.K.spread,0,id);
    for(let step=0;step<336;step++)e.Game.update(e.PHYS.DT);
    assert.equal(e.G.K.spread,0,id);
    for(let step=0;step<48;step++)e.Game.update(e.PHYS.DT);
    assert.equal(e.G.K.spread,id==='chef'?0:1,id);
    e.Game.pause();e.Game.update(3);e.Game.resume();
    assert.equal(e.G.K.spread,id==='chef'?0:1,id);
    for(let step=0;step<240;step++)e.Game.update(e.PHYS.DT);
    assert.equal(e.G.K.spread,0,id);
    for(let step=0;step<360;step++)e.Game.update(e.PHYS.DT);
    assert.equal(e.G.K.spread,id==='chef'?0:1,id);
  }
});
test('微信包在最后一跳拾取三种限时补给后都能命中终点且只结算一次',()=>{
  const played=[];
  const e=game((name,options)=>{if(name==='power')played.push(options.id);});
  for(const item of e.TIMED_POWERS){
    e.Game.start(0);
    const {G,Game}=e,last=G.W.pl[G.W.pl.length-1];
    G.K.sp=last.id;G.K.sx=last.land;
    Game.update(e.PHYS.DT);
    const pickup={id:item.id,x:last.land+.85,y:G.K.y+.55,phase:0,taken:false};
    G.pickups=[pickup];
    const results=[];
    Game.onFinish=r=>results.push(r);
    Game.tap();
    for(let frame=0;frame<260;frame++){
      if(frame===20)Game.tap();
      Game.update(1/60);
    }
    assert.ok(pickup.taken,item.id);
    assert.ok(G.powerEnds[item.id]>=item.seconds,item.id);
    assert.equal(G.K.mode,'done',item.id);
    assert.equal(results.length,1,item.id);
    assert.equal(results[0].mult,G.K.mult);
    assert.ok(results[0].finishBonus>0);
  }
  assert.deepEqual(played,e.TIMED_POWERS.map(item=>item.id));
  for(const id of played)assert.ok(cues['power-'+id]?.[1]>0);
});

test('微信播放通道暂时失效时，补给不会打断游戏，终点仍能播放自己的音效',()=>{
  const played=[];
  let disconnected=0;
  const context={
    decodeAudioData(data,ready){ready({});},
    createBufferSource(){return {
      connect(){},disconnect(){disconnected++;},
      start(when,offset,duration){
        played.push([offset,duration]);
        if(played.length===1)throw Error('audio interrupted');
        this.onended();
      },
    };},
  };
  const sound=createAudio({createWebAudioContext:()=>context,
    getFileSystemManager:()=>({readFile:opts=>opts.success({data:new ArrayBuffer(0)})})});
  sound.init();
  sound.sound('power',{id:'triple'});sound.sound('finish',{m:10});
  assert.deepEqual(played,[cues['power-triple'],cues['finish-10']]);
  assert.equal(disconnected,2);

  let slots=0,attempts=0;
  const fallback=createAudio({createInnerAudioContext(){
    slots++;return {seek(){attempts++;throw Error('audio interrupted');},stop(){}};
  }});
  fallback.init();fallback.sound('power',{id:'goldrush'});fallback.sound('finish',{m:1});
  assert.equal(attempts,2);assert.equal(slots,1);
});

test('每日挑战屏蔽底层首页，关卡滚动后只响应可见卡片，设置移除重置入口',()=>{
  const e=game(),texts=[],state={page:0,day:e.calendarDay(),settingsReturn:'home'};
  const v=viewport({windowWidth:375,windowHeight:667}),g=drawing(texts);
  const ui=createInterface(e,state,{icons:{height:384},models:{}});
  e.UI.screen='daily';ui.paint(g,v);
  assert.deepEqual(ui.zones().map(z=>z.id),['startDaily','cancelDaily']);
  assert.equal(ui.hitAt(v.cx,v.bottom),'cancelDaily');
  assert.equal(ui.hitAt(v.cx,v.top),'cancelDaily');
  assert.equal(ui.hitAt(v.cx,ui.zones()[0].y-12),undefined);
  assert(!e.dailyRecord(state.day).started);
  e.SAVE.unlocked=e.NUM_LEVELS;state.scrollPositions={levels:0};e.UI.screen='levels';ui.paint(g,v);
  assert(ui.zones().some(z=>z.id==='level:0'));
  assert(!ui.zones().some(z=>z.id==='level:59'));
  state.scrollPositions.levels=1e5;ui.paint(g,v);
  assert.equal(state.scrollPositions.levels,ui.scrollList.max);
  assert(!ui.zones().some(z=>z.id==='level:0'));
  const last=ui.zones().find(z=>z.id==='level:59');
  assert.equal(ui.hitAt(last.x+last.w/2,last.y+last.h/2),'level:59');
  assert(Math.abs(last.y+last.h-v.bottom)<.01);
  e.UI.screen='settings';ui.paint(g,v);assert(!ui.zones().some(z=>z.id==='reset'));
});

test('朋友圈菜单在接口可用时同时启用好友与朋友圈，失败时保留好友分享',()=>{
  const {installShareMenu}=require('../game/social');
  const menus=[],callbacks={};let language='zh';
  const wx={
    onShareAppMessage(fn){callbacks.chat=fn;},
    onShareTimeline(fn){callbacks.timeline=fn;},
    showShareMenu(options){menus.push(options);}
  };
  installShareMenu(wx,()=>language);
  assert.deepEqual(menus[0].menus,['shareAppMessage','shareTimeline']);
  assert.deepEqual(callbacks.timeline(),{title:'来玩小刀飞飞飞！试试你能跳到第几根柱子。',query:''});
  assert.deepEqual(callbacks.timeline(),callbacks.chat());
  language='en';
  assert.equal(callbacks.chat().title,'Play 小刀飞飞飞! How far can you jump?');
  menus[0].fail();
  assert.deepEqual(menus[1].menus,['shareAppMessage']);
  delete wx.onShareTimeline;
  installShareMenu(wx,()=>language);
  assert.deepEqual(menus[2].menus,['shareAppMessage']);
});

test('微信单机包没有联网玩法入口、开放数据域和联网玩法接口',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const bundle=path.join(__dirname,'..','game');
  const config=require('../game/game.json');
  assert(!Object.hasOwn(config,'openDataContext'));
  assert(!Object.hasOwn(config,'plugins'));
  for(const file of ['open-data','invitation.js','invitation.config.js','live-battle.js','live-battle-enabled.js']){
    assert(!fs.existsSync(path.join(bundle,file)),file);
  }
  const api=/\b(?:requirePlugin|wx\.(?:cloud|getOpenDataContext|getFriendCloudStorage|setUserCloudStorage|getRankManager|login|request|getLaunchOptionsSync|requirePrivacyAuthorize))\b/;
  for(const file of fs.readdirSync(bundle).filter(file=>file.endsWith('.js'))){
    assert.doesNotMatch(fs.readFileSync(path.join(bundle,file),'utf8'),api,file);
  }

  const e=game(),state={};
  const v=viewport({windowWidth:320,windowHeight:568}),g=drawing([]);
  const ui=createInterface(e,state,{icons:{height:384},models:{}});
  const check=(page,ids)=>{
    e.UI.screen=page;ui.paint(g,v);
    assert.deepEqual(ui.zones().map(z=>z.id),ids);
    for(const z of ui.zones())assert(z.y>=v.top&&z.y+z.h<=v.bottom,z.id);
  };
  check('endless',['startEndless','cancelEndless']);
  assert.equal(ui.hitAt(v.x-2,v.top),'cancelEndless');
  e.G.res={distance:8,total:15};
  check('endless-result',['endless','shareGame','home']);
});

test('装备总览和成就复用竖向列表，保留页面位置且只有可见卡片可以点击',()=>{
  const e=game(),state={scrollPositions:{},day:e.calendarDay()};
  const ui=createInterface(e,state,{icons:{height:384},models:{}}),g=drawing([]);
  const v=viewport({windowWidth:320,windowHeight:568});
  for(const [page,id] of [['catalog','pick:'+e.KNIVES.at(-1).id],['achievements','ach:'+e.ACHIEVEMENTS.at(-1).id]]){
    e.UI.screen=page;ui.paint(g,v);
    assert(ui.scrollList.max>0);
    assert(!ui.zones().some(zone=>zone.id===id));
    state.scrollPositions[page]=1e5;ui.paint(g,v);
    assert.equal(state.scrollPositions[page],ui.scrollList.max);
    const end=ui.zones().find(zone=>zone.id===id);
    assert(end);
    assert.equal(ui.hitAt(end.x+end.w/2,end.y+end.h/2),id);
    assert(ui.zones().every(zone=>zone.id==='back'||zone.y>=ui.scrollList.top));
    assert(!ui.zones().some(zone=>['prev','nextPage'].includes(zone.id)));
  }
});

test('第 24 关复用原高难地形，第 44 关另有布置，旧末关存档能继续',()=>{
  const e=game();
  e.Game.start(23);
  const original=e.G.L;
  e.Game.start(43);
  assert.equal(e.NUM_LEVELS,60);
  assert.equal(e.isExpertLevel(43),true);
  assert.deepEqual(e.G.L.params,original.params);
  const features=W=>[W.pl.filter(p=>p.needTap).length,W.pl.filter(p=>p.mv).length,W.spk.length];
  assert.deepEqual(features(e.G.L.W),features(original.W));
  assert.equal(e.G.L.W.angleScale,original.W.angleScale);
  assert.notDeepEqual(e.G.L.W.pl,original.W.pl);
  assert.equal(e.levelCaption(43),e.tr('level',{n:44})+' · '+e.tr('challenge'));
  const {SAVE}=e;
  SAVE.stars[29]=2;SAVE.unlocked=30;e.saveWrite();e.initSave();
  assert.equal(SAVE.unlocked,31);
  assert.equal(SAVE.stars[29],2);
  assert.equal(SAVE.stars.length,60);
});

test('邀请奖励只计有效首局，旧玩家与重复请求不发奖，跨设备各自只能领取一次余额',async()=>{
  const {createInvitationService}=require('../archive/cloudfunctions/friendInvitation/service');
  let time=0;
  const data=new Map(),db={
    read:async (kind,id)=>structuredClone(data.get(kind+'/'+id)||null),
    write:async (kind,id,value)=>{data.set(kind+'/'+id,structuredClone(value));}
  };
  const call=createInvitationService(db,()=>time),a='a'.repeat(32),b='b'.repeat(32);
  const owner=await call('inviter',{action:'status',device:a});
  assert.equal((await call('inviter',{action:'begin',invite:owner.invite,priorPlay:false})).code,'self');
  assert.equal((await call('old',{action:'begin',invite:owner.invite,priorPlay:true})).code,'existing');
  assert.equal((await call('new',{action:'begin',invite:owner.invite,priorPlay:false})).ok,true);
  assert.equal((await call('new',{action:'complete',slices:5})).code,'unfinished');
  time=45000;
  assert.equal((await call('new',{action:'complete',slices:0})).code,'unfinished');
  assert.equal((await call('new',{action:'complete',slices:5})).ok,true);
  assert.equal((await call('new',{action:'complete',slices:5})).ok,true);
  assert.equal((await call('inviter',{action:'status',device:a})).available,1);
  assert.equal((await call('inviter',{action:'claim',device:a})).total,60);
  assert.equal((await call('inviter',{action:'claim',device:a})).total,60);
  assert.equal((await call('inviter',{action:'claim',device:b})).total,0);
  assert.equal((await call('inviter',{action:'status',device:a})).available,0);
});

test('第 36 关起跳后倒计时，暂停不计时，超时按失败处理',()=>{
  const e=game();
  e.Game.start(35);
  assert.equal(e.courseRemaining(),40);
  e.Game.update(.05);
  assert.equal(e.courseRemaining(),40);
  e.Game.tap();e.Game.update(.05);
  assert(e.courseRemaining()<40);
  e.Game.pause();
  const left=e.courseRemaining();
  e.Game.update(8);
  assert.equal(e.courseRemaining(),left);
  e.Game.resume();e.G.courseElapsed=39.99;e.Game.update(.05);
  assert.equal(e.courseRemaining(),0);
  assert.equal(e.G.K.why,'courseTime');
  assert.equal(e.SAVE.progression.deaths,1);
  assert.equal(e.SAVE.progression.timeouts,1);
});

test('局内道具无需携带，同种每局只扣一次，每日挑战不能使用',()=>{
  const e=game();
  e.SAVE.stock.feather=2;
  e.SAVE.stock.triple=2;
  e.Game.start(0);
  assert.equal(e.G.K.feather,0);
  assert(e.useRunPower('feather'));
  assert.equal(e.G.K.feather,1);
  assert(!e.useRunPower('feather'));
  assert.equal(e.SAVE.stock.feather,1);
  assert(e.useRunPower('triple'));
  assert.equal(e.G.K.tripleUntil-e.G.K.t,7);
  const ui=createInterface(e,{pocketScroll:999},{icons:{height:384},models:{}});
  const viewportInfo=viewport({windowWidth:320,windowHeight:568});
  e.UI.screen='play';
  const area=ui.pocketArea(viewportInfo);
  assert(area.max>0);
  ui.hud(drawing([]),viewportInfo);
  assert.equal(ui.hitAt(area.x+area.w-24,area.y+25),'pocket:revival');
  assert.equal(ui.hitAt(area.x+area.w-1,area.y+25),undefined);
  e.Game.start(2,{dailyChallenge:e.dailyChallengeFor()});
  assert(!e.useRunPower('triple'));
  assert.equal(e.SAVE.stock.triple,1);
});

test('局内视频道具在零库存时立即生效，消耗次数但不增加库存，复活药水仅在失败时用',()=>{
  const e=game(undefined,{rewarded:{supply:'test'}});
  const icons={height:480};
  const ui=createInterface(e,{pocketScroll:0},{icons,models:{}});
  const v=viewport({windowWidth:390,windowHeight:844});
  const texts=[],glyphs=[],g=drawing(texts);
  g.drawImage=(image,sourceX,sourceY,sourceWidth,sourceHeight,x,y,w,h)=>{
    if(image===icons)glyphs.push({x:x+w/2,y:y+h/2});
  };
  e.Game.start(0);
  e.UI.screen='play';
  ui.pocket(g,ui.pocketArea(v));
  assert(!texts.includes('看视频'));
  assert.deepEqual(glyphs[0],{x:34,y:50});
  assert.equal(e.SAVE.stock.triple,0);
  assert(!e.useRunPower('triple'));
  assert(e.useRunPower('triple',true));
  assert.equal(e.G.K.tripleUntil-e.G.K.t,7);
  assert.equal(e.SAVE.stock.triple,0);
  assert.equal(e.SAVE.progression.suppliesUsed,1);
  assert(!e.useRunPower('triple',true));
  assert(!e.useRunPower('revival',true));
  e.Game.start(2,{dailyChallenge:e.dailyChallengeFor()});
  assert(!e.useRunPower('triple',true));
});

test('限定刀具详情显示实际成就名称和全部目标进度',()=>{
  const e=game(),state={day:e.calendarDay()};
  const ui=createInterface(e,state,{icons:{height:480},models:{}});
  const v=viewport({windowWidth:320,windowHeight:568});
  e.UI.screen='shop';e.UI.shopIdx=e.KNIVES.findIndex(k=>k.id==='thousand');
  const texts=[];
  ui.paint(drawing(texts),v);
  assert(texts.includes('成就 · 万刃归一'));
  for(const label of ['不同关通关  0 / 30','每日挑战通关  0 / 14','无尽最远柱数  0 / 60'])assert(texts.includes(label));
});
test('爱心刀标记为限定装备，售价 9999 金币，试刀演示三段变形并还原刀身',()=>{
  const e=game(),heart=e.KNIFE_BY_ID['heart-string'];
  assert.equal(heart.price,9999);
  assert(!e.canEquip(heart.id));
  assert.equal(e.knifeUnlockSource(heart),'special');
  assert.equal(e.knifeUnlockSource(e.KNIFE_BY_ID.rabbit),'achievement');
  assert.equal(e.knifeUnlockSource(e.KNIFE_BY_ID['azure-dragon']),'wheel');
  assert.equal(e.knifeUnlockSource(e.KNIFE_BY_ID.chef),undefined);
  const air={mode:'air',vy:1};
  assert.equal(e.heartFlightPhase(heart,air),1);
  assert.equal(e.heartFlightPhase(heart,{...air,tapped:true}),2);
  assert.equal(e.heartFlightPhase(heart,{...air,tapped:true,extraTapped:true}),3);
  assert.equal(e.heartFlightPhase(heart,{...air,vy:-1}),0);
  assert.deepEqual(e.benchHeartArt(.16),{bloom:1,pair:0,arrow:0});
  assert.deepEqual(e.benchHeartArt(.30),{bloom:1,pair:1,arrow:0});
  assert.deepEqual(e.benchHeartArt(.44),{bloom:1,pair:1,arrow:1});
  assert.equal(e.benchHeartArt(.72).bloom,0);
  const launch={mode:'air',vy:8,t:.16,tl:0,lastTap:-9};
  assert.deepEqual(e.heartFlightArt(heart,launch),{bloom:1,pair:0,arrow:0});
  assert.deepEqual(e.heartFlightArt(heart,{...launch,tapped:true,t:.39,lastTap:.20,boostStartVy:1}),{bloom:1,pair:1,arrow:0});
  assert.deepEqual(e.heartFlightArt(heart,{...launch,tapped:true,extraTapped:true,t:.58,lastTap:.43,boostStartVy:3}),{bloom:1,pair:1,arrow:1});
  assert.equal(e.heartFlightArt(heart,{...launch,vy:-1}),null);
  e.SAVE.daily.count=19;e.claimDaily();
  assert.equal(e.achievementState(e.ACHIEVEMENTS.find(a=>a.id==='checkin20')),'ready');
});
test('视频转盘免费抽一次，保留每日免费额度和稀有刀限制',()=>{
  const e=game(undefined,{rewarded:{supply:'test'}});
  const day=e.calendarDay();
  e.SAVE.coins=0;
  const previousFree=e.SAVE.progression.freeSpinDay;
  assert(e.rewardAvailable('supply:wheel'));
  const ui=createInterface(e,{day},{icons:{height:480},models:{}});
  e.UI.screen='wheel';
  ui.paint(drawing([]),viewport({windowWidth:320,windowHeight:568}));
  assert(ui.zones().some(z=>z.id==='spinVideo'));
  assert(ui.zones().some(z=>z.id==='spin'));
  const video=e.drawWheelPrize(day,()=>.99999,true);
  assert.equal(video.free,true);
  assert.equal(video.slot,0);
  assert.equal(e.SAVE.coins,20);
  assert.equal(e.SAVE.progression.freeSpinDay,previousFree);
  assert.equal(e.drawWheelPrize(day,()=>0).free,true);
  assert.equal(e.SAVE.progression.freeSpinDay,day);
  assert.equal(e.drawWheelPrize(day,()=>0),null);
  assert.equal(e.drawWheelPrize(day,()=>0,true).free,true);
  assert.equal(e.SAVE.coins,60);
});

test('爱心刀的五位邀请进度按新微信账号进入统计，金币仍需完赛',async()=>{
  const {createInvitationService}=require('../archive/cloudfunctions/friendInvitation/service');
  const records=new Map(),service=createInvitationService({
    read:async (col,id)=>records.get(col+'/'+id),
    write:async (col,id,value)=>{records.set(col+'/'+id,structuredClone(value));}
  });
  const device='d'.repeat(32),{invite}=await service('host',{action:'status',device});
  await service('already-played',{action:'observe'});
  for(const id of ['already-played','host']){
    assert.equal((await service(id,{action:'arrive',invite,priorPlay:false})).ok,false);
  }
  assert.equal((await service('existing-local',{action:'arrive',invite,priorPlay:true})).ok,false);
  for(let i=0;i<6;i++){
    assert.equal((await service('new-'+i,{action:'arrive',invite,priorPlay:false})).ok,true);
    assert.equal((await service('new-'+i,{action:'arrive',invite,priorPlay:false})).ok,true);
  }
  assert.equal((await service('new-1',{action:'complete',slices:2})).code,'unfinished');
  const status=await service('host',{action:'status',device});
  assert.equal(status.opened,5);
  assert.equal(status.earned,0);
});
