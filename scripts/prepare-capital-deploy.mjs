import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,getAddress,encodeDeployData,parseAbi,toHex} from 'viem';
const owner=getAddress(process.argv[2]??'');
const base=new URL('../',import.meta.url);
const artifact=JSON.parse(await readFile(new URL('exports/WorkingCapitalVault.json',base),'utf8'));
const manifest=JSON.parse(await readFile(new URL('integrations/testnet/manifest.json',base),'utf8'));
const client=createPublicClient({transport:http('https://rpc.test.mezo.org',{timeout:20000,retryCount:0})});
if(await client.getChainId()!==31611)throw new Error('Mezo testnet required');
const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode,args:[manifest.contracts.musd.address,manifest.contracts.savings.address,owner]});
const blockNumber=await client.getBlockNumber();
const [nativeBalance,musdBalance,gasPrice]=await Promise.all([
 client.getBalance({address:owner,blockNumber}),
 client.readContract({address:manifest.contracts.musd.address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[owner],blockNumber}),
 client.getGasPrice()
]);
const report={chainId:31611,owner,blockNumber,nativeBalance,musdBalance,gasPrice,signatureRequired:true,broadcast:false,transaction:{from:owner,chainId:toHex(31611),value:'0x0',data}};
try{report.estimatedGas=await client.estimateGas({account:owner,data});report.estimatedGasCost=report.estimatedGas*gasPrice;report.hasEstimatedGasFunds=nativeBalance>=report.estimatedGasCost;}catch(e){report.estimateError=e.shortMessage??e.message;}
await writeFile(new URL('exports/deployment-request.json',base),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
const {transaction,...summary}=report;console.log(JSON.stringify(summary,(_,v)=>typeof v==='bigint'?v.toString():v,2));
