'use strict';
const cloud=require('wx-server-sdk');
const {createInvitationService}=require('./service');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
const appId='wx3549cc0b0a3d781b';

exports.main=async event=>{
  const caller=cloud.getWXContext();
  if(caller.APPID!==appId||!caller.OPENID)return {ok:false,code:'unauthorized'};
  const result=await db.runTransaction(async tx=>{
    const service=createInvitationService({
      async read(collection,id){
        const result=await tx.collection(collection).doc(id).get();
        return result.data||null;
      },
      async write(collection,id,data){
        const {_id,...fields}=data;
        await tx.collection(collection).doc(id).set({data:fields});
      }
    });
    return service(caller.OPENID,event);
  });
  return result;
};
