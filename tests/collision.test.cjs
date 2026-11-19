const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped single-file game without starting its browser renderer.
const html = fs.readFileSync(path.join(__dirname, '..', '旋转飞刀.html'), 'utf8');
const source = html.split('<script>')[1].split('\ntry { boot();')[0];
function scene() {
  const api = vm.runInNewContext(source + `
    ({ G, SC, FX, PHYS, KNIVES, CUT_TIME, SLICEABLE, hexc, hBox, makePiece, mulberry32,
       newKnife, stepKnife, fxSliceStep, fxProcessCuts, genLevel, reviveSpot, respawnKnife, placeStuck, formParts, beginPose,
       startSlip, drawImpacts, materialImpact, FINISH_UV, atlUV, MATERIAL_ORDER })`, { URLSearchParams, location: { search: '' } });
  const { G, SC, PHYS } = api;
  const world = { pl: [{id:0,x0:-20,x1:20,top:-10}], zones:[], spk:[], voidY:-20, angleScale:1 };
  const knife = api.newKnife(world, 0, 0);
  Object.assign(knife, {x:0,y:0,a:0,mode:'air',sp:-1,t:1,vy:-2});
  Object.assign(G, {K:knife, W:world, equipment:api.KNIVES[0], hops:1, pickups:[], echoes:[],
    powerEnds:{goldrush:0,triple:0,rain:0},cutBase:0,itemCoins:0,critCoins:0});
  SC.objs=[];
  function brick(x,y,size=.028,z=0) {
    const mesh=api.hBox(0,0,0,size,size,.12,api.hexc('#bb8844'));
    const q={pc:api.makePiece([mesh],x,y,z),state:0,val:3};
    SC.objs=[{t:'stack',def:{},x0:x-size,x1:x+size,y0:y-size,y1:y+size,pcs:[q]}];
    return q;
  }
  function step(tap=false) {
    api.stepKnife(knife,PHYS.DT,world,tap,true);
    api.fxProcessCuts(knife.t);
  }
  return {api,knife,G,SC,brick,step};
}

test('刃根、刀侧、刀背与刀尖都能切开；完成后每件只结算一次', () => {
  for(const [x,y] of [[-.31,.22],[.41,.26],[.25,-.28],[1.35,0]]) {
    const {G,knife,brick,step}=scene(),piece=brick(x,y);
    step();assert.equal(knife.cutting?.q,piece);assert.equal(G.coins,0);
    for(let i=0;i<32;i++)step();
    assert.equal(piece.state,1);assert.equal(G.cut,1);assert.equal(G.coins,3);
  }
});

test('刀柄碰到砖块也切割，接触不会更改飞行速度或方向', () => {
  const {api,knife,G,brick,step}=scene(),q=brick(-.95,.16);
  Object.assign(knife,{y:.025,vy:7});
  api.fxSliceStep(knife,{x:0,y:-.2,a:0});
  assert.equal(knife.cutting?.q,q);assert.equal(knife.vy,7);assert.equal(knife.y,.025);
  assert.equal(knife.ev.length,0);
  for(let i=0;i<8;i++)step();
  assert.equal(q.state,1);assert.equal(G.coins,3);
});

test('全部刀具高速旋转时都能扫中两帧之间的薄物体', () => {
  for(const weapon of scene().api.KNIVES) {
    const {api,knife,G,brick}=scene(),target=brick(1.35,0,.01);
    G.equipment=weapon;knife.a=.6;
    api.fxSliceStep(knife,{x:0,y:0,a:-.6});
    assert.equal(knife.cutting?.q,target,weapon.id);
  }
});

test('碎刃、龙身及龙头能在刀尖之外切开物件，保持变形和正常飞行',()=>{
  for(const id of ['thousand','azure-dragon']){
    const {api,knife,G,brick}=scene(),weapon=api.KNIVES.find(k=>k.id===id);
    G.equipment=weapon;knife.form=weapon.form;
    const pose=api.beginPose(knife),parts=api.formParts(weapon,pose);
    for(const part of [parts.reduce((far,p)=>p.cx>far.cx?p:far),...(id==='azure-dragon'?[parts[6]]:[])]){
      const far=part!==parts[6],p=part.reduce((best,p)=>p[0]>best[0]?p:best);
      const x=far?part.cx*.37+p[0]*.63:part.cx,y=far?part.cy*.37+p[1]*.63:part.cy;
      if(far)assert(x>1.55,id);
      const z=(part.z0+part.z1)/2,q=brick(x,y,.025,z);
      api.fxSliceStep(knife,pose);
      api.fxProcessCuts(knife.t);
      assert.equal(q.state,1,id);
      assert.equal(knife.mode,'air');
    }
  }
});

