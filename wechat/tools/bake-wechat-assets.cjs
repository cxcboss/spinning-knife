// Only needed after changing the procedural art, meshes, or soundtrack.
// Requires Playwright, Chrome and ffmpeg. The output is bundled for offline play.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..', '..');
const dir = path.join(root, 'wechat/game/assets');
const rate = 22050;
async function main() {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(root, 'web/index.html'));
    const art = await page.evaluate(() => {
      const icons = Object.keys(ICON_PATHS), cols=8, cell=48;
      const iconSheet=document.createElement('canvas');
      iconSheet.width=cols*cell;iconSheet.height=Math.ceil(icons.length/cols)*cell*2;
      const ctx=iconSheet.getContext('2d');
      icons.forEach((id,i)=>['#f5f8ff','#25334a'].forEach((tint,j)=>{
        ctx.save();ctx.translate(i%cols*cell,Math.floor(i/cols)*cell+j*iconSheet.height/2);
        ctx.scale(2,2);ctx.strokeStyle=tint;ctx.lineWidth=1.9;ctx.lineJoin=ctx.lineCap='round';
        ctx.stroke(new Path2D(ICON_PATHS[id]));ctx.restore();
      }));
      const box=document.createElement('div');box.id='native-models';document.body.appendChild(box);
      const ids=[...KNIVES,...ALL_SUPPLIES].map(item=>item.id);
      ids.forEach(id=>{const cv=document.createElement('canvas');cv.width=148;cv.height=92;
        cv.dataset[KNIFE_BY_ID[id]?'knife':'model']=id;cv.dataset.zoom='.85';box.appendChild(cv);});
      drawModelCards('#native-models',true);drawModelCards('#native-models');
      const sheet=document.createElement('canvas');sheet.width=148*6;sheet.height=Math.ceil(ids.length/6)*92;
      const g=sheet.getContext('2d');[...box.children].forEach((cv,i)=>g.drawImage(cv,i%6*148,Math.floor(i/6)*92));
      return {atlas:paintAtlas().toDataURL(),icons:iconSheet.toDataURL(),models:sheet.toDataURL(),index:{icons,models:ids}};
    });
    const cardsOnly=process.argv.includes('--cards-only');
    for(const key of cardsOnly?['icons','models']:['atlas','icons','models']) fs.writeFileSync(path.join(dir,key+'.png'),Buffer.from(art[key].split(',')[1],'base64'));
    fs.writeFileSync(path.join(dir,'art.js'),'module.exports = '+JSON.stringify(art.index)+';\n');
    if(cardsOnly)return;
    const names=await page.evaluate(()=>[
      ...['airtap','coin','pop','perfect','bonk','frenzyBomb','fail','respawn','checkpoint','star','wheelStart','wheelTick','wheelLock','wheelCoins','prizeReveal','ui','back','buy','no'],
      ...Object.keys(FINISH_SHOWS).map(k=>'finish-'+k),
      ...Object.keys(SLICEABLE).map(k=>'material-'+k),
      ...KNIVES.flatMap(k=>['launch','stick','slice','preview'].map(n=>n+':'+k.id)),
      ...TIMED_POWERS.map(item=>'power-'+item.id),
      ...THEMES.map((_,i)=>'music-'+i),'music-bench','music-fast'
    ]);
    const bank=[],index={}; let frames=0;
    for(const name of names){
      const music=name.startsWith('music-');
      const data=await page.evaluate(async ({name,rate,music})=>{
        const world=Number(name.split('-')[1])||0,bench=name==='music-bench',fast=name==='music-fast';
        const seconds=music?64*30/(bench?82:fast?120:100+world*2):1.35;
        const off=new OfflineAudioContext(1,Math.ceil(seconds*rate),rate);
        let clock=0;
        AUD.ctx=new Proxy(off,{get(obj,key){if(key==='currentTime')return clock;const val=obj[key];return typeof val==='function'?val.bind(obj):val;}});
        AUD.sfxG=off.createGain();AUD.sfxG.gain.value=.85;AUD.sfxG.connect(off.destination);
        AUD.musG=off.createGain();AUD.musG.gain.value=.65;AUD.musG.connect(off.destination);
        const noise=off.createBuffer(1,rate,rate),arr=noise.getChannelData(0),rng=mulberry32(725);
        for(let i=0;i<arr.length;i++)arr[i]=rng()*2-1;AUD.noise=noise;AUD.last={};AUD.on=AUD.music=true;
        if(music){AUD.world=world;AUD.mNext=AUD.mStep=0;G.idx=fast?9:0;G.demo=false;UI.screen=bench?'shop':'play';
          for(clock=0;clock<seconds;clock+=.1)musicTick();}
        else if(name.startsWith('material-'))materialSound(name.slice(9),KNIVES[0]);
        else if(name.startsWith('finish-'))sfx('finish',{m:Number(name.slice(7))});
        else if(name.startsWith('power-'))sfx('power',POWER_BY_ID[name.slice(6)]);
        else{const [effect,id]=name.split(':');sfx(effect,{knife:KNIFE_BY_ID[id]||KNIVES[0]});}
        const pcm=(await off.startRendering()).getChannelData(0);let n=pcm.length;
        if(!music){while(n>1&&Math.abs(pcm[n-1])<.00012)n--;n=Math.min(pcm.length,n+150);}
        const ints=new Int16Array(n);for(let i=0;i<n;i++)ints[i]=Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767);
        const bytes=new Uint8Array(ints.buffer);let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));
        AUD.ctx=null;return btoa(str);
      },{name,rate,music});
      const raw=Buffer.from(data,'base64');
      if(music){
        const proc=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','s16le','-ar',String(rate),'-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','40k',path.join(dir,name+'.mp3')],{input:raw});
        if(proc.status!==0)throw Error(proc.stderr.toString());
      }else{index[name]=[frames/rate,raw.length/2/rate];bank.push(raw);frames+=raw.length/2;}
    }
    const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','s16le','-ar',String(rate),'-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','80k',path.join(dir,'sounds.mp3')],{input:Buffer.concat(bank)});
    if(encoded.status!==0)throw Error(encoded.stderr.toString());
    fs.writeFileSync(path.join(dir,'sounds.js'),'module.exports = '+JSON.stringify(index)+';\n');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
