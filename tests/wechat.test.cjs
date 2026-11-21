'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {viewport}=require('../wechat/platform');
const createEngine=require('../wechat/engine');
const createInterface=require('../wechat/interface');
const createRewards=require('../wechat/rewards');

function game() {
  const store=new Map();
  const rewards=createRewards({createRewardedVideoAd(){assert.fail('Inactive placements created a video');}});
  const e=createEngine({storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},timing:{},rewards,
    open(){},toast(){},sound(){},vibrate(){}});
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
        assert((z.y+z.h)*v.scale<=Math.min(height,bottom-origin)-9.9,page+' '+z.id+' touches the gesture bar');
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
