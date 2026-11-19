const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','旋转飞刀.html'),'utf8');
const code=html.split('<script>')[1].split('\ntry { boot();')[0];

function game(store=new Map()){
  const api=vm.runInNewContext(code+`
    GFX.batch=()=>({addMesh(){},flat(){},clear(){},dispose(){}});
    ({SAVE,SAVE_KEY,saveLoad,saveWrite,calendarDay,recordPlayDay,clearedCourses,
      claimAchievement,drawWheelPrize,dailyChallengeFor,generateDailyCourse,settleDailyChallenge,
      botRun,botTick,Game,G,dailyRunScore,KNIFE_BY_ID,KNIVES,canEquip,act,UI,SC,drawKnifeForm})
  `,{window:{},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},URLSearchParams});
  return {...api,store};
}

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

test('同日赛道固定，四种每日挑战都有可通关路线，失败与通关奖励按日补差',()=>{
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
  assert.equal(a.settleDailyChallenge(spec,miss).earned,35);
  assert.equal(a.settleDailyChallenge(spec,miss).earned,0);
  assert.equal(a.settleDailyChallenge(spec,{score:spec.goal,won:true}).earned,spec.reward-35);
  assert.equal(a.settleDailyChallenge(spec,{score:spec.goal,won:true}).earned,0);
  const b=game(a.store);b.saveLoad();
  assert.equal(b.SAVE.coins,spec.reward);
  assert.equal(b.SAVE.progression.challengeWins,1);
  assert.equal(b.settleDailyChallenge(b.dailyChallengeFor(today+1),miss).earned,35);
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
