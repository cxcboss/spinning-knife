'use strict';

function viewport(info, capsule) {
  const width = Math.max(1, info.windowWidth || info.screenWidth || 375);
  const height = Math.max(1, info.windowHeight || info.screenHeight || 667);
  const origin = info.screenTop || 0;
  const safe = info.safeArea || {};
  const left = Math.max(0, safe.left || 0);
  const right = Math.min(width, safe.right || width);
  const safeTop = Math.max(0, (safe.top || info.statusBarHeight || 0) - origin);
  const safeBottom = Math.min(height, (safe.bottom || height + origin) - origin);
  const menuBottom = capsule && capsule.width > 0 && capsule.bottom > capsule.top
    ? capsule.bottom - origin : safeTop + 36;
  const top = Math.max(menuBottom, safeTop) + 8;
  const bottom = Math.max(top + 1, safeBottom - 10);
  const scale = Math.max(.35, Math.min((right-left)/360, (bottom-top)/524, 1.6));
  const w = width/scale, h = height/scale;
  const safeWidth = (right-left)/scale;
  const content = Math.min(340, safeWidth - 24);
  return {width,height,scale,w,h,top:top/scale,bottom:bottom/scale,
    x:(right+left)/(2*scale)-content/2,content,cx:(right+left)/(2*scale),
    pixelRatio:info.pixelRatio||1, safeTop, safeBottom, left,right};
}

function readViewport() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  let capsule;
  try { capsule = wx.getMenuButtonBoundingClientRect(); } catch {}
  return viewport(info,capsule);
}
function readImage(file) {
  return new Promise((resolve,reject)=>{
    const img=wx.createImage();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('无法载入 '+file));
    img.src='assets/'+file;
  });
}
function offscreen(w,h) {
  const cv = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({type:'2d',width:w,height:h}) : wx.createCanvas();
  cv.width=w; cv.height=h;
  return cv;
}
const storage={getItem:key=>wx.getStorageSync(key)||null,setItem:(key,value)=>wx.setStorageSync(key,value)};
module.exports={viewport,readViewport,readImage,offscreen,storage};
