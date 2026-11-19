import { DurableObject } from 'cloudflare:workers';
import reportPage from './report.html';

const origin = 'https://cxcboss.github.io';
const day = 86400000;
const enums = {
  platform: ['android','ios','desktop','mobile'],
  state: ['playing','away','left','failed','won'],
  entry: ['play','retry','next','choose','gear'],
  reason: ['none','slip','spike','void','other'],
  kind: ['buy','short','daily','power','ad_off','revive'],
  gear: ['chef','santoku','cleaver','bread','katana','ice','gold','rainbow','obsidian','neon','comet','willow','carrot','popsicle','banana','fish','watermelon','rocket','star'],
  supply: ['steady','feather','gild','goldrush','triple','rain']
};
const integer = (v,max) => Number.isInteger(v) && v>=0 && v<=max;
const inside = (v,list) => list.includes(v);
function clean(e) {
  if(!e || typeof e!=='object'||!/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(e.id)||!integer(e.rev,100000)||!e.rev||!inside(e.platform,enums.platform)||e.build!=='p1')return null;
  const base={id:e.id,rev:e.rev,platform:e.platform,build:'p1',type:e.type};
  if(e.type==='action'){
    const items=[...enums.gear,...enums.supply,'daily','double','revive','supply','run'];
    return inside(e.kind,enums.kind)&&inside(e.item,items)?{...base,kind:e.kind,item:e.item}:null;
  }
  if(e.type!=='run'||!inside(e.state,enums.state)||!inside(e.entry,enums.entry)||!inside(e.gear,enums.gear)||!inside(e.reason,enums.reason)||!inside(e.reason2,enums.reason))return null;
  const run={...base,state:e.state,entry:e.entry,gear:e.gear,reason:e.reason,reason2:e.reason2};
  const fields={level:30,seconds:86400,hops:100000,cuts:10000,coins:100000000,progress:100,deaths:2,revived:1,pad:100,pad2:100,mult:100,frames:10000000,frameMs:86400000,slow:10000000};
  for(const [key,max] of Object.entries(fields)){
    if(!integer(e[key],max))return null;
    run[key]=e[key];
  }
  if(!run.level||run.slow>run.frames||run.revived>run.deaths)return null;
  return run;
}
export class PlaytestStore extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);this.db=ctx.storage.sql;
    this.db.exec('CREATE TABLE IF NOT EXISTS samples (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, created INTEGER NOT NULL, body TEXT NOT NULL)');
    this.db.exec('CREATE INDEX IF NOT EXISTS by_day ON samples(created)');
  }
  async accept(records){
    const now=Date.now();
    this.ctx.storage.transactionSync(()=>{
      for(const e of records)this.db.exec('INSERT INTO samples VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET rev=excluded.rev,body=excluded.body WHERE excluded.rev>samples.rev',e.id,e.rev,now,JSON.stringify(e));
    });
    if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(now+day);
  }
  async alarm(){
    this.db.exec('DELETE FROM samples WHERE created<?',Date.now()-30*day);
    if(this.db.exec('SELECT 1 FROM samples LIMIT 1').toArray().length)await this.ctx.storage.setAlarm(Date.now()+day);
  }
  async report(days,device){
    const start=Date.now()-days*day;
    const group=(sql,params=[])=>this.db.exec(`WITH data AS (SELECT body FROM samples WHERE created>=? AND (?='all' OR body->>'platform'=?)) ${sql}`,start,device,device,...params).toArray();
    const runs="FROM data WHERE body->>'type'='run'";
    const counts=`count(*) AS starts,sum((body->>'hops')>0) AS launched, sum((body->>'state')='won') AS wins,sum((body->>'deaths')>0) AS firstFails,sum(body->>'revived') AS revives,sum((body->>'revived')=1 AND (body->>'state')='won') AS rescued,sum((body->>'entry') IN ('retry','gear')) AS retries,round(avg(body->>'seconds')) AS seconds,round(avg(CASE WHEN (body->>'state') IN ('left','away') THEN body->>'progress' END)) AS exitProgress,round(avg(CASE WHEN (body->>'state')='won' THEN body->>'coins' END)) AS income`;
    const levels=group(`SELECT body->>'level' level,${counts} ${runs} GROUP BY level ORDER BY level`);
    const failures=group(`SELECT level,pad,reason,count(*) AS n FROM (
      SELECT body->>'level' level,body->>'pad' pad,body->>'reason' reason ${runs} AND body->>'deaths'>0 UNION ALL
      SELECT body->>'level',body->>'pad2',body->>'reason2' ${runs} AND body->>'deaths'>1) GROUP BY level,pad,reason ORDER BY n DESC,level,pad LIMIT 12`);
    const performance=group(`SELECT body->>'platform' platform,count(*) n,round(1000.0*sum(body->>'frames')/sum(body->>'frameMs'),1) fps,
      round(100.0*sum(body->>'slow')/sum(body->>'frames'),1) slow ${runs} AND body->>'frames'>=60 AND body->>'frameMs'>0 GROUP BY platform`);
    const actions=group("SELECT body->>'kind' kind,body->>'item' item,count(*) n FROM data WHERE body->>'type'='action' GROUP BY kind,item ORDER BY n DESC LIMIT 60");
    const equipment=group(`SELECT body->>'gear' gear,count(*) n,round(avg(body->>'cuts'),1) cuts ${runs} GROUP BY gear ORDER BY n DESC`);
    return {levels,failures,performance,actions,equipment};
  }
}
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export default {
  async fetch(req,env){
    const u=new URL(req.url),test=u.searchParams.get('qa')==='1';
    const store=()=>env.STORE.getByName(test?'release-check':'public-p1');
    if(req.method==='GET'&&u.pathname==='/report')return new Response(reportPage,{headers:{...headers,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
    if(req.method==='GET'&&u.pathname==='/summary'){
      if(!env.REPORT_KEY||req.headers.get('Authorization')!=='Bearer '+env.REPORT_KEY)return new Response(null,{status:401,headers});
      const days=Number(u.searchParams.get('days')),device=u.searchParams.get('device');
      return Response.json(await store().report([1,7,30].includes(days)?days:7,enums.platform.includes(device)?device:'all'),{headers});
    }
    if(req.method!=='POST'||u.pathname!=='/collect')return new Response(null,{status:404});
    if(req.headers.get('Origin')!==origin)return new Response(null,{status:403});
    const cors={...headers,'Access-Control-Allow-Origin':origin,Vary:'Origin'};
    if(!/^text\/plain(?:;|$)/i.test(req.headers.get('Content-Type')||'')||Number(req.headers.get('Content-Length'))>16384)return new Response(null,{status:400,headers:cors});
    const reader=req.body?.getReader();if(!reader)return new Response(null,{status:400,headers:cors});
    let size=0,payload='';const decoder=new TextDecoder();
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return new Response(null,{status:413,headers:cors});}payload+=decoder.decode(value,{stream:true});}
    let batch;try{batch=JSON.parse(payload+decoder.decode());}catch{}
    if(!Array.isArray(batch)||!batch.length||batch.length>12)return new Response(null,{status:400,headers:cors});
    const data=batch.map(clean);if(data.includes(null))return new Response(null,{status:400,headers:cors});
    await store().accept(data);return new Response(null,{status:204,headers:cors});
  }
};
