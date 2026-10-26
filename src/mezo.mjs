import {createPublicClient,http,parseAbi,parseUnits,encodeFunctionData,decodeFunctionResult} from 'viem';
import {readFile} from 'node:fs/promises';
import {estimateRedemption,isFullInputComparable} from './quote-math.mjs';
export const ADDRESSES={
 musd:'0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',btc:'0x7b7C000000000000000000000000000000000000',
 manager:'0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',borrower:'0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
 hints:'0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6',pool:'0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9',
 clFactory:'0x7B61BC8Aa460476d142F1CD107A47297002f69ff',
};
const abi=parseAbi(['function priceFeed() view returns(address)','function fetchPrice() view returns(uint256)','function redemptionRate() view returns(uint256)','function getTCR(uint256) view returns(uint256)','function getAmountOut(uint256,address) view returns(uint256)','function getRedemptionHints(uint256,uint256,uint256) view returns(address,uint256,uint256)','function getPool(address,address,int24) view returns(address)']);
const client=createPublicClient({transport:http(process.env.MEZO_TESTNET_RPC_URL??'https://rpc.test.mezo.org',{timeout:15000,retryCount:0})});
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
 if(await client.getChainId()!==31611)throw new Error('Only Mezo testnet (31611) is allowed.');
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
   return {out:estimateRedemption(hints[2],price,fee),spent:hints[2],fullFill:isFullInputComparable(amount,hints[2],tcr),kind:'oracle estimate',eligibleForRanking:false,warning:'Testnet execution validation pending. Estimate excluded from ranking.',feeBps:Number(fee*10000n/10n**18n),hints};
  }),
 ]);
 const viable=routes.filter(r=>r.status==='quoted'&&r.fullFill&&r.out>0n&&r.eligibleForRanking!==false).sort((a,b)=>a.out>b.out?-1:a.out<b.out?1:0);
 return {chainId:31611,blockNumber,blockHash:block.hash,blockTimestamp:block.timestamp,amount,routes:routes.map(r=>({...r,refund:r.spent===undefined?null:amount-r.spent})),highestGrossRoute:viable[0]?.id??null,gasIncluded:false,executionEnabled:false};
}
