'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {viewport}=require('../wechat/platform');
const createEngine=require('../wechat/engine');
const createInterface=require('../wechat/interface');
const createRewards=require('../wechat/rewards');
const createAudio=require('../wechat/audio');
const cues=require('../wechat/assets/sounds');

function game(sound=()=>{}) {
  const store=new Map();
  const rewards=createRewards({createRewardedVideoAd(){assert.fail('Inactive placements created a video');}});
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
    for(const page of ['home','play','pause','shop','catalog','levels','endless','invite','duel','settings','powers','supplies','wheel','achievements','fail','result']){
      e.UI.screen=page;state.duelCard={kind:'invite'};e.G.res={idx:0,stars:2,base:3,mult:2,finishBonus:4,total:7};
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
test('原生包使用同一套好友挑战规则，完成的成绩可以重发，重开游戏不会重复加次数',()=>{
  const a=game(),b=game(),id=a.issueDuel();
  assert.equal(a.openDuel(id).kind,'own');assert(b.startDuel(id));
  const run=b.G.frenzy;
  for(let n=0;n<4500&&!run.result;n++){
    if(n%24===0)b.Game.tapFrenzy(.4,.5);
    b.Game.update(1/60);
  }
  assert.equal(run.result.reply.id,id);
  assert.equal(b.openDuel(id).reply.score,run.result.score);
  assert.equal(a.openDuel(id,run.result.score).kind,'reward');
  a.initSave();
  assert.equal(a.openDuel(id,run.result.score).kind,'claimed');
  assert.equal(a.endlessRemaining(),5);
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
  e.SAVE.unlocked=e.NUM_LEVELS;e.UI.screen='levels';ui.paint(g,v);
  assert(ui.zones().some(z=>z.id==='level:0'));
  assert(!ui.zones().some(z=>z.id==='level:29'));
  state.levelScroll=1e5;ui.paint(g,v);
  assert.equal(state.levelScroll,ui.levelList.max);
  assert(!ui.zones().some(z=>z.id==='level:0'));
  const last=ui.zones().find(z=>z.id==='level:29');
  assert.equal(ui.hitAt(last.x+last.w/2,last.y+last.h/2),'level:29');
  assert(Math.abs(last.y+last.h-v.bottom)<.01);
  e.UI.screen='settings';ui.paint(g,v);assert(!ui.zones().some(z=>z.id==='reset'));
});
