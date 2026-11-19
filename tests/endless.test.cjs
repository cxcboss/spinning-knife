const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','旋转飞刀.html'),'utf8');
const code=html.split('<script>')[1].split('\ntry { boot();')[0];

function game(storage=new Map(),navigator={}){
  const nodes=new Map(),resources={live:0};
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},querySelector(){}});
    return nodes.get(key);
  };
  const api=vm.runInNewContext(code+`
    GFX.batch=()=>{resources.live++;return {addMesh(){},flat(){},clear(){},dispose(){resources.live--;}}};
    UI.stage=$('#stage');Game.onFail=showFail;Game.onFinish=showResult;
    ({ G,UI,SC,Game,SAVE,SAVE_KEY,PHYS,ENDLESS_QUOTA_KEY,canRevive,spendCoins,saveLoad,startEndless,act,
      endlessRemaining,endlessQuota,grantEndlessShare,newEndlessLevel,extendEndlessLevel,trimEndlessLevel,
      planHop,simHop,newKnife,padAt,useRevive,gFinishResult,knifeFell,gEvents,streamEndless })
  `,{resources,navigator,URLSearchParams,location:{search:''},document:{querySelector:node,documentElement:{style:{setProperty(){}}}},requestAnimationFrame(){},setTimeout(){},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  return {...api,storage,resources,node};
}

function lose(a,extraCoins=0){
  a.G.coins+=extraCoins;
  a.knifeFell(a.G.K,'void');a.gEvents();a.Game.update(.05);
  for(let i=0;i<12&&a.G.mode!=='failed';i++)a.Game.update(.05);
  assert.equal(a.G.mode,'failed');
}

test('默认开三局，分享每次增加两局且当天最多三次，取消不加局数',async()=>{
  const updates=[];
  let complete;
  const a=game(new Map(),{share(data){
    updates.push(data);
    return new Promise(resolve=>{complete=resolve;});
  }});
  for(let i=0;i<3;i++){
    a.UI.screen='endless';
    assert(await a.startEndless());
    assert.equal(a.endlessRemaining(),2-i);
  }
  a.UI.screen='endless';
  assert.equal(await a.startEndless(),false);
  const first=a.act('shareEndless');
  assert.equal(await a.act('shareEndless'),false);
  complete(Promise.reject(Object.assign(new Error('closed'),{name:'AbortError'})));
  assert.equal(await first,false);
  assert.equal(a.endlessRemaining(),0);
  for(let i=0;i<3;i++){
    const share=a.act('shareEndless');
    complete();
    assert(await share);
    assert.equal(a.endlessRemaining(),2*(i+1));
  }
  assert.equal(await a.act('shareEndless'),false);
  assert.equal(updates.length,4);
  assert.equal(updates[0].url,'https://cxcboss.github.io/spinning-knife/');
  const restored=game(a.storage),day=restored.endlessQuota().day;
  assert.equal(restored.endlessRemaining(),6);
  assert.equal(restored.endlessRemaining(restored.endlessQuota(day+1)),3);
});

test('旧版当日开局继续计入，分享凭据去重并按日期计数',()=>{
  const a=game(),day=a.endlessQuota().day;
  a.storage.set(a.ENDLESS_QUOTA_KEY,JSON.stringify({day,started:4,receipts:[]}));
  assert.equal(a.endlessRemaining(),0);
  assert.equal(a.endlessQuota().started,4);
  assert(!a.grantEndlessShare({day:day-1,id:'previous-day'}));
  assert(a.grantEndlessShare({day,id:'share-today'}));
  assert(!a.grantEndlessShare({day,id:'share-today'}));
  assert.equal(a.endlessRemaining(),1);
});

test('两种复活都能先用或后用，无尽结束只结算一次且续命不扣次数',async()=>{
  for(const first of ['item','ad']){
    const a=game(),second=first==='ad'?'item':'ad';
    a.SAVE.stock.revival=2;
    a.UI.screen='endless';assert(await a.startEndless());
    lose(a,12);
    assert.equal(a.SAVE.coins,0);
    assert(await a.useRevive(first));
    assert.equal(a.G.coins,12);
    assert.equal(a.endlessRemaining(),2);
    assert(!await a.useRevive(second));
    lose(a,9);assert(!a.canRevive(first));assert(a.canRevive(second));
    assert(await a.useRevive(second));
    lose(a,5);
    assert.equal(a.SAVE.stock.revival,1);
    assert.equal(a.UI.screen,'endless-result');
    assert.equal(a.SAVE.coins,26);
    assert.equal(await a.act('cashOutEndless'),false);
    const restored=game(a.storage);restored.saveLoad();
    assert.equal(restored.SAVE.coins,26);
  }
});

test('失败待结算时刷新，收入补发一次。旧版余额和已购装备继承',async()=>{
  const a=game();
  a.storage.set(a.SAVE_KEY,JSON.stringify({coins:1700,unlocked:4,owned:['chef','carrot'],knife:'carrot',stock:{gild:2}}));
  a.saveLoad();
  assert.equal(a.SAVE.knife,'carrot');
  assert.equal(a.SAVE.stock.revival,0);
  assert.equal(a.SAVE.stock.gild,2);
  a.UI.screen='endless';assert(await a.startEndless());
  lose(a,34);
  assert.equal(a.SAVE.coins,1700);
  const b=game(a.storage);b.saveLoad();
  assert.equal(b.SAVE.coins,1734);
  const c=game(a.storage);c.saveLoad();
  assert.equal(c.SAVE.coins,1734);
  assert.equal(c.SAVE.unlocked,4);
  assert.equal(c.endlessRemaining(),2);
});

test('普通关终点倍率只乘固定奖金，高倍率不会翻倍沿途收入',()=>{
  const a=game();
  a.Game.start(12);a.G.coins=87;a.G.fin={m:20};
  a.gFinishResult();
  assert.equal(a.G.res.finishBonus,40);
  assert.equal(a.SAVE.coins,127);
  assert.equal(a.G.res.total,127);
});

test('无尽赛道随机变化，连续走到第八十柱后仍然只保留周围区段',()=>{
  const a=game();
  const first=a.newEndlessLevel(613499),other=a.newEndlessLevel(873421);
  const shape=L=>JSON.stringify(L.W.pl.map(p=>[p.x0,p.x1,p.top,p.land]));
  const objects=L=>Array.from(L.endless.sections.flatMap(x=>x.objs),x=>x.t).join(',');
  assert.notEqual(shape(first),shape(other));assert.notEqual(objects(first),objects(other));
  assert.equal(first.W.tower,null);
  a.Game.start(0,{endlessSeed:613499});
  const W=a.G.W;
  for(let progress=0;a.G.K.sp<80&&progress<100;progress++){
    a.streamEndless();
    const previous=a.G.K.sp;
    const step=a.planHop(a.G.K,W,{quick:true});
    assert(step,'missing path from pillar '+previous);
    const next=a.simHop(a.G.K,W,step.delay,step.tau,4).K;
    assert(next.sp>previous);
    a.G.K=next;a.G.safePi=next.sp;a.G.cam.x=next.x;
  }
  assert(a.G.K.sp>=80);
  assert(W.firstPi>0);
  assert(W.pl.length<42);assert(a.SC.objs.length<60);assert(a.SC.sections.length<8);
  assert.equal(a.padAt(W,a.G.K.sp).id,a.G.K.sp);
  const buffers=a.resources.live;
  a.Game.start(0);
  assert(a.resources.live<buffers);
});

test('库存复活药水和广告复活也能在关卡模式中各用一次',async()=>{
  const a=game();
  a.Game.start(0);a.SAVE.stock.revival=1;
  lose(a);
  assert(await a.useRevive('item'));
  lose(a);
  assert(await a.useRevive('ad'));
  lose(a);
  assert.equal(a.UI.screen,'fail');
  assert(!a.canRevive('ad'));assert(!a.canRevive('item'));
  assert.equal(a.SAVE.stock.revival,0);
});
