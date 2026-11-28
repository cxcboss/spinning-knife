'use strict';
const cues=require('./assets/sounds');
module.exports=function createAudio(api=wx){
  let context=null,bank=null,music=null,musicPath='',opened=false,hidden=false,interrupted=false;
  let backgroundEnabled=true,unlocked=false;
  const voices=new Set(),last=new Map(),fallback=[];
  function init(){
    unlocked=true;
    if(opened){if(!hidden&&!interrupted&&context?.state==='suspended')context.resume();return;}
    opened=true;
    if(!api.createWebAudioContext)return;
    try{
      context=api.createWebAudioContext();
      api.getFileSystemManager().readFile({filePath:'assets/sounds.mp3',success:r=>{
        const ready=b=>{if(b)bank=b;};
        try{const p=context.decodeAudioData(r.data,ready,()=>{});p?.then?.(ready,()=>{});}catch{}
      }});
    }catch{context=null;}
  }
  function releaseVoice(src){
    voices.delete(src);src.onended=null;
    try{src.disconnect();}catch{}
  }
  function stopSlot(slot){
    clearTimeout(slot.timer);slot.busy=false;
    try{slot.player.stop();}catch{}
  }
  function sound(name,options,knife){
    if(!unlocked||hidden||interrupted)return;
    let variant=name+':'+(options?.knife||knife)?.id;
    if(name==='finish')variant='finish-'+(options?.m||1);
    if(name==='power')variant='power-'+options.id;
    const cue=cues[variant]||cues[name]||cues[name+':chef'];if(!cue)return;
    const now=Date.now();if(now-(last.get(name)||0)<32)return;last.set(name,now);
    if(bank&&context){
      if(voices.size>=12)return;
      let src;
      try{
        src=context.createBufferSource();src.buffer=bank;src.connect(context.destination);
        voices.add(src);src.onended=()=>releaseVoice(src);
        src.start(0,cue[0],cue[1]);
      }catch{if(src)releaseVoice(src);} // The device can interrupt playback between these calls.
      return;
    }
    // Older clients play clipped samples through a bounded pool of native players.
    if(context && !bank && now-(sound.first ||= now)<900)return;
    let slot=fallback.find(v=>!v.busy);
    try{
      if(!slot && fallback.length<4){
        const player=api.createInnerAudioContext();player.src='assets/sounds.mp3';
        slot={player,busy:false,timer:0};fallback.push(slot);
      }
      if(!slot)return;
      slot.busy=true;slot.player.startTime=cue[0];slot.player.seek(cue[0]);slot.player.play();
      slot.timer=setTimeout(()=>stopSlot(slot),Math.ceil(cue[1]*1000));
    }catch{
      if(slot)stopSlot(slot);
    }
  }
  function theme(track,enabled){
    backgroundEnabled=enabled;
    const next='assets/music-'+track+'.mp3';
    if(!unlocked||hidden||interrupted||!enabled){if(music&&!music.paused)music.pause();return;}
    if(!music){music=api.createInnerAudioContext();music.loop=true;music.volume=.32;}
    if(musicPath!==next){musicPath=next;music.src=next;music.play();}
    else if(music.paused)music.play();
  }
  function suspend(value){
    hidden=value;
    if(value||interrupted){
      music?.pause();context?.suspend?.();
      for(const s of voices){try{s.stop();}catch{}}voices.clear();
      for(const slot of fallback)stopSlot(slot);
    }else if(unlocked){
      context?.resume?.();if(backgroundEnabled&&music)music.play();
    }
  }
  api.onAudioInterruptionBegin?.(()=>{interrupted=true;suspend(hidden);});
  api.onAudioInterruptionEnd?.(()=>{interrupted=false;suspend(hidden);});
  return {init,sound,theme,suspend};
};
