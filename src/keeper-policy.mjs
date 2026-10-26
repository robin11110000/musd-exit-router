export function planAllocation({liquid,policy,lastAllocation,timestamp}) {
 if(!policy.active)return {amount:0n,reason:'Policy inactive'};
 if(timestamp>=BigInt(policy.expiresAt))return {amount:0n,reason:'Policy expired'};
 if(lastAllocation!==0n&&timestamp<lastAllocation+BigInt(policy.cooldown))return {amount:0n,reason:'Cooldown has not elapsed'};
 if(liquid<=policy.reserve)return {amount:0n,reason:'Liquid reserve has no surplus'};
 const amount=[liquid-policy.reserve,policy.maxPerAllocation,policy.remainingBudget].reduce((a,b)=>a<b?a:b);
 return {amount,reason:amount>0n?'Allocation permitted':'Allocation budget exhausted'};
}
