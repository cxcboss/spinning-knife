// Anonymous run summaries with a persistent off switch. No player identifier persists across runs.
(() => {
  'use strict';
  const qa=new URLSearchParams(location.search).get('qa')==='1';
  if(location.origin!=='https://cxcboss.github.io'||!location.pathname.startsWith('/spinning-knife/'))return;
  const endpoint='https://spinning-knife-stats.1967994768.workers.dev/collect'+(qa?'?qa=1':'');
  const prefix='spinning-knife.stats.p1.'+(qa?'qa.':'live.'),pref=prefix+'consent',out=prefix+'out.';
  const build='p2',ua=navigator.userAgent;
  const platform=/Android/i.test(ua)?'android':/iPhone|iPad|iPod/i.test(ua)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?'ios':/Mobile/i.test(ua)?'mobile':'desktop';
  const memory=new Map();
  let choice='yes',run=null,game=null,sending=false,timer=0,activeMs=0,nextSave=15000,skipFrame=true;
  try{if(localStorage.getItem(pref)==='no')choice='no';}catch{}
  function records(){
    const result=new Map(memory);
    try{for(const k of Object.keys(localStorage)){
      if(!k.startsWith(out))continue;
      const pair=JSON.parse(localStorage.getItem(k));
      if(!pair||Date.now()-pair.time>86400000){localStorage.removeItem(k);continue;}
      if(!result.has(k)||result.get(k).data.rev<pair.data.rev)result.set(k,pair);
    }}catch{}
    return [...result].sort((a,b)=>a[1].time-b[1].time);
  }
  function remove(key,rev){
    if(memory.get(key)?.data.rev===rev)memory.delete(key);
    try{if(JSON.parse(localStorage.getItem(key))?.data.rev===rev)localStorage.removeItem(key);}catch{}
  }
  function schedule(ms){if(!timer&&choice==='yes')timer=setTimeout(()=>{timer=0;flush();},ms);}
  function enqueue(e){
    const key=out+e.id,pair={time:Date.now(),data:{...e}};
    memory.set(key,pair);
    try{localStorage.setItem(key,JSON.stringify(pair));}catch{}
    const rows=records();for(const [k,v] of rows.slice(0,-48))remove(k,v.data.rev);
    schedule(500);
  }
  async function flush(){
    if(sending||choice!=='yes')return;
    const batch=records().slice(0,12);if(!batch.length)return;
    sending=true;let ok=false;
    try{const r=await fetch(endpoint,{method:'POST',body:JSON.stringify(batch.map(v=>v[1].data)),headers:{'Content-Type':'text/plain;charset=UTF-8'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true});
      if(r.ok){ok=true;for(const [k,v] of batch)remove(k,v.data.rev);}
    }catch{}finally{sending=false;if(records().length)schedule(ok?100:30000);}
  }
  function change(yes,persist=true){
    choice=yes?'yes':'no';if(persist)try{localStorage.setItem(pref,choice);}catch{}
    if(!yes){run=game=null;clearTimeout(timer);timer=0;for(const [k,v] of records())remove(k,v.data.rev);}
  }
  const distance=n=>Math.min(1000000,n||0);
  function save(state){
    if(!run||!game)return;
    run.state=state;run.rev++;run.seconds=Math.min(86400,Math.round(activeMs/1000));
    Object.assign(run,{
      hops:distance(game.hops),cuts:distance(game.cut),progress:game.endless?0:game.fin?100:Math.round(game.progress*100),
      coins:Math.min(100000000,game.res?.total??game.coins),distance:game.endless?distance(game.farthest):0
    });
    enqueue(run);
  }
  function close(){if(!run)return;if(!['failed','won'].includes(run.state))save('left');run=game=null;}
  function start(g,entry){
    close();if(choice!=='yes'||!crypto.randomUUID)return;
    game=g;activeMs=0;nextSave=15000;skipFrame=true;
    run={id:crypto.randomUUID(),type:'run',rev:0,platform,build,entry,gear:g.skin,level:g.endless?0:g.idx+1,deaths:0,revived:0,
      itemRevived:0,settled:0,pad:0,pad2:0,pad3:0,reason:'none',reason2:'none',reason3:'none',mult:0,frames:0,frameMs:0,slow:0};
    save('playing');
  }
  function tick(ms){
    if(!run||run.state!=='playing'||!Number.isFinite(ms)||ms<=0)return;
    if(skipFrame){skipFrame=false;return;}
    activeMs+=ms;run.frames++;run.frameMs=Math.round(activeMs);if(ms>33.34)run.slow++;
    if(activeMs>=nextSave){nextSave=activeMs+15000;save('playing');}
  }
  function pause(){skipFrame=true;if(run?.state==='playing')save('away');}
  function resume(){if(run?.state==='away'){skipFrame=true;save('playing');}}
  function death(reason,pad){
    if(!run)return;
    run.deaths=Math.min(3,run.deaths+1);
    const suffix=run.deaths===1?'':String(run.deaths);
    run['pad'+suffix]=distance(pad);run['reason'+suffix]=['slip','spike','void'].includes(reason)?reason:'other';
    save('failed');
  }
  function revive(source){
    if(!run)return;
    if(source==='item')run.itemRevived=1;else run.revived=1;
    skipFrame=true;save('playing');
  }
  function finish(mult){if(run){run.mult=mult;save('won');}}
  function endlessFinish(){if(run&&run.level===0){run.settled=1;save('failed');}}
  function action(kind,item){if(choice==='yes'&&crypto.randomUUID)enqueue({type:'action',id:crypto.randomUUID(),platform,build,rev:1,kind,item});}
  window.addEventListener('online',flush);
  window.addEventListener('storage',e=>{if(e.key===pref||e.key===null)change(e.newValue!=='no',false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();flush();}});
  window.addEventListener('pagehide',()=>{pause();flush();});
  if(choice==='yes')schedule(1000);
  window.KnifeStats={get choice(){return choice;},change,start,close,tick,pause,resume,death,revive,finish,endlessFinish,action};
})();
