const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','小刀飞飞飞.html'),'utf8');
const code=html.split('<script>')[1].split('\ntry { boot();')[0];
function game(build='release'){
 const nodes=new Map(),store=new Map(),doc={documentElement:{dataset:{build}},querySelector(id){if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);}};
 return vm.runInNewContext(code+'\n;({SAVE,UI,SAVE_KEY,spendCoins,canEquip,walletText,isOpen,rewardedVideo,grantReward,claimDaily,trialGesture,unlockTrial,toggleTrial,saveWrite,drawWheelPrize,endlessRemaining,endlessQuota,saveEndlessQuota})',
   {document:doc,URLSearchParams,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});
}
test('公开试玩的金币、库存与已拥有装备独立计算',()=>{
 const a=game();assert.equal(a.walletText(),'0');assert(a.canEquip('chef'));assert(!a.canEquip('carrot'));assert(!a.isOpen(1));
 assert(!a.spendCoins(120));a.SAVE.coins=150;assert(a.spendCoins(120));assert.equal(a.SAVE.coins,30);
 assert(Object.values(a.SAVE.stock).every(v=>v===0));assert(a.claimDaily(20));assert.equal(a.SAVE.stock.steady,1);assert.equal(a.claimDaily(20),null);
});
test('仅提供一次有效复活，其余广告无奖励，离开弹窗不会补发',async()=>{
 const a=game();let grants=0;
 for(const p of ['double','supply:gild','run:rain'])assert.equal(await a.grantReward(p,()=>true,()=>grants++),false);
 assert.equal(await a.grantReward('revive',()=>true,()=>grants++),false);
 a.rewardedVideo.provider={available:p=>p==='revive',show:async()=>true};
 const good=()=>grants===0;const results=await Promise.all([a.grantReward('revive',good,()=>grants++),a.grantReward('revive',good,()=>grants++)]);
 assert(results.includes(true));assert.equal(grants,1);assert.equal(await a.grantReward('revive',good,()=>grants++),false);
 const late=a.grantReward('revive',()=>true,()=>grants++);a.UI.view++;assert.equal(await late,false);assert.equal(grants,1);
});

test('隐藏设置仅试玩包可用，四项开关与真实进度分离，极品试抽固定 80%',()=>{
 const release=game();
 assert(!release.trialGesture(100));assert(!release.unlockTrial('9900'));assert(!release.toggleTrial('gear'));
 const a=game('playtest');
 for(let i=0;i<4;i++)assert(!a.trialGesture(i*120));
 assert(a.trialGesture(480));assert(!a.unlockTrial('9990'));assert(!a.toggleTrial('coins'));
 assert(a.unlockTrial('9900'));a.SAVE.coins=23;a.saveWrite();
 for(const key of ['gear','levels','coins','luck'])assert(a.toggleTrial(key),key);
 assert(a.canEquip('thousand'));assert(a.isOpen(29));assert(a.spendCoins(1000000));assert.equal(a.walletText(),'∞');
 const quota=a.endlessQuota();quota.started++;a.saveEndlessQuota(quota);assert.equal(a.endlessRemaining(),2);
 let premium=0;
 for(let i=0;i<100;i++)if(a.drawWheelPrize(a.endlessQuota().day,()=>i/100).knife)premium++;
 assert.equal(premium,80);
 assert(a.drawWheelPrize(a.endlessQuota().day,()=>.6).knife,'owned jackpot can still be drawn');
 for(const blade of ['gilded-wheel','azure-dragon'])assert.equal(a.SAVE.owned.filter(id=>id===blade).length,1);
 for(const key of ['gear','levels','coins','luck'])assert(a.toggleTrial(key),key);
 assert.equal(a.walletText(),'23');assert.equal(a.endlessRemaining(),3);
 assert(!a.canEquip('thousand'));assert(!a.canEquip('azure-dragon'));assert(!a.isOpen(29));
});
