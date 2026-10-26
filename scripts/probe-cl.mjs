import { createPublicClient, http, parseAbi } from 'viem';
import { writeFile } from 'node:fs/promises';
const client = createPublicClient({ transport: http(process.env.MEZO_RPC_URL ?? 'https://mainnet.mezo.public.validationcloud.io', { timeout: 15000, retryCount: 0 }) });
if (await client.getChainId() !== 31612) throw new Error('Wrong chain');
const blockNumber = await client.getBlockNumber();
const abi = parseAbi(['function getPool(address,address,int24) view returns (address)', 'function liquidity() view returns (uint128)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,bool)']);
const pools = [];
for (const spacing of [1,10,50,100,200,2000]) {
  try {
    const address = await client.readContract({address:'0xBB24AF5c6fB88F1d191FA76055e30BF881BeEb79',abi,functionName:'getPool',args:['0x7b7C000000000000000000000000000000000000','0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',spacing],blockNumber});
    const liquidity = BigInt(address) === 0n ? null : await client.readContract({address,abi,functionName:'liquidity',blockNumber});
    pools.push({spacing,address,liquidity});
  } catch(e) { pools.push({spacing,error:e.shortMessage ?? e.message}); }
}
const report = {chainId:31612,blockNumber,pools,limitation:'Discovery only. Active liquidity is not an executable quote. CL routing remains unavailable until verified quote and execution integration.'};
const text = JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2);
await writeFile('reports/cl-probe.json',text+'\n');console.log(text);
