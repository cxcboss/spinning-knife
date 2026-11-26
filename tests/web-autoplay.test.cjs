const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'小刀飞飞飞.html'),'utf8');
const source=html.split('<script>')[1].split('\ntry { boot();')[0];

test('网页自动玩通过全部普通关的真实碰撞，逐关结算后循环回第一关',()=>{
  const started=[];
  const game=new Function('onStart',source+`
    startLevel=onStart;
    return {genLevel,newKnife,stepKnife,courseInputs,advanceWebCourse,webAuto,G,UI,NUM_LEVELS,PHYS};
  `)(index=>started.push(index));
  const {PHYS,G,UI,webAuto}=game;
  webAuto.enabled=true;
  for(let level=0;level<game.NUM_LEVELS;level++){
    const world=game.genLevel(level).W;
    const knife=game.newKnife(world,0,world.pl[0].land);
    const search=game.courseInputs(knife,world);
    let part;
    do{part=search.next();}while(!part.done);
    assert.ok(part.value,'应能规划第 '+(level+1)+' 关');
    const taps=new Set(part.value);
    for(let tick=0;tick<18000&&knife.mode!=='done'&&knife.mode!=='dead';tick++){
      game.stepKnife(knife,PHYS.DT,world,taps.has(tick));
    }
    assert.equal(knife.mode,'done','第 '+(level+1)+' 关应零失误命中终点');
    UI.screen='result';G.res={idx:level,paid:true};webAuto.resultTime=0;
    for(let tick=0;tick<150&&started.length===level;tick++)game.advanceWebCourse(1/60);
    assert.equal(started[level],(level+1)%game.NUM_LEVELS);
  }
  webAuto.enabled=false;
  game.advanceWebCourse(2);
  assert.equal(started.length,game.NUM_LEVELS);
});

test('微信发布目录不包含网页自动玩的开关、路线规划或切关逻辑',()=>{
  function check(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())check(file);
      else if(/\.(js|json|wxml|html)$/i.test(entry.name)){
        assert.doesNotMatch(fs.readFileSync(file,'utf8'),/自动玩|autoplay|webAuto|courseInputs|advanceWebCourse/i,file);
      }
    }
  }
  check(path.join(root,'wechat'));
});

test('随机成败按每局的抽签选择实际输入，失误后重试当前关',()=>{
  const game=new Function(source+`
    const starts=[];
    startLevel=(level,entry)=>starts.push([level,entry]);
    return {genLevel,newKnife,stepKnife,webRoundInputs,advanceWebCourse,webAuto,UI,PHYS,starts,NUM_LEVELS};
  `)();
  function outcome(level,enabled,draw){
    const world=game.genLevel(level).W;
    const knife=game.newKnife(world,0,world.pl[0].land);
    const search=game.webRoundInputs(knife,world,enabled,draw);
    let part;
    do{part=search.next();}while(!part.done);
    const taps=new Set(part.value);
    for(let tick=0;tick<18000&&knife.mode!=='done'&&knife.mode!=='dead';tick++){
      game.stepKnife(knife,game.PHYS.DT,world,taps.has(tick));
    }
    return knife.mode;
  }
  assert.equal(outcome(0,false,()=>assert.fail('关闭时不应抽签')),'done');
  assert.equal(outcome(0,true,()=>.77999),'done');
  for(let level=0;level<game.NUM_LEVELS;level++){
    assert.equal(outcome(level,true,()=>.78),'dead','第 '+(level+1)+' 关应能通过真实失误失败');
  }
  game.webAuto.enabled=true;
  game.UI.screen='fail';game.UI.cur=7;
  for(let i=0;i<13;i++)game.advanceWebCourse(.1);
  assert.deepEqual(game.starts,[[7,'retry']]);
});
