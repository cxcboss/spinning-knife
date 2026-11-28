'use strict';
const art=require('./assets/art');
const scrollScreens=new Set(['levels','catalog','achievements']);
const ink='#f5f7fc', muted='#c3cfdf',gold='#ffda72',dark='#263548';
const tile='#263b55',panel='rgba(21,37,57,.95)',line='rgba(207,229,249,.18)';
const knifeSourceColors={achievement:'#b9ddff',wheel:'#ffdc89',special:'#ffc1da'};
const iconIndex=new Map(art.icons.map((v,i)=>[v,i]));
const modelIndex=new Map(art.models.map((v,i)=>[v,i]));
const homePanelHeight=216;
const modalCancel={daily:'cancelDaily',endless:'cancelEndless',frenzy:'cancelFrenzy'};
function homeTitleTop(vp){return vp.top+Math.min(115,(vp.bottom-vp.top)*.13);}
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
  let zones=[],vp,ctx,offsetY=0,modalCard=null,scrollList=null,rewardControl=null;
  const pocketItems=[...e.POCKET_POWERS,e.POWERS.at(-1)];
  const lang=(zh,en)=>e.language==='zh'?zh:en;
  function hit(id,x,y,w,h){zones.push({id,x,y:y+offsetY,w,h});}
  function button(id,label,x,y,w,h,opts={}){
    if(opts.icon==='ad'&&!opts.disabled){
      rewardControl={id,label,x,y,w,h};
      hit(id,x,y,w,h);
      return;
    }
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
  function paintReward(g,control=rewardControl){
    const {id,label,w,h,busy}=control,pressed=state.pressed===id;
    box(g,.5,.5,w-1,h-1,Math.min(h*.33,15),busy?'#e8b660':pressed?'#efb74d':gold,'#fff0b0');
    const iconSize=19,gap=7;
    g.font='bold 16px sans-serif';
    const textWidth=Math.min(w-iconSize-gap-24,g.measureText(label).width);
    const start=(w-textWidth-iconSize-gap)/2;
    icon(g,assets,'ad',start+iconSize/2,h/2,iconSize,true);
    text(g,label,start+iconSize+gap,h/2,16,dark,'left','bold',textWidth+1);
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
  function prizeLabel(p){
    if(!p)return '—';
    if(p.coins)return '+'+p.coins+' '+tr('coins');
    const item=e.KNIFE_BY_ID[p.knife]||e.ALL_SUPPLIES.find(v=>v.id===p.item);
    return item?e.byLanguage(item):tr('wheelSupply');
  }
  function headerCard(title,sub,rows,actions,totalActions){
    const {x,cx,content:w,top,bottom}=vp;
    const headingHeight=106+rows.length*37;
    const h=headingHeight+actions.length*48,fullHeight=headingHeight+(totalActions??actions.length)*48;
    const centeredHeight=totalActions===undefined?h:headingHeight+2*48;
    const y=top+Math.max(0,Math.min((bottom-top-centeredHeight)/2,bottom-top-fullHeight));
    if(modalCancel[UI.screen])modalCard={x,y,w,h};
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
    const short=b-t<640,y=homeTitleTop(vp);
    ctx.save();ctx.translate(cx,y+6);ctx.transform(1,0,-.09,1,0,0);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    for(const [str,yy,sz,col] of [['小刀',0,short?36:44,'#fff7e2'],['飞飞飞',short?40:50,short?51:63,gold]]){
      ctx.font='bold '+sz+'px sans-serif';ctx.lineWidth=5;ctx.strokeStyle='#283952';ctx.strokeText(str,0,yy+2);
      ctx.fillStyle=col;ctx.fillText(str,0,yy);
    }ctx.restore();
    const y0=b-homePanelHeight;
    box(ctx,x,y0,w,homePanelHeight,22,'rgba(19,38,58,.92)',line);
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
  function scrollCells(items,cols,cellH,gap,label,paint,initialIndex=0){
    const {x,content:w,top,bottom}=vp,y=top+58;
    heading(label);
    const step=cellH+gap,height=bottom-y,cellW=(w-gap*(cols-1))/cols,positions=state.scrollPositions??={};
    const max=Math.max(0,Math.ceil(items.length/cols)*step-gap-height);
    const scroll=Math.min(max,Math.max(0,positions[UI.screen]??Math.max(0,Math.floor(initialIndex/cols)-2)*step));
    positions[UI.screen]=scroll;
    scrollList={x,w,top:y,bottom,max};
    const first=Math.floor(scroll/step)*cols;
    const end=Math.min(items.length,Math.ceil((scroll+height)/step)*cols);
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,height);ctx.clip();
    for(let i=first;i<end;i++){
      const rowY=y+Math.floor(i/cols)*step-scroll;
      const visibleTop=Math.max(y,rowY),visibleBottom=Math.min(bottom,rowY+cellH);
      if(visibleBottom<=visibleTop)continue;
      const left=x+i%cols*(cellW+gap);
      const id=paint(items[i],i,left,rowY,cellW,cellH);
      if(id)hit(id,left,visibleTop,cellW,visibleBottom-visibleTop);
    }
    ctx.restore();
    if(max>0){
      const thumb=Math.max(28,height*height/(height+max));
      box(ctx,x+w+4,y+(height-thumb)*scroll/max,3,thumb,1.5,'rgba(207,229,249,.40)');
    }
  }
  const levelIndices=Array.from({length:e.NUM_LEVELS},(_,i)=>i);
  function levels(){
    const selected=e.nextLevelIdx();
    scrollCells(levelIndices,3,76,9,tr('levels'),(level,i,x,y,w,h)=>{
      const open=e.isOpen(level),current=level===selected,hard=e.isExpertLevel(level),id='level:'+level;
      const cx=x+w/2;
      box(ctx,x,y,w,h,14,current?gold:state.pressed===id?'#47617a':hard?'#433358':tile,current?null:hard?'#a77ca3':line);
      text(ctx,level+1,cx,y+28,23,current?dark:open?ink:muted,'center','bold');
      if(!open){icon(ctx,assets,'lock',cx,y+54,15);return;}
      const stars=SAVE.stars[level]||0;
      text(ctx,'★'.repeat(stars)+'☆'.repeat(3-stars),cx,y+55,14,current?dark:gold);
      return id;
    },selected);
  }
  function gallery(){
    scrollCells(e.KNIVES,3,109,9,tr('allGear'),(item,i,x,y,w,h)=>{
      const id='pick:'+item.id;
      box(ctx,x,y,w,h,12,state.pressed===id?'#47617a':tile,i===UI.shopIdx?gold:line);
      model(ctx,assets,item.id,x+5,y+1,w-10,h-36);
      knifeSourceTag(e.knifeUnlockSource(item),x+w-5,y+5);
      text(ctx,e.byLanguage(item),x+w/2,y+h-25,14,ink,'center','bold',w-8);
      text(ctx,tr(item.id===SAVE.knife?'equipped':e.canEquip(item.id)?'owned':'notOwned'),x+w/2,y+h-10,10,muted);
      return id;
    },UI.shopIdx);
  }
  function knifeSourceTag(source,right,y){
    if(!source)return;
    const label=tr('knifeSource_'+source);
    ctx.font='bold 10px sans-serif';
    const w=Math.ceil(ctx.measureText(label).width)+11;
    box(ctx,right-w,y,w,16,5,'#202d4a');
    text(ctx,label,right-w/2,y+8,10,knifeSourceColors[source],'center','bold');
  }
  function armory(){
    const {x,cx,content:w,top:t,bottom:b}=vp,k=e.KNIVES[UI.shopIdx],owned=e.canEquip(k.id);
    heading(tr('armory'));button('catalog',tr('allGear'),x+w-107,t+51,107,39,{icon:'grid',small:true});
    const achievement=k.source==='achievement'?e.ACHIEVEMENTS.find(item=>item.knife===k.id):null;
    const goals=achievement?e.achievementProgress(achievement):[];
    const height=126+(achievement?(goals.length+1)*18+4:0),y=b-height;
    box(ctx,x,y,w,height,21,panel,line);
    button('prevKnife','',x+9,y+10,43,40,{icon:'back'});button('nextKnife','',x+w-52,y+10,43,40,{icon:'next'});
    text(ctx,e.byLanguage(k),cx,y+27,23,ink,'center','bold',w-114);
    const source=e.knifeUnlockSource(k);
    knifeSourceTag(source,cx-41,y+43);
    text(ctx,k.toy==='heart'?tr('heartPreview'):lang('点刀试切','Tap the blade to test'),
      cx+(source?24:0),y+51,12,muted,'center','normal',w-116);
    if(achievement){
      const title=lang('成就 · ','Achievement · ')+e.byLanguage(achievement);
      text(ctx,title,cx,y+71,13,gold,'center','bold',w-26);
      goals.forEach(({key,current,target},i)=>{
        const progress=tr(e.achievementGoalText[key])+'  '+Math.min(current,target)+' / '+target;
        text(ctx,progress,cx,y+89+18*i,12,muted,'center','normal',w-26);
      });
    }
    const retry=state.shopReturn==='fail';
    const label=owned?tr(retry?'retryGear':k.id===SAVE.knife?'equipped':'equip'):k.source?tr(k.source==='achievement'?'achievementFrom':'wheelFrom'):tr('buy')+'  '+k.price;
    button('equip',label,x+12,b-54,w-24,43,{icon:owned?'knife':k.source?'trophy':'coins',primary:true,disabled:owned&&k.id===SAVE.knife&&!retry});
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
    if(vid)button('supplyVideo',tr('adOne'),x,b-96,w,40,{icon:'ad'});
    button('buySupply',tr('buy')+'  '+it.price,x,b-44,w,44,{primary:!vid,icon:'coins'});
  }
  function achievements(){
    const order={ready:0,locked:1,claimed:2};
    const list=e.ACHIEVEMENTS.map(item=>({item,type:e.achievementState(item)})).sort((a,b)=>order[a.type]-order[b.type]);
    scrollCells(list,1,61,8,tr('achievements'),({item:a,type},i,x,y,w,h)=>{
      const id='ach:'+a.id;
      box(ctx,x,y,w,h,14,state.pressed===id?'#47617a':tile,type==='ready'?gold:line);
      icon(ctx,assets,a.icon,x+25,y+30,23);
      text(ctx,e.byLanguage(a),x+46,y+20,16,ink,'left','bold',w-132);
      const goals=e.achievementProgress(a);
      text(ctx,goals.map(q=>tr(e.achievementGoalText[q.key])+' '+Math.min(q.current,q.target)+'/'+q.target).join(' · '),x+46,y+43,11,muted,'left','normal',w-105);
      text(ctx,type==='ready'?tr('achievementClaim'):type==='claimed'?'✓':'›',x+w-15,y+28,15,gold,'right');
      return id;
    });
  }
  function settings(){
    const {x,content:w,top:t}=vp;heading(tr('settings'));
    const rows=[['sfx','speaker','sound'],['music','music','music'],['vib','vibration','vibration'],['language','lang','language'],['quality','quality','quality']];
    rows.forEach(([id,ico,k],i)=>{
      const y=t+60+55*i;box(ctx,x,y,w,48,13,tile,line);icon(ctx,assets,ico,x+25,y+24,19);
      text(ctx,tr(k),x+48,y+25,15,ink,'left','bold');
      const value=id==='language'?(e.language==='zh'?'简体中文':'English'):id==='quality'?tr('q'+SAVE.opts.q):SAVE.opts[id]?lang('开','On'):lang('关','Off');
      text(ctx,value+'  ›',x+w-16,y+24,14,gold,'right');hit(id,x,y,w,48);
    });
  }
  function wheel(){
    const {x,cx,content:w,top:t,bottom:b}=vp;heading(tr('wheel'));
    const free=state.day>SAVE.progression.freeSpinDay,video=e.rewardAvailable('supply:wheel');
    const busy=!!state.spin||!!state.wheelAd;
    const size=Math.min(w-30,b-t-(video?287:240),272);state.wheelRect={x:cx-size/2,y:t+64,w:size};
    const sy=t+66+size;box(ctx,x,sy+15,w,50,13,panel,line);
    text(ctx,tr('wheelLast'),x+15,sy+40,13,muted,'left');
    text(ctx,state.spin?'…':prizeLabel(SAVE.progression.lastPrize),x+w-15,sy+40,17,gold,'right','bold',w*.70);
    if(video)button('spinVideo',tr('wheelVideo'),x,b-94,w,41,{icon:'ad',disabled:busy});
    button('spin',tr(state.spin?'wheelSpinning':free?'wheelFree':'wheelPaid',{n:e.WHEEL_COST}),x,b-47,w,47,{primary:!video,icon:'wheel',disabled:busy});
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
  function videoCoinRow(){
    return [lang('今日加开金币','Extra-run coins today'),e.videoCoinRemaining()+' / '+e.VIDEO_DAILY_COIN_LIMIT+
      lang(' 剩余',' left')];
  }
  function dialog(){
    const page=UI.screen,a=[],rows=[];let name='',sub='';
    const courseSettlement=page==='result'||(page==='fail'&&!G.endless);
    const add=(id,label,ico,primary=false,disabled=false)=>a.push([id,label,ico,primary,disabled]);
    if(page==='endless'){
      const quota=e.endlessQuota(),free=e.endlessRemaining(quota),extra=e.endlessVideoRemaining(quota);
      name=tr('endless');
      sub=free?lang('今日免费剩余 '+free+' 局',free+' free runs left today'):
        extra?lang('今日可加开 '+extra+' 局',extra+' extra runs left today'):tr('endlessOut');
      rows.push([tr('endlessBest'),e.endlessPosition(SAVE.endlessBest)]);
      if(free)add('startEndless',tr('endlessStart'),'play',true);
      else if(extra){
        rows.push([lang('加开局金币','Extra-run coins'),lang(e.videoCoinPercent+'% · 最多 '+e.VIDEO_ROUND_COIN_LIMIT,
          e.videoCoinPercent+'% · up to '+e.VIDEO_ROUND_COIN_LIMIT)],videoCoinRow());
        add('endlessVideo',state.endlessAd?lang('正在加载…','Loading…'):
          lang('再玩一局','Play one more run'),'ad',true,state.endlessAd||!e.rewardAvailable('supply:endless'));
      }
    }else if(page==='frenzy'){
      const free=e.frenzyFreeLeft();
      const points=free?e.FRENZY_POINTS_PER_COIN:e.frenzyVideoPointsPerCoin;
      name=tr('frenzy');
      sub=free?lang('今日免费剩余 '+free+' 局',free+' free runs left today'):
        lang('免费次数已用完','No free runs left today');
      rows.push([lang('每日开局','Daily entry'),lang('3 局免费 · 之后看视频','3 free, then video')],
        [lang('每局时长','Round length'),lang('45s · 可加时一次','45s · one extension')],
        [lang('金币结算','Coin reward'),lang('每 '+points+' 分得 1 金币','1 coin per '+points+' points')]);
      if(free){
        rows.push([tr('frenzyBest'),SAVE.frenzy.bestScore]);
        add('startFrenzy',tr('play'),'play',true);
      }else{
        rows.push([lang('单局金币上限','Coins per run cap'),e.VIDEO_ROUND_COIN_LIMIT],videoCoinRow());
        add('frenzyVideo',state.frenzyAd?lang('正在加载…','Loading…'):
          lang('再玩一局','Play one more run'),'ad',true,state.frenzyAd||!e.rewardAvailable('supply:frenzy-start'));
      }
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
      name=tr(why==='courseTime'?'courseTimeUp':why==='timeout'?'landingTimeout':why==='slip'?'fallen':why==='spike'?'spiked':'missed');
      sub=G.endless?tr('endless'):e.levelCaption(G.idx);
      rows.push([tr('collected'),G.coins]);
      const timeOver=why==='courseTime';
      const videoRevive=!timeOver&&!G.adRevived&&e.rewardAvailable('revive');
      if(videoRevive)add('videoRevive',tr(courseSettlement?'reviveReward':'reviveLabel'),'ad');
      if(!timeOver&&!G.potionRevived&&SAVE.stock.revival)add('revive',tr('potionRevive')+' ×'+SAVE.stock.revival,'potion',!videoRevive);
      if(G.endless)add('cashOut',tr('cashOut'),'coins',!videoRevive);
      else {add('retry',tr('retry'),'retry',!videoRevive);add('failGear',tr('armory'),'knife');}
    }else if(page==='result'){
      const r=G.res;name=tr('complete');sub=e.levelCaption(r.idx)+'   '+ '★'.repeat(r.stars);
      rows.push([tr('collected'),r.base],[tr('finishReward')+' ×'+r.mult,'+'+r.finishBonus],[tr('income'),r.doubled?r.total*2:r.total]);
      const videoDouble=!r.doubled&&e.rewardAvailable('double');
      if(videoDouble)add('double',tr('doubleReward'),'ad');
      if(r.idx+1<e.NUM_LEVELS)add('nextLevel',tr('next'),'next',!videoDouble);
      add('retry',tr('retry'),'retry');
    }else if(page==='frenzy-result'){
      const r=UI.frenzyResult;name=tr(r.newBest?'frenzyNewBest':'frenzyOver');sub=tr('frenzy');
      rows.push([tr('frenzyScore'),r.score],[tr('frenzyMaxCombo'),r.combo],[tr('frenzyBest'),r.best],[tr('runIncome'),'+'+r.earned]);
      add('frenzy',tr('frenzyAgain'),'play',true);add('failGear',tr('frenzyGear'),'knife');add('shareGame',tr('shareGame'),'share');
    }else if(page==='daily-result'){
      const r=G.dailyResult;name=tr(r.won?'challengeWin':'challengeMiss');sub=e.byLanguage(r.spec);
      rows.push([tr('frenzyScore'),e.scoreText(r.spec,r.score)],[tr('runIncome'),'+'+r.earned]);
      add('shareGame',tr('shareGame'),'share',true);
    }else if(page==='endless-result'){
      name=tr('endlessResult');sub=tr('endless');rows.push([lang('本局最远','Distance'),e.endlessPosition(G.res.distance)],[tr('endlessEarned'),'+'+G.res.total]);
      add('endless',tr('backEndless'),'endless',true);
      add('shareGame',tr('shareGame'),'share');
    }else if(page==='achievement'){
      const item=state.achievement,type=e.achievementState(item);name=e.byLanguage(item);sub=lang(item.descZh||tr('achievements'),item.descEn||tr('achievements'));
      for(const goal of e.achievementProgress(item))rows.push([tr(e.achievementGoalText[goal.key]),Math.min(goal.current,goal.target)+' / '+goal.target]);
      rows.push([tr('rewardPrize'),prizeLabel(item)]);
      if(type==='ready')add('claimAchievement',tr('achievementClaim'),'trophy',true);
      if(type==='claimed')add('shareGame',tr('shareGame'),'share',true);
      if(item.knife)add('previewPrize',tr('fullPreview'),'knife');

    }
    if(page==='achievement'){add('back',tr('back'),'back');}
    else if(modalCancel[page])add(modalCancel[page],tr('cancel'),'back');
    else if(page!=='powers')add('home',tr('home'),'home');
    if(courseSettlement){
      const [main,...options]=a;
      main[3]=true;
      for(const option of options)option[3]=false;
      const expanded=state.settlementExpanded;
      const toggle=['settlementOptions',tr(expanded?'settlementCollapse':'settlementExpand')];
      headerCard(name,sub,rows,[main,toggle,...(expanded?options:[])],a.length+1);
    }else headerCard(name,sub,rows,a);
  }
  function paint(g,v){
    vp=v;ctx=g;offsetY=0;zones=[];const page=UI.screen;
    modalCard=null;scrollList=null;rewardControl=null;
    if(modalCancel[page]){home();zones=[];}
    if(page!=='home'&&page!=='shop'){
      g.fillStyle=scrollScreens.has(page)?'#0c1b2c':'rgba(12,27,44,.76)';
      g.fillRect(0,0,v.w+1,v.h+1);
    }
    if(page==='home')home();else if(page==='levels')levels();else if(page==='catalog')gallery();
    else if(page==='shop')armory();else if(page==='supplies')supplies();else if(page==='settings')settings();
    else if(page==='wheel')wheel();else if(page==='achievements')achievements();else dialog();
  }
  function hud(g,v){
    vp=v;ctx=g;offsetY=v.top;zones=[];
    const x=v.x,c=v.cx,w=v.content,p=G.frenzy, y=0;
    button('pause','',x,y,45,43,{icon:'pause'});
    if(p){
      const urgent=p.timeLeft<=8;
      box(g,c-86,y,172,45,18,urgent?'#432637':panel,urgent?'#ff8591':line);
      text(g,Math.ceil(p.timeLeft)+'s',c-41,y+17,urgent?24:19,urgent?'#ffadb6':ink,'center','bold',64);
      text(g,p.score+(e.language==='zh'?' 分':' pts'),c+36,y+17,14,ink,'center','bold',72);
      box(g,c-66,y+34,132,4,2,'#53667b');
      if(p.fever>1)box(g,c-66,y+34,132*p.fever/100,4,2,gold);
    }else{
      const label=G.endless?tr('endless')+' · '+e.endlessPosition(G.farthest):G.dailyChallenge?e.byLanguage(G.dailyChallenge):e.levelCaption(G.idx);
      box(g,c-86,y,172,44,18,panel,line);text(g,label,c,y+17,14,ink,'center','bold',154);
      const remain=e.courseRemaining();
      if(remain!==null){const seconds=Math.ceil(remain);
        text(g,tr('challengeClock',{n:seconds}),c,y+34,12,seconds<=10?'#ff9cb2':gold,'center','bold',116);
      }else if(!G.endless&&!G.dailyChallenge){
        box(g,c-66,y+31,132,4,2,'#53667b');
        if(G.progress>.01)box(g,c-66,y+31,132*G.progress,4,2,gold);
      }else{
        const spec=G.dailyChallenge,elapsed=G.fin?.elapsed??e.dailyElapsed();
        const value=spec?.id==='sprint'?tr('challengeClock',{n:Math.max(0,Math.ceil(spec.goal-elapsed))}):spec?e.scoreText(spec,e.dailyRunScore(spec,elapsed)):'◆ '+Math.round(G.coinsShown);
        text(g,value,c,y+33,11,gold);
      }
    }
    if(!p&&!G.endless&&!G.dailyChallenge){box(g,x,y+50,65,25,11,panel);icon(g,assets,'coinMark',x+13,y+62,14);text(g,Math.round(G.coinsShown),x+39,y+63,12,gold);}
    let effect=p?(p.feverLeft?tr('frenzyFever'):p.freezeLeft?tr('frenzyFreeze'):p.rainLeft?tr('frenzyRain'):p.combo>1?tr('frenzyCombo',{n:p.combo}):''):
      e.TIMED_POWERS.filter(it=>G.powerEnds?.[it.id]>G.K.t).map(it=>e.byLanguage(it)+' '+Math.ceil(G.powerEnds[it.id]-G.K.t)+'s').join(' · ');
    if(!effect&&!p&&G.usedPowers?.length)effect=G.usedPowers.filter(id=>e.SUPPLIES.some(i=>i.id===id))
      .map(id=>e.byLanguage(e.SUPPLIES.find(i=>i.id===id))).join(' · ');
    if(effect){box(g,c-84,50,168,25,11,panel);text(g,effect,c,63,12,gold,'center','bold',155);}
    offsetY=0;
  }
  const pocketStep=63,pocketWidth=56,pocketHeight=64;
  function pocketArea(v){
    if(!e.pocketAvailable())return null;
    const w=v.content,stripWidth=pocketItems.length*pocketStep+4;
    return {x:v.x,y:v.bottom-pocketHeight,w,h:pocketHeight,stripWidth,max:Math.max(0,stripWidth-w)};
  }
  function paintPocketBackground(g,area){
    box(g,0,0,area.w,area.h,13,panel,line);
  }
  function pocket(g,area){
    pocketItems.forEach((item,i)=>{
      const left=6+i*pocketStep,count=SAVE.stock[item.id],id='pocket:'+item.id;
      const canUse=item.id!=='revival'&&!G.usedPowers.includes(item.id);
      const video=canUse&&!count&&e.rewardAvailable('supply:'+item.id);
      const ready=canUse&&(count>0||video);
      const pressed=state.pressed===id||state.pocketAd===item.id;
      const fill=video?(pressed?'#efb74d':gold):pressed?'#47617a':ready?tile:'#233549';
      box(g,left,5,pocketWidth,area.h-10,10,fill,video?'#fff0b0':ready?line:null);
      g.save();if(!ready)g.globalAlpha=.65;
      model(g,assets,item.id,left+8,7,40,video?25:30);
      text(g,e.byLanguage(item),left+28,video?36:47,9,video?dark:ink,'center','bold',pocketWidth-5);
      g.restore();
      if(video)icon(g,assets,'ad',left+pocketWidth/2,50,17,true);
      box(g,left+36,7,17,14,6,dark);
      text(g,count,left+44.5,14,10,count?gold:muted,'center','bold',15);
    });
  }
  function pocketHit(x,y){
    const area=vp&&pocketArea(vp);
    if(!area||x<area.x+4||x>area.x+area.w-4||y<area.y+4||y>area.y+area.h-4)return;
    const position=x-area.x+Math.max(0,Math.min(area.max,state.pocketScroll||0))-6;
    const item=pocketItems[Math.floor(position/pocketStep)];
    if(item&&position%pocketStep<=pocketWidth)return 'pocket:'+item.id;
  }
  function frenzyTimeControl(v){
    const round=G.frenzy;
    if(UI.screen!=='play'||G.mode!=='frenzy'||!round||round.timeExtended||round.timeLeft<=0||
      !e.rewardAvailable('supply:frenzy-time'))return null;
    return {id:'frenzyTime',label:lang('增加15s','Add 15s'),x:v.cx-78,y:v.bottom-52,w:156,h:44,busy:state.frenzyAd==='time'};
  }
  function hint(g,width,height,str){box(g,0,1,width,height-2,16,panel,line);text(g,str,width/2,height/2,14,ink,'center','bold',width-19);}
  return {paint,paintReward,hud,pocket,pocketArea,paintPocketBackground,frenzyTimeControl,hint,disc,prizeLabel,hitAt(x,y){
    if(modalCard&&(x<modalCard.x||x>modalCard.x+modalCard.w||y<modalCard.y||y>modalCard.y+modalCard.h)){
      return modalCancel[UI.screen];
    }
    if(UI.screen==='play'){
      const more=vp&&frenzyTimeControl(vp);
      if(more&&x>=more.x&&x<=more.x+more.w&&y>=more.y&&y<=more.y+more.h)return more.id;
      const item=pocketHit(x,y);
      if(item)return item;
    }
    return zones.find(z=>x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h)?.id;
  },
    get scrollList(){return scrollList;},get rewardControl(){return rewardControl;},
    clearHits(){zones=[];modalCard=null;scrollList=null;rewardControl=null;},zones:()=>zones.map(z=>({...z}))};
};

module.exports.scrollScreens=scrollScreens;
