// Fixed-network, read-only deployment preflight. Never signs or sends transactions.
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseAbi,keccak256,getAddress} from 'viem';

const base=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('integrations/testnet/manifest.json',base),'utf8'));
const evidence=JSON.parse(await readFile(new URL('integrations/testnet/evidence.json',base),'utf8'));
const reviewedStrategy=evidence.contracts.savings.calls['function strategy() view returns (address)'];
if(!reviewedStrategy?.ok)throw new Error('Missing reviewed strategy evidence');
const client=createPublicClient({transport:http('https://rpc.test.mezo.org',{timeout:15000,retryCount:0})});
if(await client.getChainId()!==31611)throw new Error('Mezo testnet required');
const blockNumber=await client.getBlockNumber();
const abi=parseAbi(['function musdToken() view returns(address)','function strategy() view returns(address)','function pcv() view returns(address)','function vaultGauge() view returns(address)']);
const savings=getAddress(manifest.contracts.savings.address);
const implSlot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const [block,storage,code,token,strategy,pcv,gauge]=await Promise.all([
 client.getBlock({blockNumber}),
 client.getStorageAt({address:savings,slot:implSlot,blockNumber}),
 client.getCode({address:savings,blockNumber}),
 ...['musdToken','strategy','pcv','vaultGauge'].map(functionName=>client.readContract({address:savings,abi,functionName,blockNumber}))
]);
if(!storage||!code||code==='0x')throw new Error('Missing savings proxy');
const implementation=getAddress('0x'+storage.slice(-40));
const matches=implementation.toLowerCase()===manifest.contracts.savings.implementation.toLowerCase() && token.toLowerCase()===manifest.contracts.musd.address.toLowerCase() && strategy.toLowerCase()===reviewedStrategy.value.toLowerCase();
const strategyCode=await client.getCode({address:strategy,blockNumber});
const report={chainId:31611,blockNumber,blockHash:block.hash,savings,implementation,musd:token,strategy,pcv,gauge,proxyCodeHash:keccak256(code),strategyCodeHash:strategyCode&&strategyCode!=='0x'?keccak256(strategyCode):null,matchesReviewedConfiguration:matches,fundedExecutionVerified:false,allocationReady:false,reason:'Underlying strategy source and funded deposit/withdraw lifecycle remain unverified.'};
await writeFile(new URL('exports/testnet-preflight.json',base),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
if(!matches||!strategyCode||strategyCode==='0x')process.exitCode=1;
