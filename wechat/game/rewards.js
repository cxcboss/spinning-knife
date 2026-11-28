'use strict';
const configuredUnits = require('./ad-units');
const resultsPerInterstitial = 3;
const interstitialInterval = 120000;
const rewardRetryInterval = 60000;

module.exports = function createRewards(api, units=configuredUnits, now=Date.now, onAvailabilityChange=()=>{}) {
  const unit = placement => units.rewarded?.[placement.split(':')[0]];
  const slots = new Map();
  const started = now();
  let fullscreen = '', lastFullscreen = started, interstitial, completedResults = 0;

  // The SDK decides whether this player can receive another ad. Only a loaded
  // video enables a reward. A no-fill response carries no daily quota number.
  function setReady(slot, ready) {
    if(slot.ready===ready)return;
    slot.ready=ready;
    onAvailabilityChange();
  }

  function prepareRewards() {
    if(fullscreen || typeof api.createRewardedVideoAd!=='function')return;
    for(const id of new Set(Object.values(units.rewarded||{}))){
      if(!id)continue;
      const previous=slots.get(id);
      if(previous && previous.retryAt>now())continue;
      const slot={ready:false,retryAt:Infinity,video:null,finish:null};
      slots.set(id,slot);
      const unavailable=()=>{
        if(slots.get(id)!==slot)return;
        slot.retryAt=now()+rewardRetryInterval;
        setReady(slot,false);
        slot.finish?.(false);
      };
      try{
        previous?.video?.destroy?.();
        const video=api.createRewardedVideoAd({adUnitId:id,multiton:true,disableFallbackSharePage:true});
        slot.video=video;
        video.onError(unavailable);
        video.onLoad(()=>{
          if(slots.get(id)!==slot)return;
          slot.retryAt=Infinity;
          setReady(slot,true);
        });
        video.onClose(result=>slot.finish?.(result?.isEnded===true));
      }catch{unavailable();}
    }
  }

  function finishInterstitial() {
    if(fullscreen!=='interstitial')return;
    fullscreen='';
    lastFullscreen=now();
  }

  function interstitialAfterResult() {
    if(!units.interstitial||typeof api.createInterstitialAd!=='function')return;
    completedResults=Math.min(resultsPerInterstitial,completedResults+1);
    if(fullscreen||completedResults<resultsPerInterstitial||now()-lastFullscreen<interstitialInterval)return;
    try{
      if(!interstitial){
        interstitial=api.createInterstitialAd({adUnitId:units.interstitial});
        interstitial.onClose(finishInterstitial);
        interstitial.onError(finishInterstitial);
      }
      fullscreen='interstitial';
      completedResults=0;
      Promise.resolve(interstitial.show()).catch(finishInterstitial);
    }catch{finishInterstitial();}
  }

  return {
    interstitialAfterResult,
    prepareRewards,
    available(placement) { return slots.get(unit(placement))?.ready===true; },
    async show(placement) {
      const slot=slots.get(unit(placement));
      if(fullscreen || !slot?.ready)return false;
      fullscreen='rewarded';
      setReady(slot,false);
      return new Promise(resolve=>{
        const finish=ok=>{
          if(slot.finish!==finish)return;
          slot.finish=null;
          fullscreen='';
          lastFullscreen=now();
          resolve(ok);
        };
        slot.finish=finish;
        const failed=()=>{
          if(slot.finish!==finish)return;
          slot.retryAt=now()+rewardRetryInterval;
          setReady(slot,false);
          finish(false);
        };
        try{Promise.resolve(slot.video.show()).catch(failed);}
        catch{failed();}
      });
    }
  };
};
