'use strict';
// Add approved unit IDs here when the account can serve rewarded video.
const units = {revive:'', double:'', supply:'', run:''};

module.exports = function createRewards(api) {
  const unit = placement => units[placement.split(':')[0]];
  const slots = new Map();
  return {
    available(placement) { return !!unit(placement) && typeof api.createRewardedVideoAd==='function'; },
    async show(placement) {
      const id=unit(placement);
      if(!id || typeof api.createRewardedVideoAd!=='function')return false;
      let video=slots.get(id);
      if(!video){video=api.createRewardedVideoAd({adUnitId:id});slots.set(id,video);}
      return new Promise(resolve=>{
        let finished=false;
        function end(ok){
          if(finished)return;
          finished=true;video.offClose(close);video.offError(error);resolve(ok);
        }
        function close(result){end(result?.isEnded===true);}
        function error(){end(false);}
        video.onClose(close);video.onError(error);
        Promise.resolve().then(()=>video.show()).catch(async()=>{
          if(!finished){await video.load();if(!finished)await video.show();}
        }).catch(error);
      });
    }
  };
};
