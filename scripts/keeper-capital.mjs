// One-shot keeper. Default is read-only simulation; --send explicitly enables a transaction.
import {readFile} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,getAddress,parseAbi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {planAllocation} from '../src/keeper-policy.mjs';

const artifact=JSON.parse(await readFile(new URL('../exports/WorkingCapitalVault.json',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../integrations/testnet/manifest.json',import.meta.url),'utf8'));
const evidence=JSON.parse(await readFile(new URL('../integrations/testnet/evidence.json',import.meta.url),'utf8'));
const sending=process.argv.includes('--send');
const address=getAddress(process.env.VAULT_ADDRESS??'');
let account;
if(sending){
 if(!process.env.KEEPER_PRIVATE_KEY)throw new Error('Set KEEPER_PRIVATE_KEY locally; never paste it into chat.');
 try { account=privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY); }
 catch { throw new Error('Invalid locally configured keeper key.'); }
}else account=getAddress(process.env.KEEPER_ADDRESS??'');
const keeper=typeof account==='string'?account:account.address;
const transport=http('https://rpc.test.mezo.org',{timeout:20000,retryCount:0});
const client=createPublicClient({transport});
if(await client.getChainId()!==31611)throw new Error('Mezo testnet required');
const blockNumber=await client.getBlockNumber(),block=await client.getBlock({blockNumber});
const code=await client.getCode({address,blockNumber});
if(!code)throw new Error('Vault does not exist');
let masked=code.slice(2).toLowerCase();
for(const refs of Object.values(artifact.immutableReferences))for(const {start,length} of refs)masked=masked.slice(0,start*2)+'0'.repeat(length*2)+masked.slice((start+length)*2);
if(masked!==artifact.runtimeTemplate.slice(2).toLowerCase())throw new Error('Vault bytecode does not match this build');
const read=(functionName,args=[])=>client.readContract({address,abi:artifact.abi,functionName,args,blockNumber});
const [snapshot,lastAllocation,owner,allowed,savings,initialStrategy,token]=await Promise.all([read('snapshot'),read('lastAllocation'),read('owner'),read('keepers',[keeper]),read('savings'),read('initialStrategy'),read('musd')]);
if(getAddress(savings)!==getAddress(manifest.contracts.savings.address)||getAddress(token)!==getAddress(manifest.contracts.musd.address))throw new Error('Vault targets unreviewed contracts');
const implementationSlot=await client.getStorageAt({address:savings,slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',blockNumber});
if(!implementationSlot||getAddress('0x'+implementationSlot.slice(-40))!==getAddress(manifest.contracts.savings.implementation))throw new Error('Savings implementation changed');
if(getAddress(owner)!==getAddress(keeper)&&!allowed)throw new Error('Keeper is not authorized by the owner');
const currentStrategy=await client.readContract({address:savings,abi:parseAbi(['function strategy() view returns(address)']),functionName:'strategy',blockNumber});
if(getAddress(currentStrategy)!==getAddress(initialStrategy))throw new Error('Savings strategy changed');
const reviewed=evidence.contracts.savings.calls['function strategy() view returns (address)'];
if(!reviewed?.ok||getAddress(currentStrategy)!==getAddress(reviewed.value))throw new Error('Strategy does not match reviewed evidence');
const plan=planAllocation({liquid:snapshot[0],policy:snapshot[2],lastAllocation,timestamp:block.timestamp});
const print=value=>console.log(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2));
if(plan.amount===0n){print({chainId:31611,blockNumber,mode:sending?'send':'simulate',...plan});process.exit(0);}
const {request}=await client.simulateContract({address,abi:artifact.abi,functionName:'allocate',args:[plan.amount],account:keeper});
if(!sending){print({chainId:31611,blockNumber,mode:'simulate',simulation:'passed',...plan});process.exit(0);}
const gasPrice=await client.getGasPrice();
const maxGasPrice=BigInt(process.env.MAX_GAS_PRICE_WEI??'10000000000');
if(gasPrice>maxGasPrice)throw new Error('Gas price exceeds configured ceiling');
const wallet=createWalletClient({account,transport});
const hash=await wallet.writeContract({...request,chain:{id:31611,name:'Mezo Testnet',nativeCurrency:{name:'BTC',symbol:'BTC',decimals:18},rpcUrls:{default:{http:['https://rpc.test.mezo.org']}}},account,gasPrice});
const receipt=await client.waitForTransactionReceipt({hash});
print({chainId:31611,hash,status:receipt.status,amount:plan.amount});
if(receipt.status!=='success')process.exitCode=1;
