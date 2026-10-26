import { createPublicClient,http,parseAbi,parseUnits,encodeFunctionData,decodeFunctionResult,formatUnits } from 'viem';
import {readFile,writeFile} from 'node:fs/promises';
import {compile} from './compile.mjs';
const contracts = await compile({'quoter.sol':{content:await readFile('contracts/ReadOnlyCLQuoter.sol','utf8')}});
const code = '0x'+contracts['quoter.sol'].ReadOnlyCLQuoter.evm.deployedBytecode.object;
const abi = contracts['quoter.sol'].ReadOnlyCLQuoter.abi;
const client=createPublicClient({transport:http(process.env.MEZO_RPC_URL??'https://mainnet.mezo.public.validationcloud.io',{timeout:20000,retryCount:0})});
if(await client.getChainId()!==31612)throw new Error('Wrong chain');
const blockNumber=await client.getBlockNumber();
const fake='0x000000000000000000000000000000000000dEaD';
const factory='0xBB24AF5c6fB88F1d191FA76055e30BF881BeEb79';
const musd='0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186';
const btc='0x7b7C000000000000000000000000000000000000';
const factoryAbi=parseAbi(['function getPool(address,address,int24) view returns(address)']);
const rows=[];
for(const spacing of [200,2000]){
  const pool=await client.readContract({address:factory,abi:factoryAbi,functionName:'getPool',args:[btc,musd,spacing],blockNumber});
  for(const amount of ['100','1000','10000','50000']){
    try{
      const {data}=await client.call({to:fake,data:encodeFunctionData({abi,functionName:'quote',args:[pool,false,parseUnits(amount,18)]}),blockNumber,stateOverride:[{address:fake,code}]});
      const [output,spent]=decodeFunctionResult({abi,functionName:'quote',data});
      rows.push({spacing,pool,inputMusd:amount,spentMusd:formatUnits(spent,18),outputBtc:formatUnits(output,18),fullFill:spent===parseUnits(amount,18)});
    }catch(e){rows.push({spacing,pool,inputMusd:amount,error:e.shortMessage??e.message});}
  }
}
const report={chainId:31612,blockNumber,method:'eth_call with ephemeral quoter code state override; callback reverts before payment',limitation:'Research quote only. Does not validate user allowance, final router execution, gas-adjusted ranking, or full input consumption at a price boundary.',rows};
const text=JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2);
await writeFile('reports/cl-quotes.json',text+'\n');console.log(text);
if(rows.some(x=>x.error))process.exitCode=1;
