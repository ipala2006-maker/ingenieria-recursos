const rules=require('../../shared/app-access');
const {userRpc}=require('./plan-access');

const accessMode=()=>process.env.APP_ACCESS_MODE==='restricted'?'restricted':'pilot';
async function accessForUser(authorization){
  if(accessMode()==='pilot')return rules.resolve();
  // No user ID, plan or role supplied by the browser is trusted here.
  const facts=await userRpc(authorization,'get_app_access',{});
  return rules.resolve({mode:'restricted',paidPro:facts?.paidPro===true,ownsClass:facts?.ownsClass===true});
}
module.exports={accessMode,accessForUser};
