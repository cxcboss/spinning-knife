'use strict';

const {createHash}=require('node:crypto');
const members='friend_invitation_members';
const grants='friend_invitation_grants';
const rewardCoins=60,maxFriends=5;
const minimumRunMs=44000,expiresMs=7*24*60*60*1000;
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,32);
const isCode=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const memberKey=openid=>digest('friend-invite:'+openid);
const fresh=()=>({earned:0,claimed:0,opened:0});
const error=code=>({ok:false,code});

function createInvitationService({read,write},now=Date.now){
  return async function invitation(openid,request={}){
    const {action,invite,device,priorPlay,slices}=request;
    if(!['status','observe','arrive','begin','complete','claim'].includes(action))return error('invalid');
    if((action==='status'||action==='claim')&&!isCode(device))return error('invalid');
    if((action==='arrive'||action==='begin')&&!isCode(invite))return error('invalid');
    const id=memberKey(openid);
    let member=await read(members,id);
    if(action==='observe'){
      if(!member)await write(members,id,fresh());
      return {ok:true};
    }

    if(action==='arrive'||action==='begin'){
      if(invite===id)return error('self');
      const accepted=member?.accepted;
      if(accepted?.inviter===invite){
        if(action==='arrive')return {ok:true};
        if(accepted.done)return error('existing');
        if(accepted.startedAt!=null&&now()-accepted.startedAt>expiresMs)return error('expired');
        if(accepted.startedAt==null)await write(members,id,{...member,accepted:{...accepted,startedAt:now()}});
        return {ok:true};
      }
      if(member||priorPlay!==false)return error('existing');
      const inviter=await read(members,invite);
      if(!inviter)return error('invalid');
      const opened=inviter.opened||0;
      if(opened<maxFriends)await write(members,invite,{...inviter,opened:opened+1});
      await write(members,id,{...fresh(),accepted:{inviter:invite,startedAt:action==='begin'?now():null,done:false}});
      return {ok:true};
    }

    if(action==='complete'){
      const accepted=member?.accepted;
      if(!accepted)return error('invalid');
      if(accepted.done)return {ok:true};
      if(accepted.startedAt==null)return error('unfinished');
      const elapsed=now()-accepted.startedAt;
      if(elapsed>expiresMs)return error('expired');
      if(elapsed<minimumRunMs||!Number.isSafeInteger(slices)||slices<1)return error('unfinished');
      const inviter=await read(members,accepted.inviter);
      if(!inviter)return error('invalid');
      if(inviter.earned<maxFriends)await write(members,accepted.inviter,{...inviter,earned:inviter.earned+1});
      await write(members,id,{...member,accepted:{...accepted,done:true}});
      return {ok:true};
    }

    const grantId=digest(id+':'+device);
    const grant=await read(grants,grantId);
    if(!member){
      member=fresh();
      await write(members,id,member);
    }
    let total=grant?.total||0;
    if(action==='claim'&&member.earned>member.claimed){
      total+=(member.earned-member.claimed)*rewardCoins;
      member={...member,claimed:member.earned};
      await write(members,id,member);
      await write(grants,grantId,{total});
    }
    return {ok:true,invite:id,total,opened:member.opened||0,earned:member.earned,available:member.earned-member.claimed,rewardCoins,maxFriends};
  };
}

module.exports={createInvitationService};
