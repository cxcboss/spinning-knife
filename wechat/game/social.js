'use strict';

function shareGame(language){
  const title=language==='en'?'Play 小刀飞飞飞! How far can you jump?':'来玩小刀飞飞飞！试试你能跳到第几根柱子。';
  return {title,query:''};
}

function installShareMenu(wx,getLanguage){
  const share=()=>shareGame(getLanguage());
  wx.onShareAppMessage?.(share);
  const friends={menus:['shareAppMessage']};
  if(typeof wx.onShareTimeline==='function'){
    wx.onShareTimeline(share);
    wx.showShareMenu?.({menus:['shareAppMessage','shareTimeline'],fail:()=>wx.showShareMenu?.(friends)});
  }else wx.showShareMenu?.(friends);
}

module.exports={installShareMenu,shareGame};
