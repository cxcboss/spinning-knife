const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const code=html.split('<script>')[1].split('\ntry { boot();')[0];

function game(store=new Map()){
  const api=vm.runInNewContext(code+`
    GFX.batch=()=>({addMesh(){},flat(){},clear(){},dispose(){}});
    ({SAVE,SAVE_KEY,saveLoad,saveWrite,calendarDay,recordPlayDay,clearedCourses,
      claimAchievement,drawWheelPrize,dailyChallengeFor,generateDailyCourse,beginDailyAttempt,dailyRecord,settleDailyChallenge,
      botRun,botTick,Game,G,dailyRunScore,KNIFE_BY_ID,KNIVES,canEquip,act,UI,SC,drawKnifeForm,
      WHEEL_DISPLAY,wheelTurn,wheelSector,wheelStop,wheelMotion,wheelAngleAt})
  `,{window:{},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},URLSearchParams});
  return {...api,store};
}

test('转盘先加速再逐格减速，无论从哪一格开始都停在实际奖品上',()=>{
  const {WHEEL_DISPLAY,wheelTurn,wheelSector,wheelStop,wheelMotion,wheelAngleAt}=game();
  for(const from of WHEEL_DISPLAY)for(const to of WHEEL_DISPLAY){
    const previous={slot:from},result={slot:to},motion=wheelMotion(previous,result);
    const [duration,stop]=motion.at(-1),at=ms=>wheelAngleAt(motion,ms);
    assert.equal(at(0),wheelStop(previous)+0);
    assert(at(1050)-at(950)>(at(200)-at(100))*2);
    assert(at(duration)-at(duration-100)<at(3500)-at(3400));
    let angle=at(0);
    for(let t=10;t<duration;t+=10){assert(at(t)>angle);angle=at(t);}
    assert.equal(at(duration),stop);
    assert.equal(stop%360,((wheelStop(result)%360)+360)%360);
    assert.equal(WHEEL_DISPLAY[wheelSector(at(duration))],to);
    assert.equal(WHEEL_DISPLAY[wheelSector(at(3180))],WHEEL_DISPLAY[(wheelSector(stop)+1)%WHEEL_DISPLAY.length]);
    assert(at(3180)<stop-wheelTurn/2&&at(3720)>stop-wheelTurn/2);
  }
});

test('旧关卡进度可领奖，限定刀只可由成就领取且不能重复领取',()=>{
  const a=game();
  a.store.set(a.SAVE_KEY,JSON.stringify({coins:840,unlocked:11,stars:Array(10).fill(1),owned:['chef','carrot'],knife:'carrot'}));
  a.saveLoad();
  assert.equal(a.clearedCourses(),10);
  assert.equal(a.SAVE.knife,'carrot');
  assert(a.claimAchievement('first-clear'));
  assert(!a.claimAchievement('first-clear'));
  assert.equal(a.SAVE.coins,910);
  a.UI.screen='shop';a.UI.shopIdx=a.KNIVES.findIndex(k=>k.id==='citrus');
  assert.equal(a.act('buy'),false);
  assert(!a.canEquip('citrus'));
  a.SAVE.progression.fruit=15;
  assert(a.claimAchievement('fruit-market'));
  assert(a.canEquip('citrus'));
  assert(!a.claimAchievement('fruit-market'));
  const restored=game(a.store);restored.saveLoad();
  assert(restored.canEquip('citrus'));
  assert(!restored.claimAchievement('fruit-market'));
  assert(!restored.canEquip('thousand'));
  restored.SAVE.stars.fill(1);
  restored.SAVE.endlessBest=60;
  restored.SAVE.progression.challengeWins=13;
  assert(!restored.claimAchievement('all-shards'));
  restored.SAVE.progression.challengeWins++;
  assert(restored.claimAchievement('all-shards'));
  assert(restored.canEquip('thousand'));
});

