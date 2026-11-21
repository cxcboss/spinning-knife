'use strict';
const art=require('./assets/art');
const ink='#f5f7fc', muted='#c3cfdf',gold='#ffda72',dark='#263548';
const tile='#263b55',panel='rgba(21,37,57,.95)',line='rgba(207,229,249,.18)';
const iconIndex=new Map(art.icons.map((v,i)=>[v,i]));
const modelIndex=new Map(art.models.map((v,i)=>[v,i]));
function box(g,x,y,w,h,r,fill,stroke){
  const z=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+z,y);
  g.arcTo(x+w,y,x+w,y+h,z);g.arcTo(x+w,y+h,x,y+h,z);
  g.arcTo(x,y+h,x,y,z);g.arcTo(x,y,x+w,y,z);g.closePath();
  if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();}
}
function text(g,str,x,y,size=16,color=ink,align='center',weight='normal',max){
  g.textAlign=align;g.textBaseline='middle';g.font=weight+' '+size+'px sans-serif';g.fillStyle=color;
  if(max)g.fillText(String(str),x,y,max);else g.fillText(String(str),x,y);
}
function icon(g,assets,name,x,y,size=22,isDark=false){
  const i=iconIndex.get(name);if(i===undefined)return;
  g.drawImage(assets.icons,(i%8)*48,Math.floor(i/8)*48+(isDark?assets.icons.height/2:0),48,48,x-size/2,y-size/2,size,size);
}
function model(g,assets,name,x,y,w,h){
  const i=modelIndex.get(name);if(i===undefined)return;
  g.drawImage(assets.models,(i%6)*148,Math.floor(i/6)*92,148,92,x,y,w,h);
}