test('飞行中的碎刃和龙身能领取三种悬空补给，每件只触发一次',()=>{
  for(const weaponId of ['thousand','azure-dragon'])for(const id of ['goldrush','triple','rain']){
    const {api,knife,G}=scene(),weapon=api.KNIVES.find(k=>k.id===weaponId);
    G.equipment=weapon;knife.form=weapon.form;knife.tl=0;
    const pose=api.beginPose(knife),parts=api.formParts(weapon,pose).filter(p=>p.z0<.12&&p.z1>-.12);
    const leading=parts.reduce((a,b)=>a.cx>b.cx?a:b);
    const pickup={id,x:leading.cx,y:leading.cy,phase:-2.4,taken:false};
    G.pickups=[pickup];api.fxSliceStep(knife,pose);
    assert(pickup.taken,weaponId+' / '+id);
    const expiry=G.powerEnds[id];
    assert(expiry>knife.t);assert.equal(knife.mode,'air');
    knife.t+=.05;api.fxSliceStep(knife,pose);
    assert.equal(G.powerEnds[id],expiry);assert.equal(G.cut,0);
  }
});

test('每把刀切中后所有特效贴图可用，覆盖全部材质与终点贴图',()=>{
  const {api}=scene(),out={addMesh(){},sprite(_x,_y,_z,_w,_h,_a,_c,uv){assert(uv.every(Number.isFinite));},ribbon(){}};
  for(const key of Object.values(api.FINISH_UV))assert(api.atlUV(key).every(Number.isFinite));
  for(const weapon of api.KNIVES)for(const type of api.MATERIAL_ORDER){
    const effects=[];api.materialImpact(effects,type,weapon,0,1,0);
    for(const effect of effects)effect.t=.26;
    assert.doesNotThrow(()=>api.drawImpacts(effects,out,out),weapon.id+' / '+type);
  }
});

test('未插稳五秒后失败，长时间插稳以及复活不会继承旧计时',()=>{
  const {api}=scene(),dt=api.PHYS.DT;
  const pads=[{id:0,x0:-40,x1:40,top:0,land:0},{id:1,x0:40.1,x1:44,top:0,land:42,mv:{k:'x',amp:.3,per:1,ph:0}}];
  const world={pl:pads,spk:[],zones:[],tower:null,voidY:-20,angleScale:1};
  const k=api.newKnife(world,0);
  for(let i=0;i<720;i++)api.stepKnife(k,dt,world,false);
  assert.equal(k.mode,'stuck');
  Object.assign(k,{a:0,y:.5,mode:'air',unstuckAt:k.t});
  api.startSlip(k,0,[-40,40,0],0);
  for(let i=0;i<599;i++)api.stepKnife(k,dt,world,false);
  assert.equal(k.mode,'slip');
  api.stepKnife(k,dt,world,false);assert.equal(k.mode,'dead');assert.equal(k.why,'timeout');
  api.respawnKnife(k,world,0);api.stepKnife(k,dt,world,true);
  assert.equal(k.mode,'air');assert.ok(k.t-k.unstuckAt<dt);
});

test('切到硬物可以立即起跳，打断当次切割不计收益', () => {
  const {knife,G,brick,step}=scene(),piece=brick(-.31,.22);
  step();assert(knife.cutting);
  step(true);assert(knife.vy>0);assert(!knife.cutting);
  for(let i=0;i<8;i++)step();
  assert.equal(G.coins,0);assert.equal(piece.state,0);
});

test('刀柄能领取悬空奖励，轮胎的空心处允许通过', () => {
  const {api,knife,G,SC}=scene();
  const pickup={id:'goldrush',x:-1.23,y:0,phase:-2.4,taken:false};
  G.pickups=[pickup];api.fxSliceStep(knife);
  assert(pickup.taken);assert(G.powerEnds.goldrush>knife.t);assert.equal(knife.ev.length,0);
  const tire=api.SLICEABLE.tires({t:'tires',x:0,y:0,n:1},api.mulberry32(2));SC.objs=[tire];G.pickups=[];
  const small={x:0,y:tire.pcs[0].pc.y,a:0,scale:.10,mode:'air',t:1};
  api.fxSliceStep(small);assert(!small.cutting);
});

test('飞行物横穿刀尖仍然切开，各材质在轻微的时间差内完成', () => {
  const {api,knife,brick,SC,step}=scene();
  const q=brick(-2,.02,.025),toy=SC.objs[0];
  toy.t='plane';toy.def.fly={start:0};toy.flyDX=-4;toy.flyDY=0;
  api.fxSliceStep(knife);assert.equal(knife.cutting?.q,q);toy.flyDX=0;
  for(let i=0;i<3;i++)step();assert.equal(q.state,1);
  for(const type of Object.keys(api.CUT_TIME)){
    const {brick:b,SC:sc,step:tick}=scene(),piece=b(.4,.18);
    sc.objs[0].t=type;let frames=0;
    do{tick();frames++;}while(!piece.state&&frames<12);
    assert(piece.state,type);assert(frames>=2&&frames<=6,type);
  }
});


test('复活点避开邻柱和尖刺，并留在原柱或附近', () => {
  const {api}=scene(),dt=api.PHYS.DT;
  for(const [level,pad,time] of [[13,4,.7],[20,8,1.4]]){
    const world=api.genLevel(level-1).W,k=api.newKnife(world,0);
    k.t=time;const spot=api.reviveSpot(k,world,pad);
    assert(spot.pi===pad||spot.pi===pad-1);api.respawnKnife(k,world,spot.pi);
    k.sx=spot.x;api.placeStuck(k,world);
    for(let i=0;i<26;i++)api.stepKnife(k,dt,world,i===0);
    assert.equal(k.mode,'air');
  }
});
