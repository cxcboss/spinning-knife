const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const sourcePath = join(__dirname, '..', 'web', 'index.html');
const output = join(__dirname, 'dist');
let html = readFileSync(sourcePath, 'utf8');

// Fail when a shared-source change invalidates a Toy adaptation.
function replace(before, after = '') {
  const matches = typeof before === 'string'
    ? html.split(before).length - 1
    : (html.match(new RegExp(before.source, before.flags.replace('g', '') + 'g')) || []).length;
  if (matches !== 1) throw new Error(`预期匹配一次，实际匹配 ${matches} 次：${before}`);
  html = html.replace(before, () => after);
}

function removeBetween(start, end) {
  const first = html.indexOf(start);
  const last = html.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到构建区间：${start} → ${end}`);
  replace(html.slice(first, last));
}

replace('data-build="release"', 'data-build="bilibili-toy"');
html = html.replaceAll('小刀飞飞飞', '旋转飞刀').replaceAll("title1: '小刀', title2: '飞飞飞'", "title1: '旋转', title2: '飞刀'");
replace("const SAVE_KEY = 'spinning-knife.public.v1'+(typeof location!=='undefined'&&new URLSearchParams(location.search).get('qa')==='1'?'.qa':'');",
  "const SAVE_KEY = 'spinning-knife.bilibili-toy.v1';");

// The Toy keeps manual play, including the home-screen animation and frenzy feedback.
replace(/^.*if \(webAuto\.inputs .*\n/m);
replace(/^.*if\(webAuto\.enabled&&webAuto\.mode==='frenzy'\)webFrenzyPilot.*\n/m);
replace(/^const webAuto=.*\n/m);
removeBetween('// Compare a short flight after a real tap', 'function renderSettings()');
removeBetween("    case 'randomOutcome':", "    case 'sfx':");
replace(/^.*toggle\('randomOutcome'.*\n.*toggle\('webAuto'.*\n/m);
replace(/^.*if\(name==='home'\)clearWebAuto\(\);\n/m);
replace(/^.*if\(name==='auto-mode'\)renderAutoMode\(\);\n/m);
replace(/^.*if\(webAuto\.enabled\)planWebCourse\(\);\n/m);
replace("||(name==='auto-mode'&&id==='settings')", '');
replace("else if(scr==='settings')shortcut('settingsBack');else if(scr==='auto-mode')shortcut('cancelAuto');",
  "else if(scr==='settings')shortcut('settingsBack');");
replace("['auto-mode','home'", "['home'");
removeBetween('let backgroundPlayTimer=', 'function kickMusic()');
replace(/  document\.addEventListener\('visibilitychange', \(\) => \{[\s\S]+?(?=  window\.addEventListener\('storage')/,
`  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoPause();
      AUD.ctx?.suspend()?.catch(() => {});
    } else {
      MAIN.last = performance.now();
      audResume();
    }
  });
  window.addEventListener('pagehide', autoPause);
