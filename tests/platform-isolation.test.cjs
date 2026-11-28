'use strict';
const assert = require('node:assert/strict');
const {readdirSync, readFileSync} = require('node:fs');
const {resolve, join} = require('node:path');
const {test} = require('node:test');
const {execFileSync} = require('node:child_process');
const root=resolve(__dirname,'..');
const webOnly=/\b(?:webAuto|webFrenzyPilot|courseInputs|advanceWebCourse|PLAYTEST_BUILD|trialGesture|unlockTrial|toggleTrial|renderTrialPin)\b|自动玩|trialUnlock/;

test('微信发布包不包含网页自动玩和隐藏试玩入口',()=>{
  function check(directory){
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const file=join(directory,entry.name);
      if(entry.isDirectory())check(file);
      else if(/\.(js|json|wxml|html)$/i.test(entry.name)){
        assert.doesNotMatch(readFileSync(file,'utf8'),webOnly,file);
      }
    }
  }
  check(join(root,'wechat','game'));
});

test('B站上传包只有自包含页面，无隐藏试玩、自动玩、分享链接或广告入口',()=>{
  const folder=join(root,'bilibili');
  const archive=join(folder,'spinning-knife-bilibili-toy.zip');
  execFileSync(process.execPath,[join(folder,'build.cjs')]);
  assert.equal(execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim(),'index.html');
  const html=execFileSync('unzip',['-p',archive,'index.html'],{encoding:'utf8'});
  assert.doesNotMatch(html,webOnly);
  assert.doesNotMatch(html,/https?:\/\/|\b(?:grantReward|rewardAvailable|rewardedVideo|sharePlayerResult)\b/);
  assert.match(html,/const NUM_LEVELS = 60;/);
});
