const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','旋转飞刀.html'),'utf8');
const code=html.split('<script>')[1].split('\ntry { boot();')[0];
function game(){
 const nodes=new Map(),doc={querySelector(id){if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);}};
 return vm.runInNewContext(code+'\n;({SAVE,UI,spendCoins,canEquip,walletText,isOpen,grantReward,claimDaily})',{document:doc,URLSearchParams,localStorage:{setItem(){}}});
}
test('公开试玩的金币、库存与已拥有装备独立计算',()=>{
 const a=game();assert.equal(a.walletText(),'0');assert(a.canEquip('chef'));assert(!a.canEquip('carrot'));assert(!a.isOpen(1));
 assert(!a.spendCoins(120));a.SAVE.coins=150;assert(a.spendCoins(120));assert.equal(a.SAVE.coins,30);
 assert(Object.values(a.SAVE.stock).every(v=>v===0));assert(a.claimDaily(20));assert.equal(a.SAVE.stock.steady,1);assert.equal(a.claimDaily(20),null);
});
test('仅提供一次有效复活，其余广告无奖励，离开弹窗不会补发',async()=>{
 const a=game();let grants=0;
 for(const p of ['double','supply:gild','run:rain'])assert.equal(await a.grantReward(p,()=>true,()=>grants++),false);
 const good=()=>grants===0;const results=await Promise.all([a.grantReward('revive',good,()=>grants++),a.grantReward('revive',good,()=>grants++)]);
 assert(results.includes(true));assert.equal(grants,1);assert.equal(await a.grantReward('revive',good,()=>grants++),false);
 const late=a.grantReward('revive',()=>true,()=>grants++);a.UI.view++;assert.equal(await late,false);assert.equal(grants,1);
});

test('新试玩默认统计，关闭后记住选择并停止收集',()=>{
 const client=fs.readFileSync(path.join(__dirname,'..','playtest.js'),'utf8');
 const storage={},timers=new Set();
 Object.defineProperties(storage,{
   getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>storage[k]=v},removeItem:{value:k=>delete storage[k]}
 });
 const prefs=()=>{
   const window={addEventListener(){}};
   vm.runInNewContext(client,{window,navigator:{userAgent:'Android'},document:{addEventListener(){}},
     location:new URL('https://cxcboss.github.io/spinning-knife/?qa=1'),URLSearchParams,localStorage:storage,
     crypto:require('node:crypto').webcrypto,setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)});
   return window.KnifeStats;
 };
 const game={idx:0,skin:'chef',hops:0,cut:0,progress:0,coins:0};
 const rows=()=>Object.keys(storage).filter(k=>k.startsWith('spinning-knife.stats.p1.qa.out.'));
 let stats=prefs();assert.equal(stats.choice,'yes');stats.start(game,'play');assert.equal(rows().length,1);
 stats.change(false);assert.equal(rows().length,0);
 stats=prefs();assert.equal(stats.choice,'no');stats.start(game,'play');stats.action('equip','chef');assert.equal(rows().length,0);
 stats.change(true);stats=prefs();stats.start(game,'play');assert.equal(rows().length,1);
});
