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
       newKnife, stepKnife, fxSliceStep, fxProcessCuts, genLevel, reviveSpot, respawnKnife, placeStuck })`, { URLSearchParams, location: { search: '' } });
  const { G, SC, PHYS } = api;
  const world = { pl: [{id:0,x0:-20,x1:20,top:-10}], zones:[], spk:[], voidY:-20, angleScale:1 };
  const knife = api.newKnife(world, 0, 0);
  Object.assign(knife, {x:0,y:0,a:0,mode:'air',sp:-1,t:1,vy:-2});
  Object.assign(G, {K:knife, W:world, equipment:api.KNIVES[0], hops:1, pickups:[], echoes:[],
    powerEnds:{goldrush:0,triple:0,rain:0},cutBase:0,itemCoins:0,critCoins:0});
  SC.objs=[];
  function brick(x,y,size=.028) {
    const mesh=api.hBox(0,0,0,size,size,.12,api.hexc('#bb8844'));
    const q={pc:api.makePiece([mesh],x,y,0),state:0,val:3};
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

test('高速旋转时，19 把刀都能扫中两帧之间的薄物体', () => {
  for(const weapon of scene().api.KNIVES) {
    const {api,knife,G,brick}=scene(),target=brick(1.35,0,.01);
    G.equipment=weapon;knife.a=.6;
    api.fxSliceStep(knife,{x:0,y:0,a:-.6});
    assert.equal(knife.cutting?.q,target,weapon.id);
  }
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
