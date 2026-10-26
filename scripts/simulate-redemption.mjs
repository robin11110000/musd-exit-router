throw new Error('Retired mainnet research script. Use npm run verify:testnet.');
import {createPublicClient,http,parseAbi,encodeAbiParameters,keccak256,toHex,encodeFunctionData,decodeFunctionResult,parseEther} from 'viem';
import {writeFile} from 'node:fs/promises';
import {compile} from './compile.mjs';
import {ADDRESSES as a} from '../src/mezo.mjs';
// Ephemeral eth_call fixtures only: balances, allowance and adapter code vanish at return.
const client=createPublicClient({transport:http(process.env.MEZO_RPC_URL??'https://mainnet.mezo.public.validationcloud.io',{timeout:20000,retryCount:0})});
if(await client.getChainId()!==31612)throw new Error('Wrong chain');
const blockNumber=await client.getBlockNumber();
const block=await client.getBlock({blockNumber});
const compiled=await compile();
const artifact=compiled['contracts/BoundedRedemptionRouter.sol'].BoundedRedemptionRouter;
let code=artifact.evm.deployedBytecode.object;
for(const [id,refs] of Object.entries(artifact.evm.deployedBytecode.immutableReferences)){
 const name=artifact.immutableNames[id];const address={musd:a.musd,troveManager:a.manager}[name];
 if(!address)throw new Error('Unknown immutable');
 for(const ref of refs){if(ref.length!==32)throw new Error('Unexpected immutable width');code=code.slice(0,ref.start*2)+address.slice(2).toLowerCase().padStart(64,'0')+code.slice((ref.start+ref.length)*2);}
}
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)']);
const coreAbi=parseAbi(['function priceFeed() view returns(address)','function fetchPrice() view returns(uint256)','function getRedemptionHints(uint256,uint256,uint256) view returns(address,uint256,uint256)','function findInsertPosition(uint256,address,address) view returns(address,address)']);
const read=(address,functionName,args)=>client.readContract({address,abi:coreAbi,functionName,args,blockNumber});
const mappingSlot=(key,slot)=>keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[key,BigInt(slot)]));
const actualPoolBalance=await client.readContract({address:a.musd,abi:tokenAbi,functionName:'balanceOf',args:[a.pool],blockNumber});
let balancesSlot;
for(let i=0;i<12;i++){
 const value=await client.getStorageAt({address:a.musd,slot:mappingSlot(a.pool,i),blockNumber});
 if(value&&BigInt(value)===actualPoolBalance&&actualPoolBalance>0n){balancesSlot=i;break;}
}
if(balancesSlot!==0)throw new Error('Token storage layout differs from expected verified ERC20 layout');
const payer='0x000000000000000000000000000000000000bEEF';
const router='0x000000000000000000000000000000000000dEaD';
const amount=parseEther('1000');
const ownerSlot=mappingSlot(payer,1);
const allowanceSlot=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes32'}],[router,ownerSlot]));
const stateOverride=[{address:router,code:'0x'+code},{address:a.musd,stateDiff:[{slot:mappingSlot(payer,0),value:toHex(amount,{size:32})},{slot:allowanceSlot,value:toHex(amount,{size:32})}]}];
const allowance=await client.readContract({address:a.musd,abi:tokenAbi,functionName:'allowance',args:[payer,router],blockNumber,stateOverride});
if(allowance!==amount)throw new Error('Allowance override verification failed');
const price=await read(await read(a.manager,'priceFeed',[]),'fetchPrice',[]);
const [firstHint,partialNICR,fill]=await read(a.hints,'getRedemptionHints',[amount,price,50n]);
const sorted='0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f';
const zero='0x0000000000000000000000000000000000000000';
const [upperHint,lowerHint]=partialNICR?await read(sorted,'findInsertPosition',[partialNICR,zero,zero]):[zero,zero];
const request={amount,minBtcOut:1n,minMusdRedeemed:fill,deadline:block.timestamp+60n,recipient:payer,firstHint,upperHint,lowerHint,partialNICR,maxIterations:50n};
let result;
try {
 result=await client.call({account:payer,to:router,data:encodeFunctionData({abi:artifact.abi,functionName:'redeem',args:[request]}),blockNumber,stateOverride});
}catch(error){
 const report={chainId:31612,blockNumber,status:'reverted',error:error.shortMessage??error.message,method:'eth_call with ephemeral adapter code, balance and allowance',request};
 const directAbi=parseAbi(['function redeemCollateral(uint256,address,address,address,uint256,uint256)']);
 try {
  await client.call({account:payer,to:a.manager,data:encodeFunctionData({abi:directAbi,functionName:'redeemCollateral',args:[amount,firstHint,upperHint,lowerHint,partialNICR,50n]}),blockNumber,stateOverride:[stateOverride[1]]});
  report.directCore='succeeded';
 }catch(e){report.directCore=e.shortMessage??e.message;}
 await writeFile('reports/redemption-simulation.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
 // Diagnostic trace, if the provider exposes it. Never send a transaction.
 try {
  const trace=await client.request({method:'debug_traceCall',params:[{from:payer,to:router,data:encodeFunctionData({abi:artifact.abi,functionName:'redeem',args:[request]})},toHex(blockNumber),{tracer:'callTracer',stateOverrides:Object.fromEntries(stateOverride.map(s=>[s.address,{...s,stateDiff:s.stateDiff?Object.fromEntries(s.stateDiff.map(x=>[x.slot,x.value])):undefined,address:undefined}]))}]});
  await writeFile('reports/redemption-trace.json',JSON.stringify(trace,null,2)+'\n');
  console.log('Diagnostic trace saved.');
 }catch(e){console.log('Trace unavailable:',e.shortMessage??e.message);}
 console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));process.exit(1);
}
const [btcOut,musdSpent,musdRefund]=decodeFunctionResult({abi:artifact.abi,functionName:'redeem',data:result.data});
// A deliberately impossible minimum must revert on the actual core path.
let outputGuardReverted=false;
try{await client.call({account:payer,to:router,data:encodeFunctionData({abi:artifact.abi,functionName:'redeem',args:[{...request,minBtcOut:parseEther('1000')}]}),blockNumber,stateOverride});}catch(e){outputGuardReverted=String(e).includes('OutputBelowMinimum')||String(e).includes('e83c3ef3');}
if(!outputGuardReverted)throw new Error('Could not verify output guard revert');
const report={chainId:31612,blockNumber,blockHash:block.hash,method:'eth_call with ephemeral balance, allowance and adapter code overrides; live Mezo core and native BTC transfer path',btcOut,musdSpent,musdRefund,outputGuardReverted,request,limitations:['No transaction broadcast or deployment.','Artificial caller funding and approval only exist inside eth_call.','Does not verify wallet signing or deployed adapter bytecode.','No transaction gas estimate yet.']};
const text=JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2);await writeFile('reports/redemption-simulation.json',text+'\n');console.log(text);
