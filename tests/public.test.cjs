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