test('四种每日挑战可通关，每天只开一局，失败或成功后都不能再领奖',()=>{
  const a=game(),today=a.calendarDay(),seen=new Set();
  for(let offset=0;offset<8;offset++){
    const spec=a.dailyChallengeFor(today+offset),level=a.generateDailyCourse(spec);
    const layout=l=>JSON.stringify([l.W.pl,l.objs]);
    assert.equal(layout(level),layout(a.generateDailyCourse(a.dailyChallengeFor(today+offset))));
    assert.notEqual(layout(level),layout(a.generateDailyCourse(a.dailyChallengeFor(today+offset+1))));
    assert(a.botRun(level.W,45).done,'unreachable '+spec.id+' '+spec.day);
    if(!seen.has(spec.id)){
      a.Game.start(2,{dailyChallenge:spec});
      for(let step=0;step<1600&&!a.G.res&&!a.G.dead;step++){a.botTick(.025);a.Game.update(.025);}
      assert(a.G.res&&a.G.fin,'daily course did not finish '+spec.id);
      const score=a.dailyRunScore(spec,a.G.fin.elapsed);
      assert(spec.id==='sprint'?score<=spec.goal*1000:score>=spec.goal,'objective out of reach '+spec.id);
      seen.add(spec.id);
    }
  }
  assert.equal(seen.size,4);
  const spec=a.dailyChallengeFor(today),miss={score:0,won:false};
  assert(a.beginDailyAttempt(spec));
  assert(!a.beginDailyAttempt(spec));
  const active=game(a.store);active.saveLoad();
  assert(!active.beginDailyAttempt(spec),'刷新后当天开局额度仍已消费');
  assert.equal(a.settleDailyChallenge(spec,miss).earned,35);
  assert.equal(a.settleDailyChallenge(spec,miss).earned,0);
  assert(!a.beginDailyAttempt(spec));
  const b=game(a.store);b.saveLoad();
  assert.equal(b.SAVE.coins,35);
  const tomorrow=b.dailyChallengeFor(today+1);
  assert(b.beginDailyAttempt(tomorrow));
  assert.equal(b.settleDailyChallenge(tomorrow,{score:tomorrow.goal,won:true}).earned,tomorrow.reward);
  assert(!b.beginDailyAttempt(tomorrow));
  assert.equal(b.settleDailyChallenge(tomorrow,miss).earned,0);
  assert.equal(b.SAVE.progression.challengeWins,1);
  const legacy=game();
  legacy.store.set(legacy.SAVE_KEY,JSON.stringify({progression:{challenges:{[today]:{paid:35,best:3,won:false}}}}));
  legacy.saveLoad();
  assert(!legacy.beginDailyAttempt(spec),'旧版今天领过参与奖则同样计入');
});

test('转盘每天一抽免费，付费同步结算，稀有刀只在实际游玩三天及十关后出现',()=>{
  const a=game(),today=a.calendarDay(),common=()=>0,dragon=()=>.99995;
  assert.equal(a.drawWheelPrize(today,dragon).slot,0);
  assert.equal(a.SAVE.coins,20);
  assert.equal(a.drawWheelPrize(today,common),null);
  a.SAVE.coins=300;
  a.recordPlayDay(today-2);a.recordPlayDay(today-2);a.recordPlayDay(today-1);a.recordPlayDay(today);
  a.SAVE.stars.fill(1,0,9);
  assert.equal(a.drawWheelPrize(today,dragon).slot,0);
  assert.equal(a.SAVE.coins,200);
  a.SAVE.stars[9]=1;
  assert.equal(a.drawWheelPrize(today,dragon).knife,'azure-dragon');
  assert.equal(a.SAVE.coins,80);
  assert(a.canEquip('azure-dragon'));
  const restored=game(a.store);restored.saveLoad();
  assert(restored.canEquip('azure-dragon'));
  assert.equal(restored.drawWheelPrize(today,common),null);
  assert.equal(restored.drawWheelPrize(today+1,dragon).slot,0);
  assert.equal(restored.SAVE.coins,100);
});

test('魔刀和苍龙以实际三维模型变形，落地恢复成一把刀',()=>{
  const a=game(),poses=[];
  a.SC.dynO={addMesh(mesh,x,y,z){
    assert(mesh.n>0&&Number.isFinite(mesh.f[0]));
    assert([x,y,z].every(Number.isFinite));
    poses.push([x,y,z]);
  }};
  a.SC.dynT={ribbon(){}};
  for(const name of ['thousand','azure-dragon']){
    const knife=a.KNIFE_BY_ID[name];
    a.drawKnifeForm(knife,0,1,1.1,.22,0,0);assert.equal(poses.length,1);
    poses.length=0;
    a.drawKnifeForm(knife,0,1,1.1,.22,1,.4);assert(poses.length>8);
    poses.length=0;
    a.drawKnifeForm(knife,0,1,-Math.PI/2,.22,0,1);assert.equal(poses.length,1);
    poses.length=0;
  }
});
