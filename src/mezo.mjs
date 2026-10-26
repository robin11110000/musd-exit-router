import {createPublicClient,http,parseAbi,parseUnits,encodeFunctionData,decodeFunctionResult} from 'viem';
import {readFile} from 'node:fs/promises';
import {estimateRedemption,isFullInputComparable} from './quote-math.mjs';
export const ADDRESSES={
 musd:'0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',btc:'0x7b7C000000000000000000000000000000000000',
 manager:'0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',borrower:'0x44b1bac67dDA612a41a58AAf779143B181dEe031',
 hints:'0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3',pool:'0x52e604c44417233b6CcEDDDc0d640A405Caacefb',
 clFactory:'0xBB24AF5c6fB88F1d191FA76055e30BF881BeEb79',
};
const abi=parseAbi(['function priceFeed() view returns(address)','function fetchPrice() view returns(uint256)','function redemptionRate() view returns(uint256)','function getTCR(uint256) view returns(uint256)','function getAmountOut(uint256,address) view returns(uint256)','function getRedemptionHints(uint256,uint256,uint256) view returns(address,uint256,uint256)','function getPool(address,address,int24) view returns(address)']);
const client=createPublicClient({transport:http(process.env.MEZO_RPC_URL??'https://mainnet.mezo.public.validationcloud.io',{timeout:15000,retryCount:0})});
let quoter;
async function getQuoter(){
 if(!quoter)quoter=readFile('artifacts/ReadOnlyCLQuoter.json','utf8').then(JSON.parse);
 return quoter;
}
export function validateAmount(text){
 if(typeof text!=='string'||!/^\d{1,7}(\.\d{1,6})?$/.test(text))throw new Error('Enter an MUSD amount with up to six decimal places.');
 const amount=parseUnits(text,18);
 if(amount<=0n||amount>parseUnits('1000000',18))throw new Error('Enter between 0 and 1,000,000 MUSD.');
 return amount;
}
export async function getQuotes(text){
 const amount=validateAmount(text);
 if(await client.getChainId()!==31612)throw new Error('RPC network mismatch.');
 const blockNumber=await client.getBlockNumber();
 const block=await client.getBlock({blockNumber});
 const read=(address,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber});
 const quote=async(id,name,fn)=>{try{return {id,name,status:'quoted',...await fn()};}catch{return {id,name,status:'unavailable',reason:'This route could not be quoted at this block.'};}};
 const routes=await Promise.all([
  quote('basic','Basic pool',async()=>({out:await read(ADDRESSES.pool,'getAmountOut',[amount,ADDRESSES.musd]),spent:amount,fullFill:true,kind:'pool quote'})),
  ...[200,2000].map(spacing=>quote(`cl-${spacing}`,`Concentrated pool · ${spacing}`,async()=>{
   const pool=await read(ADDRESSES.clFactory,'getPool',[ADDRESSES.btc,ADDRESSES.musd,spacing]);
   if(BigInt(pool)===0n)throw new Error('No pool');
   const q=await getQuoter();
   const fake='0x000000000000000000000000000000000000dEaD';
   const result=await client.call({to:fake,data:encodeFunctionData({abi:q.abi,functionName:'quote',args:[pool,false,amount]}),blockNumber,stateOverride:[{address:fake,code:'0x'+q.evm.deployedBytecode.object}]});
   const [out,spent]=decodeFunctionResult({abi:q.abi,functionName:'quote',data:result.data});
   return {out,spent,fullFill:spent===amount,kind:'swap simulation quote',pool};
  })),
  quote('redeem','Protocol redemption',async()=>{
   const feed=await read(ADDRESSES.manager,'priceFeed');
   const price=await read(feed,'fetchPrice');
   const [fee,tcr]=await Promise.all([read(ADDRESSES.borrower,'redemptionRate'),read(ADDRESSES.manager,'getTCR',[price])]);
   if(tcr<1_100_000_000_000_000_000n)throw new Error('Redemption disabled');
   const hints=await read(ADDRESSES.hints,'getRedemptionHints',[amount,price,50n]);
   return {out:estimateRedemption(hints[2],price,fee),spent:hints[2],fullFill:isFullInputComparable(amount,hints[2],tcr),kind:'oracle estimate',eligibleForRanking:false,warning:'Execution validation pending: a funded read-only simulation reverted in the core path. Estimate excluded from ranking.',feeBps:Number(fee*10000n/10n**18n),hints};
  }),
 ]);
 const viable=routes.filter(r=>r.status==='quoted'&&r.fullFill&&r.out>0n&&r.eligibleForRanking!==false).sort((a,b)=>a.out>b.out?-1:a.out<b.out?1:0);
 return {chainId:31612,blockNumber,blockHash:block.hash,blockTimestamp:block.timestamp,amount,routes:routes.map(r=>({...r,refund:r.spent===undefined?null:amount-r.spent})),highestGrossRoute:viable[0]?.id??null,gasIncluded:false,executionEnabled:false};
}
