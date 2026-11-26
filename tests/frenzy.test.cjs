const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','小刀飞飞飞.html'),'utf8');
const code=html.split('<script>')[1].split('\ntry { boot();')[0];

function game(storage=new Map()){
  return vm.runInNewContext(code+`
    GFX.batch=()=>({addMesh(){},clear(){},flat(){},dispose(){}});
    ({Game,G,FX,SAVE,SAVE_KEY,saveLoad,calendarDay,settleFrenzy,frenzyFullLeft,
      webAuto,webFrenzyBonus,webPrizeBurst,spawnFrenzyWave,makeFrenzyTarget,frenzyValuable,frenzyPower,PHYS})
  `,{URLSearchParams,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
}

test('四种装备都能在屋顶完成整局，暂停、变身、托底和经典入口互不串场',()=>{
  const a=game();
  for(const blade of ['chef','gold','thousand','azure-dragon']){
    a.SAVE.knife=blade;
    const f=a.Game.startFrenzy(751),K=a.G.K;
    assert(a.Game.tapFrenzy(1,.4));assert(K.vx>0);assert(!a.Game.tapFrenzy(0,.5));
    a.Game.update(.2);assert(a.Game.tapFrenzy(0,.5));assert(K.vx<0);
    a.Game.update(.2);
    assert.equal(K.spread,blade==='thousand'||blade==='azure-dragon'?1:0);
    const left=f.timeLeft;
    a.Game.pause();a.Game.update(2);assert.equal(f.timeLeft,left);a.Game.resume();
    for(let i=0;i<12;i++)a.Game.update(.1);
    assert.equal(K.spread,0);
    Object.assign(K,{x:4.49,y:.66,vx:7,vy:-3});a.Game.update(.025);
    assert(K.vx<0&&K.vy>0&&K.y>=.65);
    for(let frame=0;frame<3600&&!f.result;frame++){
      if(frame%32===0)a.Game.tapFrenzy(.5+.4*Math.sin(frame/120),.5);
      a.Game.update(1/60);
      assert.equal(K.mode,'air');assert(a.FX.pieces.length<=150);
    }
    assert(f.result&&f.result.slices>0&&f.result.score>0,blade);
    assert.equal(f.timeLeft,0);assert.equal(a.G.mode,'frenzy-result');
  }
  assert.equal(a.SAVE.frenzy.runsToday,4);assert.equal(a.SAVE.unlocked,1);
  assert(a.SAVE.stars.every(v=>v===0));assert.equal(a.SAVE.endlessBest,0);
  a.Game.start(0);assert.equal(a.G.frenzy,null);assert.equal(a.G.K.mode,'stuck');assert(a.G.W.tower);
});

test('刀刃切出真正的两半，计时、万剑、连斩、狂热与炸弹只在本模式结算',()=>{
  const a=game(),f=a.Game.startFrenzy(2),K=a.G.K;
  f.waveTimer=1000;
  function place(kind,x=.45,y=4){
    return a.makeFrenzyTarget(kind,x,y,0,0,()=>.5);
  }
  function cut(kinds){
    Object.assign(K,{x:0,y:4,vx:0,vy:0,a:0});
    f.targets.length=0;
    for(const kind of kinds)f.targets.push(place(kind));
    a.Game.update(a.PHYS.DT);
  }
  cut(['fruit','fruit','fruit']);assert.equal(f.slices,3);assert.equal(f.fever,33);
  assert.equal(a.FX.pieces.length,6);
  assert(a.FX.pieces.every(p=>p.mesh.n>0&&p.pts.length>=9));
  assert(a.FX.pieces[0].mesh!==a.FX.pieces[1].mesh);
  cut(['freeze']);assert.equal(f.freezeLeft,3.5);
  const seconds=f.timeLeft,flight=K.t;
  a.Game.update(.20);
  assert(Math.abs(seconds-f.timeLeft-.07)<1e-6);assert(Math.abs(K.t-flight-.20)<1e-6);
  cut(['rain']);
  for(let i=0;i<30;i++)a.Game.update(1/60);
  assert.equal(a.G.echoes.length,4);
  const e=a.G.echoes[0];f.targets=[place('pudding',e.x,e.y)];
  const slices=f.slices;a.Game.update(a.PHYS.DT);assert.equal(f.slices,slices+1);
  f.fever=99;cut(['fruit','bomb']);assert.equal(f.feverLeft,6);
  assert(f.targets.every(t=>t.kind!=='bomb'));
  const before=f.coins,score=f.score;
  cut(['fruit']);assert.equal(f.coins-before,2);assert.equal(f.score-score,30);
  f.feverLeft=f.freezeLeft=0;
  const time=f.timeLeft;cut(['bomb']);assert(Math.abs(time-f.timeLeft-4-a.PHYS.DT)<1e-6);
  assert.equal(f.combo,0);assert.equal(f.maxCombo,8);assert(!a.G.dead);
});

test('波次按阶段提速，炸弹避让同波的贵重目标和功能球，狂热只生成奖励目标',()=>{
  const a=game(),f=a.Game.startFrenzy(137);
  let bombs=0;
  for(const [left,hot,interval,min,max] of [[44,0,1.15,1,2],[25,0,.85,2,4],[9,0,.60,3,5],[9,5,.60/1.35,3,5]]){
    for(let wave=0;wave<60;wave++){
      f.targets.length=0;f.waveTimer=0;f.powerTimer=wave%2?0:2;f.timeLeft=left;f.elapsed=45-left;f.feverLeft=hot;
      a.spawnFrenzyWave(f);assert(Math.abs(f.waveTimer-interval)<1e-8);
      assert(f.targets.length>=min&&f.targets.length<=max);
      if(hot)assert(f.targets.every(t=>['fruit','pudding','piggy','money'].includes(t.kind)));
      for(const b of f.targets.filter(t=>t.kind==='bomb')){
        bombs++;assert(f.elapsed>=6&&!hot);
        for(const t of f.targets.filter(t=>a.frenzyValuable(t.kind)||a.frenzyPower(t.kind))){
          assert(Math.hypot(t.q.pc.x-b.q.pc.x,t.q.pc.y-b.q.pc.y)>=1.8);
        }
      }
    }
  }
  assert(bombs>0);
  f.targets.length=0;f.feverLeft=0;f.timeLeft=23;f.elapsed=22;
  for(let i=0;i<60;i++)a.spawnFrenzyWave(f);
  assert.equal(f.targets.filter(t=>t.kind==='bomb').length,2);
});

test('旧存档继承，前三次全额、第四次三成、跨日恢复，重复结算和刷新不会多发',()=>{
  const store=new Map(),a=game(store),day=a.calendarDay();
  store.set(a.SAVE_KEY,JSON.stringify({coins:800,unlocked:8,owned:['chef','carrot'],knife:'carrot'}));a.saveLoad();
  assert.equal(a.frenzyFullLeft(),3);
  function round(score=600,coins=80){return {score,coins,maxCombo:12,slices:14,fruit:5};}
  for(let i=0;i<4;i++){
    const f=round(),r=a.settleFrenzy(f,day);
    assert.equal(r.earned,i===3?30:100);
    assert.equal(r.newBest,i===0);assert.equal(r.full,i<3);
    assert.strictEqual(a.settleFrenzy(f,day),r);
  }
  assert.equal(a.frenzyFullLeft(),0);
  assert.equal(a.settleFrenzy(round(0,0),day).earned,10);
  const b=game(store);b.saveLoad();
  assert.equal(b.SAVE.coins,1140);assert.equal(b.SAVE.knife,'carrot');assert.equal(b.SAVE.unlocked,8);
  assert.equal(b.SAVE.frenzy.totalSlices,70);assert.equal(b.SAVE.progression.cuts,70);assert.equal(b.SAVE.progression.fruit,25);
  assert.equal(b.SAVE.frenzy.bestCombo,12);assert.equal(b.SAVE.frenzy.bestScore,600);assert.equal(b.frenzyFullLeft(day+1),3);
  assert.equal(b.settleFrenzy(round(0,0),day+1).earned,20);
  assert.equal(b.settleFrenzy(round(20000,400),day+1).earned,280);
});

test('狂潮自动玩通过实际点击切物并结算，额外道具与奖励提示生效',()=>{
  const a=game(),f=a.Game.startFrenzy(128);
  Object.assign(f,{bonusTime:0,nextBonusPower:0,bonusPower:'freeze'});
  a.webFrenzyBonus(f,.1);
  assert.equal(f.targets.at(-1).kind,'freeze');
  a.webPrizeBurst(f,'freeze',{x:0,y:3},1);
  assert.ok(a.FX.pops.some(p=>p.text==='冰冻缓时'));
  assert.ok(a.FX.parts.some(p=>p.k===1));
  a.webAuto.enabled=true;a.webAuto.mode='frenzy';
  for(let i=0;i<4500&&!f.result;i++)a.Game.update(1/60);
  assert.ok(f.tapped&&f.result&&f.slices>5&&f.result.score>0);
  assert.equal(a.SAVE.frenzy.runsToday,1);
});
