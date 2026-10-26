// Live TESTNET eth_call: ephemeral funding/code only, no signing or transactions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import solc from 'solc';
import {createPublicClient,http,parseAbi,encodeAbiParameters,encodeFunctionData,decodeFunctionResult,keccak256,toHex,parseEther} from 'viem';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,'integrations/testnet/manifest.json'),'utf8'));
const musd=manifest.contracts.musd.address,savings=manifest.contracts.savings.address;
const probe='0x000000000000000000000000000000000000dEaD';
const amount=parseEther('100');
const helper=`pragma solidity 0.8.30;
import {WorkingCapitalVault} from "src/WorkingCapitalVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
contract CapitalProbe {
 error StageFailed(uint8 stage,bytes reason);
 function run() external returns(uint256 liquidAfterDeposit,uint256 principalAfterDeposit,uint256 returnedMusd,uint256 finalPrincipal){
  IERC20 token=IERC20(${musd});
  WorkingCapitalVault vault=new WorkingCapitalVault(${musd},${savings},address(this));
  token.approve(address(vault),100 ether);
  try vault.fund(100 ether) {} catch(bytes memory reason){revert StageFailed(1,reason);}
  vault.setPolicy(WorkingCapitalVault.Policy(40 ether,60 ether,60 ether,0,uint64(block.timestamp+3600),true));
  try vault.allocate(60 ether) {} catch(bytes memory reason){revert StageFailed(2,reason);}
  (liquidAfterDeposit,principalAfterDeposit,)=vault.snapshot();
  vault.revoke();
  try vault.withdrawSavings(60 ether,60 ether) {} catch(bytes memory reason){revert StageFailed(3,reason);}
  (returnedMusd,finalPrincipal,)=vault.snapshot();
  try vault.withdraw(returnedMusd) {} catch(bytes memory reason){revert StageFailed(4,reason);}
  require(token.balanceOf(address(this))>=100 ether,"Principal not restored");
 }
}`;
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'CapitalProbe.sol':{content:helper}},settings:{optimizer:{enabled:true,runs:1000},evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}}),{import:path=>{
 try{return {contents:readFileSync(resolve(root,path.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/')),'utf8')};}catch{return {error:'Missing '+path};}
}}));
const errors=(output.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
const artifact=output.contracts['CapitalProbe.sol'].CapitalProbe;
const client=createPublicClient({transport:http('https://rpc.test.mezo.org',{timeout:45000,retryCount:0})});
if(await client.getChainId()!==31611)throw new Error('Mezo testnet required');
const blockNumber=await client.getBlockNumber(),block=await client.getBlock({blockNumber});
const abi=parseAbi(['function balanceOf(address) view returns(uint256)']);
const slot=owner=>keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[owner,0n]));
const holder='0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9';
const [balance,stored]=await Promise.all([client.readContract({address:musd,abi,functionName:'balanceOf',args:[holder],blockNumber}),client.getStorageAt({address:musd,slot:slot(holder),blockNumber})]);
if(balance===0n||!stored||BigInt(stored)!==balance)throw new Error('MUSD balance storage layout not confirmed');
const stateOverride=[{address:probe,code:'0x'+artifact.evm.deployedBytecode.object},{address:musd,stateDiff:[{slot:slot(probe),value:toHex(amount,{size:32})}]}];
if(await client.readContract({address:musd,abi,functionName:'balanceOf',args:[probe],blockNumber,stateOverride})!==amount)throw new Error('Ephemeral funding verification failed');
const report={chainId:31611,blockNumber,blockHash:block.hash,savings,method:'eth_call with ephemeral helper code and 100 MUSD balance override; live savings and strategy',broadcast:false,status:'pending',limitations:['No deployed application contract or mined transaction.','Artificial funding exists only inside eth_call.','Does not prove future liquidity or earnings; strategy remains unverified.']};
try{
 const result=await client.call({to:probe,data:encodeFunctionData({abi:artifact.abi,functionName:'run'}),blockNumber,stateOverride,gas:15000000n});
 const [liquidAfterDeposit,principalAfterDeposit,returnedMusd,finalPrincipal]=decodeFunctionResult({abi:artifact.abi,functionName:'run',data:result.data});
 if(liquidAfterDeposit!==parseEther('40')||principalAfterDeposit!==parseEther('60')||returnedMusd<amount||finalPrincipal!==0n)throw new Error('Unexpected lifecycle accounting');
 Object.assign(report,{status:'simulated-success',liquidAfterDeposit,principalAfterDeposit,returnedMusd,finalPrincipal});
}catch(error){Object.assign(report,{status:'reverted',error:error.shortMessage??error.message});process.exitCode=1;}
await mkdir(resolve(root,'exports'),{recursive:true});
const json=JSON.stringify(report,(_,value)=>typeof value==='bigint'?value.toString():value,2);
await writeFile(resolve(root,'exports/testnet-lifecycle-simulation.json'),json+'\n');console.log(json);
await writeFile(resolve(root,'ui/src/lib/testnet-lifecycle.json'),json+'\n');