module.exports=function createInterface(e,state,assets){
  const {G,UI,SAVE,tr}=e;
  let zones=[],vp,ctx,offsetY=0;
  const lang=(zh,en)=>e.language==='zh'?zh:en;
  function hit(id,x,y,w,h){zones.push({id,x,y:y+offsetY,w,h});}
  function button(id,label,x,y,w,h,opts={}){
    const g=ctx,primary=opts.primary,small=opts.small;
    const pressed=id&&state.pressed===id;
    const fill=opts.disabled?'#344658':primary?(pressed?'#efb74d':gold):pressed?'#47617a':tile;
    box(g,x,y,w,h,Math.min(h*.33,15),fill,primary?null:line);
    const fg=opts.disabled?'#a5b3c3':primary?dark:ink;
    const mid=y+h/2;
    if(opts.icon){
      const s=opts.iconSize||(small?16:22);
      if(!label)icon(g,assets,opts.icon,x+w/2,mid,s,primary);
      else if(opts.stack){icon(g,assets,opts.icon,x+w/2,mid-9,s,primary);text(g,label,x+w/2,mid+12,opts.size||12,fg,'center','bold',w-7);}
      else {
        const size=opts.size||(small?13:16);g.font='bold '+size+'px sans-serif';
        const tw=Math.min(w-s-20,g.measureText(label).width),total=tw+s+7,start=x+(w-total)/2;
        icon(g,assets,opts.icon,start+s/2,mid,s,primary);text(g,label,start+s+7,mid,size,fg,'left','bold',Math.max(1,tw+1));
      }
    }else text(g,label,x+w/2,mid,opts.size||(small?13:16),fg,'center','bold',w-12);
    if(id&&!opts.disabled)hit(id,x,y,w,h);
  }
  function heading(title,back=true){
    const {x,cx,content:w,top:y}=vp;
    if(back)button('back','',x,y,44,44,{icon:'back'});
    text(ctx,title,cx,y+21,21,ink,'center','bold',w-144);wallet(x+w-68,y+4);
  }
  function wallet(x,y){
    box(ctx,x,y,68,34,15,'rgba(22,39,59,.9)',line);
    icon(ctx,assets,'coinMark',x+17,y+17,18);text(ctx,SAVE.coins,x+42,y+17,14,gold,'center','bold',39);
  }
  function grid(xs,fn,cols,x,y,w,cellH,gap=7){
    const cellW=(w-(cols-1)*gap)/cols;
    xs.forEach((item,i)=>fn(item,x+(i%cols)*(cellW+gap),y+Math.floor(i/cols)*(cellH+gap),cellW,cellH));
  }
  function pager(page,count,x,y,w){
    button('prev','',x,y,46,42,{icon:'back',disabled:page===0});
    text(ctx,(page+1)+' / '+count,x+w/2,y+21,14,muted);
    button('nextPage','',x+w-46,y,46,42,{icon:'next',disabled:page+1>=count});
  }
  function prizeLabel(p){
    if(!p)return '—';
    if(p.coins)return '+'+p.coins+' '+tr('coins');
    const item=e.KNIFE_BY_ID[p.knife]||e.ALL_SUPPLIES.find(v=>v.id===p.item);
    return item?e.byLanguage(item):tr('wheelSupply');
  }
  function headerCard(title,sub,rows,actions){
    const {x,cx,content:w,top,bottom}=vp;
    const n=actions.length,h=106+rows.length*37+n*48;
    const y=top+Math.max(0,(bottom-top-h)/2);
    box(ctx,x,y,w,h,23,panel,line);
    if(sub)text(ctx,sub,cx,y+25,13,gold,'center','bold',w-36);
    text(ctx,title,cx,y+(sub?56:44),26,ink,'center','bold',w-36);
    let at=y+80;
    for(const [l,v] of rows){
      text(ctx,l,x+20,at+14,14,muted,'left','normal',w*.45);
      text(ctx,v,x+w-20,at+14,17,ink,'right','bold',w*.53);
      at+=37;
    }
    at+=6;
    actions.forEach(([id,label,ico,primary,disabled])=>{
      button(id,label,x+14,at,w-28,42,{icon:ico,primary,disabled});at+=48;
    });
  }
  function home(){
    const {x,cx,content:w,top:t,bottom:b}=vp;
    wallet(x,t);button('language',e.language==='zh'?'EN':'中',x+w-44,t,44,38,{small:true});
    const short=b-t<640,y=t+Math.min(115,(b-t)*.13);
    ctx.save();ctx.translate(cx,y+6);ctx.transform(1,0,-.09,1,0,0);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    for(const [str,yy,sz,col] of [['小刀',0,short?36:44,'#fff7e2'],['飞飞飞',short?40:50,short?51:63,gold]]){
      ctx.font='bold '+sz+'px sans-serif';ctx.lineWidth=5;ctx.strokeStyle='#283952';ctx.strokeText(str,0,yy+2);
      ctx.fillStyle=col;ctx.fillText(str,0,yy);
    }ctx.restore();
    const y0=b-216;
    box(ctx,x,y0,w,216,22,'rgba(19,38,58,.92)',line);
    const ix=x+9,iw=w-18;
    button('play',(SAVE.plays?tr('cont'):tr('play'))+'  ·  '+tr('level',{n:e.nextLevelIdx()+1}),ix,y0+9,iw,49,{primary:true,icon:'play',size:18});
    grid([['endless','endless',tr('endless')],['frenzy','knife',tr('frenzy')]],(a,l,t,ww,hh)=>button(a[0],a[2],l,t,ww,hh,{icon:a[1],size:14}),2,ix,y0+65,iw,41);
    grid([['daily','calendar','dailyChallenge'],['achievements','trophy','achievements'],['wheel','wheel','wheel']],(a,l,t,ww,hh)=>{
      button(a[0],tr(a[2]),l,t,ww,hh,{icon:a[1],small:true});
      const day=state.day,ready=a[0]==='daily'?!e.dailyRecord(day).started:a[0]==='wheel'?SAVE.progression.freeSpinDay<day:e.achievementReadyCount()>0;
      if(ready){ctx.fillStyle=gold;ctx.beginPath();ctx.arc(l+ww-8,t+8,2.5,0,Math.PI*2);ctx.fill();}
    },3,ix,y0+113,iw,36);
    grid([['levels','levels','levels'],['shop','knife','armory'],['supplies','pack','supplies'],['settings','gear','settings']],(a,l,t,ww,hh)=>button(a[0],tr(a[2]),l,t,ww,hh,{icon:a[1],stack:true,iconSize:19}),4,ix,y0+156,iw,51);
  }
  function gallery(){
    const {x,content:w,top:t,bottom:b}=vp, gear=UI.screen==='catalog';
    heading(tr(gear?'allGear':'levels'));
    const per=gear?9:18, list=gear?e.KNIVES:Array.from({length:e.NUM_LEVELS},(_,i)=>i);
    const cells=list.slice(state.page*per,(state.page+1)*per);
    grid(cells,(item,xx,yy,ww,hh)=>{
      if(gear){
        box(ctx,xx,yy,ww,hh,12,tile,line);model(ctx,assets,item.id,xx+5,yy+1,ww-10,hh-36);
        text(ctx,e.byLanguage(item),xx+ww/2,yy+hh-25,14,ink,'center','bold',ww-8);
        text(ctx,tr(item.id===SAVE.knife?'equipped':e.canEquip(item.id)?'owned':'notOwned'),xx+ww/2,yy+hh-10,10,muted);
        hit('pick:'+item.id,xx,yy,ww,hh);
      }else{
        button('level:'+item,String(item+1),xx,yy,ww,hh,{disabled:!e.isOpen(item),primary:item===e.nextLevelIdx()});
        if(SAVE.stars[item])text(ctx,'★'.repeat(SAVE.stars[item]),xx+ww/2,yy+hh-8,9,gold);
      }
    },gear?3:4,x,t+65,w,gear?Math.min(112,(b-t-130)/3-6):53);
    pager(state.page,Math.ceil(list.length/per),x,b-44,w);
  }
  function armory(){
    const {x,cx,content:w,top:t,bottom:b}=vp,k=e.KNIVES[UI.shopIdx],owned=e.canEquip(k.id);
    heading(tr('armory'));button('catalog',tr('allGear'),x+w-107,t+51,107,39,{icon:'grid',small:true});
    const y=b-126;
    box(ctx,x,y,w,126,21,panel,line);
    button('prevKnife','',x+9,y+10,43,40,{icon:'back'});button('nextKnife','',x+w-52,y+10,43,40,{icon:'next'});
    text(ctx,e.byLanguage(k),cx,y+27,23,ink,'center','bold',w-114);
    text(ctx,lang('点刀试切','Tap the blade to test'),cx,y+51,12,muted);
    const retry=['fail','frenzy-result'].includes(state.shopReturn);
    const label=owned?tr(retry?'retryGear':k.id===SAVE.knife?'equipped':'equip'):k.source?tr(k.source==='achievement'?'achievementFrom':'wheelFrom'):tr('buy')+'  '+k.price;
    button('equip',label,x+12,y+72,w-24,43,{icon:owned?'knife':k.source?'trophy':'coins',primary:true,disabled:owned&&k.id===SAVE.knife&&!retry});
  }
  function supplies(){
    const {x,cx,content:w,top:t,bottom:b}=vp;heading(tr('supplies'));
    const y=t+55,day=state.day,claimed=SAVE.daily.day>=day,dayIdx=(SAVE.daily.count+(claimed?6:0))%7;
    box(ctx,x,y,w,109,17,panel,line);text(ctx,tr('dayTitle'),x+14,y+22,16,ink,'left','bold');
    button('checkin',tr(claimed?'claimed':'claim'),x+w-106,y+7,98,31,{small:true,primary:!claimed,disabled:claimed});
    grid(e.DAILY,(d,xx,yy,ww)=>{
      box(ctx,xx,yy,ww,48,9,d===e.DAILY[dayIdx]?'#52647a':tile);
      text(ctx,String(e.DAILY.indexOf(d)+1),xx+ww/2,yy+11,11,gold);model(ctx,assets,d.power||d.item,xx,yy+17,ww,26);
    },7,x+9,y+48,w-18,48,3);
    const v=state.supplyIndex,it=e.ALL_SUPPLIES[v];
    grid(e.ALL_SUPPLIES,(a,xx,yy,ww,hh)=>{
      box(ctx,xx,yy,ww,hh,11,tile,a===it?gold:line);model(ctx,assets,a.id,xx+2,yy+2,ww-4,hh-20);
      text(ctx,e.byLanguage(a),xx+ww/2,yy+hh-11,12,ink,'center','bold',ww-5);
      hit('supply:'+a.id,xx,yy,ww,hh);
    },4,x,y+122,w,57,5);
    const ey=y+258;box(ctx,x,ey,w,72,14,panel,line);
    text(ctx,e.byLanguage(it),x+12,ey+20,17,ink,'left','bold');
    text(ctx,tr('stock')+'  '+SAVE.stock[it.id],x+w-12,ey+20,13,gold,'right');
    text(ctx,tr(it.text),x+12,ey+48,13,muted,'left','normal',w-24);
    const vid=e.rewardAvailable('supply:'+it.id);
    if(vid)button('supplyVideo',tr('adOne'),x,b-96,w,40);
    const carry=e.SUPPLIES.includes(it),ww=carry?(w-7)*.52:w;
    if(carry)button('carry',tr(SAVE.loadout===it.id?'unequipItem':'take'),x,b-44,w-ww-7,44,{icon:'pack',disabled:!SAVE.stock[it.id]&&SAVE.loadout!==it.id});
    button('buySupply',tr('buy')+'  '+it.price,x+w-ww,b-44,ww,44,{primary:true,icon:'coins'});
  }
  function achievements(){
    const {x,content:w,top:t,bottom:b}=vp;heading(tr('achievements'));
    const order={ready:0,locked:1,claimed:2};
    const list=e.ACHIEVEMENTS.slice().sort((a,b)=>order[e.achievementState(a)]-order[e.achievementState(b)]);
    const rows=list.slice(state.page*5,state.page*5+5);
    rows.forEach((a,i)=>{
      const y=t+62+i*69,type=e.achievementState(a);
      box(ctx,x,y,w,61,14,tile,type==='ready'?gold:line);icon(ctx,assets,a.icon,x+25,y+30,23);
      text(ctx,e.byLanguage(a),x+46,y+20,16,ink,'left','bold',w-132);
      const goals=e.achievementProgress(a);text(ctx,goals.map(q=>tr(e.achievementGoalText[q.key])+' '+Math.min(q.current,q.target)+'/'+q.target).join(' · '),x+46,y+43,11,muted,'left','normal',w-105);
      text(ctx,type==='ready'?tr('achievementClaim'):type==='claimed'?'✓':'›',x+w-15,y+28,15,gold,'right');
      hit('ach:'+a.id,x,y,w,61);
    });pager(state.page,Math.ceil(list.length/5),x,b-44,w);
  }
  function settings(){
    const {x,content:w,top:t,bottom:b}=vp;heading(tr('settings'));
    const rows=[['sfx','speaker','sound'],['music','music','music'],['vib','vibration','vibration'],['language','lang','language'],['quality','quality','quality']];
    rows.forEach(([id,ico,k],i)=>{
      const y=t+60+55*i;box(ctx,x,y,w,48,13,tile,line);icon(ctx,assets,ico,x+25,y+24,19);
      text(ctx,tr(k),x+48,y+25,15,ink,'left','bold');
      const value=id==='language'?(e.language==='zh'?'简体中文':'English'):id==='quality'?tr('q'+SAVE.opts.q):SAVE.opts[id]?lang('开','On'):lang('关','Off');
      text(ctx,value+'  ›',x+w-16,y+24,14,gold,'right');hit(id,x,y,w,48);
    });
    if(state.settingsReturn==='home')button('reset',tr('reset'),x,b-44,w,42,{small:true});
  }
  function wheel(){
    const {x,cx,content:w,top:t,bottom:b}=vp;heading(tr('wheel'));
    const free=state.day>SAVE.progression.freeSpinDay;
    const size=Math.min(w-30,b-t-240,272);state.wheelRect={x:cx-size/2,y:t+64,w:size};
    const sy=t+66+size;box(ctx,x,sy+15,w,50,13,panel,line);
    text(ctx,tr('wheelLast'),x+15,sy+40,13,muted,'left');
    text(ctx,state.spin?'…':prizeLabel(SAVE.progression.lastPrize),x+w-15,sy+40,17,gold,'right','bold',w*.70);
    button('spin',tr(state.spin?'wheelSpinning':free?'wheelFree':'wheelPaid',{n:e.WHEEL_COST}),x,b-47,w,47,{primary:true,icon:'wheel',disabled:!!state.spin});
  }
  function disc(g,size){
    const r=size/2,c=r,arc=Math.PI*2/e.WHEEL_DISPLAY.length;
    g.translate(c,c);
    for(let i=0;i<e.WHEEL_DISPLAY.length;i++){
      const p=e.WHEEL_PRIZES[e.WHEEL_DISPLAY[i]],a=i*arc-Math.PI/2;
      g.beginPath();g.moveTo(0,0);g.arc(0,0,r-5,a-arc/2,a+arc/2);g.closePath();g.fillStyle=p.color;g.fill();g.strokeStyle='#c3b391';g.lineWidth=.8;g.stroke();
      g.save();g.rotate(a+Math.PI/2);text(g,p.coins||tr(p.supply?'wheelSupply':p.knife==='azure-dragon'?'wheelDragon':'wheelAstro'),0,-r*.69,Math.max(12,r*.125),ink,'center','bold',r*.54);g.restore();
    }
    g.beginPath();g.arc(0,0,r-4,0,Math.PI*2);g.strokeStyle=gold;g.lineWidth=5;g.stroke();
    g.beginPath();g.arc(0,0,15,0,Math.PI*2);g.fillStyle=gold;g.fill();icon(g,assets,'star',0,0,19,true);
  }
  function dialog(){
    const page=UI.screen,a=[],rows=[];let name='',sub='';
    const add=(id,label,ico,primary=false,disabled=false)=>a.push([id,label,ico,primary,disabled]);
    if(page==='endless'){
      name=tr('endless');sub=tr('endlessToday',{n:e.endlessRemaining()});const quota=e.endlessQuota();
      rows.push([tr('endlessBest'),e.endlessPosition(SAVE.endlessBest)]);
      add('startEndless',tr(e.endlessRemaining()?'endlessStart':'endlessOut'),'play',true,!e.endlessRemaining());
      rows.push([lang('今日对局奖励','Duel rewards'),quota.shares.length+' / 3']);
      add('invite',tr('shareEndless'),'share',false,quota.shares.length>=3);
    }else if(page==='invite'){
      name=tr('duelTitle');sub=lang('空中切物狂潮 · 45 秒','Slice Frenzy · 45s');
      rows.push([lang('好友免费玩一局','Friend finishes a round'),lang('回传成绩卡','Sends score back')],
        [lang('你打开成绩卡','Open their score card'),lang('无尽次数 +2','+2 Endless runs')],
        [lang('当天有效','Valid today'),lang('每天最多 3 份','Up to 3 rewards')]);
      add('sendDuel',tr('shareEndless'),'share',true);add('endless',tr('back'),'back');
    }else if(page==='duel'){
      const card=state.duelCard;
      name=tr(e.duelStatusKey(card.kind));
      sub=Number.isInteger(card.score)?tr('duelCardScore',{n:card.score}):lang('空中切物狂潮 · 45 秒','Slice Frenzy · 45s');
      if(card.kind==='invite'){
        rows.push([lang('回传成绩','Send score back'),lang('好友无尽次数 +2','Friend gets +2 runs')]);
        add('playDuel',tr('duelStart'),'play',true);
        if(card.reply)add('replyDuel',tr('duelReply'),'share');
      }else add('endless',tr('endless'),'endless',true);
    }else if(page==='frenzy-entry'){
      name=tr('frenzy');sub=lang('45 秒','45 seconds');add('frenzy',tr('play'),'play',true);
    }else if(page==='daily'){
      const spec=e.dailyChallengeFor(),rec=e.dailyRecord(spec.day);name=e.byLanguage(spec);sub=tr('dailyChallenge');
      rows.push([lang('目标','Goal'),tr(spec.goalKey,{n:spec.goal})],[tr('challengeClearBonus'),'+'+spec.reward],[tr('challengeTryBonus'),'+'+e.DAILY_CONSOLATION]);
      add('startDaily',tr(rec.started?'challengeTomorrow':'challengeStart'),'play',true,rec.started);
    }else if(page==='pause'){
      name=tr('paused');sub=G.frenzy?tr('frenzy'):G.endless?tr('endless'):G.dailyChallenge?tr('dailyChallenge'):e.levelCaption(G.idx);
      add('resume',tr('resume'),'play',true);
      if(!G.endless&&!G.dailyChallenge)add('retry',tr('restart'),'retry');
      add('settings',tr('settings'),'gear');
    }else if(page==='powers'){
      name=tr('special');sub=tr('oneSpecial');
      for(const it of e.TIMED_POWERS){const n=SAVE.stock[it.id],video=e.rewardAvailable('run:'+it.id);
        add('use:'+it.id,e.byLanguage(it)+' · '+(n?'×'+n:video?tr('adUse'):tr('emptyStock')),'pack',!!n,!n&&!video);}
      add('resume',tr('resume'),'play',true);
    }else if(page==='fail'){
      const why=G.K.why;
      name=tr(why==='timeout'?'landingTimeout':why==='slip'?'fallen':why==='spike'?'spiked':'missed');
      sub=G.endless?tr('endless'):e.levelCaption(G.idx);
      rows.push([tr('collected'),G.coins]);
      if(!G.potionRevived&&SAVE.stock.revival)add('revive',tr('potionRevive')+' ×'+SAVE.stock.revival,'potion',true);
      if(!G.adRevived&&e.rewardAvailable('revive'))add('videoRevive',tr('reviveLabel'),'play');
      if(G.endless)add('cashOut',tr('cashOut'),'coins',true);
      else {add('retry',tr('retry'),'retry',true);add('failGear',tr('armory'),'knife');}
    }else if(page==='result'){
      const r=G.res;name=tr('complete');sub=e.levelCaption(r.idx)+'   '+ '★'.repeat(r.stars);
      rows.push([tr('collected'),r.base],[tr('finishReward')+' ×'+r.mult,'+'+r.finishBonus],[tr('income'),r.doubled?r.total*2:r.total]);
      if(r.idx+1<e.NUM_LEVELS)add('nextLevel',tr('next'),'next',true);
      if(!r.doubled&&e.rewardAvailable('double'))add('double',tr('doubleLabel'),'play');
      add('retry',tr('retry'),'retry');
    }else if(page==='frenzy-result'){
      const r=UI.frenzyResult;name=tr(r.newBest?'frenzyNewBest':'frenzyOver');sub=tr('frenzy');
      rows.push([tr('frenzyScore'),r.score],[tr('frenzyMaxCombo'),r.combo],[tr('frenzyBest'),r.best],[tr('runIncome'),'+'+r.earned]);
      add('frenzy',tr('frenzyAgain'),'play',true);add('failGear',tr('frenzyGear'),'knife');add(r.reply?'replyDuel':'shareScore',tr(r.reply?'duelReply':'shareScore'),'share');
    }else if(page==='daily-result'){
      const r=G.dailyResult;name=tr(r.won?'challengeWin':'challengeMiss');sub=e.byLanguage(r.spec);
      rows.push([tr('frenzyScore'),e.scoreText(r.spec,r.score)],[tr('runIncome'),'+'+r.earned]);
      add('shareScore',tr('shareScore'),'share',true);
    }else if(page==='endless-result'){
      name=tr('endlessResult');sub=tr('endless');rows.push([lang('本局最远','Distance'),e.endlessPosition(G.res.distance)],[tr('endlessEarned'),'+'+G.res.total]);
      add('endless',tr('backEndless'),'endless',true);
    }else if(page==='achievement'){
      const item=state.achievement,type=e.achievementState(item);name=e.byLanguage(item);sub=tr('achievements');
      for(const goal of e.achievementProgress(item))rows.push([tr(e.achievementGoalText[goal.key]),Math.min(goal.current,goal.target)+' / '+goal.target]);
      rows.push([tr('rewardPrize'),prizeLabel(item)]);
      if(type==='ready')add('claimAchievement',tr('achievementClaim'),'trophy',true);
      if(type==='claimed')add('shareScore',tr('shareScore'),'share',true);
      if(item.knife)add('previewPrize',tr('fullPreview'),'knife');
    }else if(page==='confirmReset'){
      name=tr('eraseTitle');rows.push([tr('eraseBody'),'']);add('cancelReset',tr('cancel'),'back',true);add('confirmReset',tr('eraseConfirm'),'retry');
    }
    if(page==='achievement'){add('back',tr('back'),'back');}
    else if(!['powers','confirmReset'].includes(page))add('home',tr('home'),'home');
    headerCard(name,sub,rows,a);
  }
  function paint(g,v){
    vp=v;ctx=g;offsetY=0;zones=[];const page=UI.screen;
    if(!['home','shop'].includes(page))g.fillStyle='rgba(12,27,44,.76)',g.fillRect(0,0,v.w,v.h);
    if(page==='home')home();else if(page==='levels'||page==='catalog')gallery();
    else if(page==='shop')armory();else if(page==='supplies')supplies();else if(page==='settings')settings();
    else if(page==='wheel')wheel();else if(page==='achievements')achievements();else dialog();
  }
  function hud(g,v){
    vp=v;ctx=g;offsetY=v.top;zones=[];
    const x=v.x,c=v.cx,w=v.content,p=G.frenzy, y=0;
    button('pause','',x,y,45,43,{icon:'pause'});
    const showPack=!p&&!G.dailyChallenge&&!G.manualPowerUsed&&!G.fin&&!G.dead;
    if(showPack)button('powers','',x+w-43,y,43,43,{icon:'pack'});
    const label=p?Math.ceil(p.timeLeft)+'s   ·   '+p.score:G.endless?tr('endless')+' · '+e.endlessPosition(G.farthest):G.dailyChallenge?e.byLanguage(G.dailyChallenge):e.levelCaption(G.idx);
    box(g,c-86,y,172,44,18,panel,line);text(g,label,c,y+17,14,ink,'center','bold',154);
    if(p||(!G.endless&&!G.dailyChallenge)){const n=p?p.fever/100:G.progress;
      box(g,c-66,y+31,132,4,2,'#53667b');if(n>.01)box(g,c-66,y+31,132*n,4,2,gold);}
    else {
      const spec=G.dailyChallenge,elapsed=G.fin?.elapsed??e.dailyElapsed();
      const value=spec?.id==='sprint'?tr('challengeClock',{n:Math.max(0,Math.ceil(spec.goal-elapsed))}):spec?e.scoreText(spec,e.dailyRunScore(spec,elapsed)):'◆ '+Math.round(G.coinsShown);
      text(g,value,c,y+33,11,gold);
    }
    if(!p&&!G.endless&&!G.dailyChallenge){box(g,x,y+50,65,25,11,panel);icon(g,assets,'coinMark',x+13,y+62,14);text(g,Math.round(G.coinsShown),x+39,y+63,12,gold);}
    let effect=p?(p.feverLeft?tr('frenzyFever'):p.freezeLeft?tr('frenzyFreeze'):p.rainLeft?tr('frenzyRain'):p.combo>1?tr('frenzyCombo',{n:p.combo}):''):
      e.TIMED_POWERS.filter(it=>G.powerEnds?.[it.id]>G.K.t).map(it=>e.byLanguage(it)+' '+Math.ceil(G.powerEnds[it.id]-G.K.t)+'s').join(' · ');
    if(!effect&&G.item&&!p)effect=e.byLanguage(e.ALL_SUPPLIES.find(i=>i.id===G.item));
    if(effect){box(g,c-84,50,168,25,11,panel);text(g,effect,c,63,12,gold,'center','bold',155);}
    offsetY=0;
  }
  function hint(g,width,height,str){box(g,0,1,width,height-2,16,panel,line);text(g,str,width/2,height/2,14,ink,'center','bold',width-19);}
  return {paint,hud,hint,disc,prizeLabel,hitAt(x,y){return zones.find(z=>x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h)?.id;},
    clearHits(){zones=[];},zones:()=>zones.map(z=>({...z}))};
};
