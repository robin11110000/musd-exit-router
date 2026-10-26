import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

test('only the balance owner can move funds into the aggregator',async t=>{
 const source='src/VaultManager.sol';
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[source]:{content:readFileSync(source,'utf8')},'Token.sol':{content:'pragma solidity 0.8.30; import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";'}},settings:{optimizer:{enabled:true,runs:1000},evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:path=>{
  try{return {contents:readFileSync(path.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/'),'utf8')};}catch{return {error:'Missing dependency: '+path};}
 }}));
 const errors=output.errors?.filter(e=>e.severity==='error')??[];
 assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'london'}});t.after(()=>provider.disconnect());
 const entries=Object.entries(provider.getInitialAccounts());
 const account=privateKeyToAccount(entries[0][1].secretKey);
 const attacker=privateKeyToAccount(entries[1][1].secretKey);
 const transport=custom(provider),publicClient=createPublicClient({transport}),wallet=createWalletClient({transport,account});
 const mined=hash=>publicClient.waitForTransactionReceipt({hash});
 const deploy=async(artifact,args=[])=> (await mined(await wallet.deployContract({chain:null,abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,args}))).contractAddress;
 const send=(address,artifact,functionName,args,signer=account)=>wallet.writeContract({chain:null,account:signer,address,abi:artifact.abi,functionName,args,gas:800000n}).then(mined);
 const read=(address,artifact,functionName,args)=>publicClient.readContract({address,abi:artifact.abi,functionName,args});
 const tokenArtifact=output.contracts['@openzeppelin/contracts/mocks/token/ERC20Mock.sol'].ERC20Mock;
 const vaultArtifact=output.contracts[source].VaultManager;
 const aggArtifact=output.contracts['src/YieldAggregator.sol'].YieldAggregator;
 const token=await deploy(tokenArtifact);
 const vault=await deploy(vaultArtifact,[token,entries[2][0],account.address]);
 const agg=await deploy(aggArtifact,[token,account.address]);
 await send(token,tokenArtifact,'mint',[account.address,parseEther('100')]);
 await send(token,tokenArtifact,'approve',[vault,parseEther('100')]);
 await send(vault,vaultArtifact,'fund',[parseEther('100')]);
 await send(vault,vaultArtifact,'setAggregator',[agg]);
 await send(agg,aggArtifact,'setNotifier',[vault,true]);
 const unauthorized=await send(vault,vaultArtifact,'autoDeposit',[account.address,parseEther('25')],attacker);
 assert.equal(unauthorized.status,'reverted','An unrelated caller must not choose when another user enters an aggregator');
 assert.equal(await read(vault,vaultArtifact,'balances',[account.address]),parseEther('100'));
 const authorized=await send(vault,vaultArtifact,'autoDeposit',[account.address,parseEther('25')]);
 assert.equal(authorized.status,'success');
 assert.equal(await read(vault,vaultArtifact,'balances',[account.address]),parseEther('75'));
 assert.equal(await read(agg,aggArtifact,'balances',[account.address]),parseEther('25'));
 assert.equal((await send(agg,aggArtifact,'withdraw',[parseEther('25')])).status,'success');
 assert.equal(await read(token,tokenArtifact,'balanceOf',[account.address]),parseEther('25'));
});