`);
replace("if((UI.screen==='home'||UI.screen==='play') && (UI.screen!=='play'||webCourseReady()))Game.update(dt);\n      advanceWebCourse(dt);",
  "if(UI.screen==='home'||UI.screen==='play')Game.update(dt);");

// Remove the web playtest controls and private save overlay.
removeBetween('const PLAYTEST_BUILD=', 'let savedSnapshot;');
removeBetween('function renderTrialPin()', '/* ---------------- event screens');
removeBetween("    case 'trialUnlock':", "    case 'noticeClose':");
replace(/^[^\n]*SCREENS\.push\('trial-pin'.*\n/m);
replace(/^.*if\(\(name==='trial-pin'.*\n/m);
replace(/^.*renderTrialPin\(\);\n.*renderTrialSettings\(\);\n/m);
replace(/^.*if\(a!=='lang'\)TRIAL\.taps=0;\n/m);
replace(/^.*trialGesture\(performance\.now\(\)\).*\n/m);
replace(/^.*if\(scr==='trial-pin'&&k==='Enter'\).*\n/m);
replace(/^.*else if\(scr==='trial-pin'\).*\n.*else if\(scr==='trial-settings'\).*\n/m);
replace("ownsKnife(id)||(trialEnabled('gear')&&!!KNIFE_BY_ID[id]&&!KNIFE_BY_ID[id].special)", "ownsKnife(id)");
replace("trialEnabled('coins')?'∞':SAVE.coins.toLocaleString('en-US')", "SAVE.coins.toLocaleString('en-US')");
replace(/^.*if\(trialEnabled\('coins'\)\)return true;\n/m);
replace("(trialEnabled('levels')||i < SAVE.unlocked)", "i < SAVE.unlocked");
removeBetween('const WHEEL_WEAPONS=', 'function loadProgression(');
removeBetween("  const pick=random(),boost=trialEnabled('luck');", '  const prize=WHEEL_PRIZES[slot];');
replace('  const prize=WHEEL_PRIZES[slot];',
`  let roll=Math.floor(random()*10000),slot=0;
  while(slot<WHEEL_PRIZES.length-1&&roll>=WHEEL_PRIZES[slot].weight)roll-=WHEEL_PRIZES[slot++].weight;
  if(WHEEL_PRIZES[slot].knife&&(p.days<3||clearedCourses()<10||ownsKnife(WHEEL_PRIZES[slot].knife)))slot=0;
  const prize=WHEEL_PRIZES[slot];`);
html = html.replaceAll('  if(TRIAL.base)return;\n', '').replaceAll('  if(TRIAL.base)return update();\n', '');

// Standalone progress and three daily Endless starts, without outbound links or challenge cards.
removeBetween('const ENDLESS_SHARE_REWARD=', 'function newEndlessSeed()');
const quota = `const ENDLESS_QUOTA_KEY=SAVE_KEY+'.endless-quota';
let endlessQuotaCache=null;
function endlessQuota(today=calendarDay()){
  let quota=endlessQuotaCache;
  try{
    const raw=localStorage.getItem(ENDLESS_QUOTA_KEY);
    if(raw)quota=JSON.parse(raw);
  }catch{/* In-memory fallback for unavailable storage. */}
  if(quota?.day!==today)return {day:today,started:0};
  return {day:today,started:natural(quota.started)};
}
const endlessRemaining=(quota=endlessQuota())=>Math.max(0,ENDLESS_DAILY_LIMIT-quota.started);
const endlessPosition=n=>n?tr('endlessPad',{n}):tr('endlessOrigin');
function saveEndlessQuota(quota){
  endlessQuotaCache=quota;
  try{localStorage.setItem(ENDLESS_QUOTA_KEY,JSON.stringify(quota));}catch{/* The current tab retains its counter. */}
}
function withEndlessQuota(update){
  const locks=globalThis.navigator?.locks;
  return locks?locks.request(ENDLESS_QUOTA_KEY,update):update();
}
`;
replace('const ENDLESS_DAILY_LIMIT=3;\n', 'const ENDLESS_DAILY_LIMIT=3;\n'+quota);
removeBetween('const endlessShareData=', 'function renderEndless()');
removeBetween('  const shareLimit=quota.shares.length', "  dialog('endless'");
replace(/    '<div class="endless-quota"><span>'[^\n]+\n/,
  "    '<div class=\"endless-quota\"><span>'+tr('endlessLimit',{n:ENDLESS_DAILY_LIMIT})+'</span></div>'+\n");
removeBetween("    actionButton(nativeShare?", "    actionButton(\x27cancelMode\x27");
removeBetween('async function shareEndless(', 'function rememberEndlessFailure()');
replace(",'frenzy-result','duel'];", ",'frenzy-result'];");
replace(/^.*if\(name==='duel'\)renderDuel\(\);\n/m);
removeBetween("    case 'shareEndless':", "    case 'cashOutEndless':");
replace(/^.*case 'shareAchievement':.*\n/m);
replace(/^.*const needsActivation=\[.*\n/m);
replace('if(remaining>0&&!needsActivation)', 'if(remaining>0)');
removeBetween("  if(PARAMS.has('duel')){", '  MAIN.last = performance.now();');
removeBetween('function shareScoreField()', 'function renderDailyChallenge()');
removeBetween('async function sharePlayerResult(', '// The display order');
replace(/^.*actionButton\('shareDailyScore'.*\n/m);
replace(/^.*actionButton\(r\.reply\?'replyDuel'.*\n/m);
replace(/^.*state==='claimed'\?'<button class="achievement-cta shared".*\n/m,
  "      state==='claimed'?'<span class=\"achievement-cta shared\">'+glyph('check')+'</span>':\n");
html = html.replaceAll('+shareScoreField()', '');
removeBetween("function startFrenzy(duel){", "  audInit();saveLoad(false);");
replace("  audInit();saveLoad(false);",
`function startFrenzy(){
  if(UI.screen!=='frenzy'&&!(['play','pause'].includes(UI.screen)&&G.frenzy))return false;
  audInit();saveLoad(false);`);
removeBetween("  if(duel){if(!startDuel", "  recordPlayDay();");
replace("  recordPlayDay();\n  UI.frenzyResult=null;",
`  const round=Game.startFrenzy();
  round.bonusTime=.35;round.nextBonusPower=5;round.bonusPower='freeze';
  recordPlayDay();
  UI.frenzyResult=null;`);
replace(/^.*f\.result\.reply=completeDuel\(f\).*\n/m);

// The Toy uses the same manual gameplay without an ad provider.
removeBetween('// A host can provide completed-view receipts', '// The bevels and collision strips');
replace('G.adRevived=false;','');
replace('function useRunPower(id,fromReward=false){','function useRunPower(id){');
replace('if(!fromReward&&!SAVE.stock[id])','if(!SAVE.stock[id])');
replace('if(!fromReward)SAVE.stock[id]--;','SAVE.stock[id]--;');
replace('function drawWheelPrize(today=calendarDay(),random=rand,fromVideo=false){',
  'function drawWheelPrize(today=calendarDay(),random=rand){');
replace('dailyFree=!fromVideo&&today>p.freeSpinDay,free=fromVideo||dailyFree','dailyFree=today>p.freeSpinDay,free=dailyFree');

// The viewport may be shorter than the device screen inside the client.
replace('const iw = window.innerWidth ||', 'const iw = window.visualViewport?.width || window.innerWidth ||');
replace('ih = window.innerHeight ||', 'ih = window.visualViewport?.height || window.innerHeight ||');
replace('--safe-top:max(12px,env(safe-area-inset-top));',
  '--safe-top:max(12px,env(safe-area-inset-top,0px));');
replace('--safe-bottom:max(34px,calc(env(safe-area-inset-bottom) + 20px));',
  '--safe-bottom:max(34px,calc(env(safe-area-inset-bottom,0px) + 20px));');

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('缺少游戏脚本');
new (require('node:vm').Script)(script, { filename: 'bilibili/dist/index.html' });
const forbidden = /https?:\/\/|\b(?:webAuto|webFrenzyPilot|PLAYTEST_BUILD|TRIAL|SHARE_GAME_URL|grantReward|rewardAvailable|rewardedVideo|sharePlayerResult)\b/;
const stray = script.match(forbidden);
if (stray) throw new Error(`Toy 包含应移除的依赖或入口：${stray[0]}`);
if (Buffer.byteLength(html) > 1_000_000) throw new Error('Toy 的 index.html 超过 1 MB 限制');

mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'index.html'), html);
const zipName = 'spinning-knife-bilibili-toy.zip';
const archive = execFileSync('zip', ['-q', '-', 'index.html'], { cwd: output });
writeFileSync(join(__dirname, zipName), archive);
console.log(`已生成 bilibili/dist/index.html（${Buffer.byteLength(html)} 字节）及 bilibili/${zipName}`);
