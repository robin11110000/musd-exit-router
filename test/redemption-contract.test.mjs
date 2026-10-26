import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEther,zeroAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {compile} from '../scripts/compile.mjs';

const mocks=`// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
contract Token {
 mapping(address=>uint256) public balanceOf;
 mapping(address=>mapping(address=>uint256)) public allowance;
 function mint(address who,uint256 amount) external {balanceOf[who]+=amount;}
 function burn(address who,uint256 amount) external {balanceOf[who]-=amount;}
 function approve(address who,uint256 amount) external returns(bool){allowance[msg.sender][who]=amount;return true;}
 function transfer(address to,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[to]+=n;return true;}
 function transferFrom(address from,address to,uint256 n) external returns(bool){allowance[from][msg.sender]-=n;balanceOf[from]-=n;balanceOf[to]+=n;return true;}
}
contract Manager {
 Token token; uint256 public fill; uint256 public output;
 constructor(address t){token=Token(t);}
 function set(uint256 f,uint256 o) external {fill=f;output=o;}
 function redeemCollateral(uint256,address,address,address,uint256,uint256) external {
  token.burn(msg.sender,fill);(bool ok,)=msg.sender.call{value:output}("");require(ok);
 }
 receive() external payable {}
}
contract Reject {receive() external payable {revert();}}
contract Reenter {
 address public target; bytes public data; bool public attempted; bool public succeeded;
 function set(address t,bytes calldata d) external {target=t;data=d;}
 receive() external payable {attempted=true;(succeeded,)=target.call(data);}
}`;

test('bounded redemption transaction invariants on a local EVM',async t=>{
 const contracts=await compile({'mocks.sol':{content:mocks}});
 const provider=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:3},chain:{hardfork:'london'}});
 t.after(()=>provider.disconnect());
 const transport=custom(provider);
 const publicClient=createPublicClient({transport});
 const entries=Object.entries(provider.getInitialAccounts());
 const localAccount=privateKeyToAccount(entries[0][1].secretKey);
 const payer=localAccount.address;
 const recipient=entries[1][0];
 const wallet=createWalletClient({transport,account:localAccount});
 const receipt=hash=>publicClient.waitForTransactionReceipt({hash});
 const deploy=async(artifact,args=[])=>{
  const tx=await wallet.deployContract({account:localAccount,chain:null,abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,args});
  return (await receipt(tx)).contractAddress;
 };
 const tokenArtifact=contracts['mocks.sol'].Token;
 const managerArtifact=contracts['mocks.sol'].Manager;
 const routerArtifact=contracts['contracts/BoundedRedemptionRouter.sol'].BoundedRedemptionRouter;
 const token=await deploy(tokenArtifact);
 const manager=await deploy(managerArtifact,[token]);
 const router=await deploy(routerArtifact,[token,manager]);
 const write=async(address,abi,functionName,args)=>receipt(await wallet.writeContract({account:localAccount,chain:null,address,abi,functionName,args,gas:1_000_000n}));
 const read=(address,abi,functionName,args=[])=>publicClient.readContract({address,abi,functionName,args});
 await receipt(await wallet.sendTransaction({account:localAccount,chain:null,to:manager,value:parseEther('10')}));
 await write(token,tokenArtifact.abi,'mint',[payer,parseEther('1000')]);
 await write(token,tokenArtifact.abi,'mint',[router,parseEther('7')]);
 await write(token,tokenArtifact.abi,'approve',[router,parseEther('1000')]);
 // Pre-existing native dust must remain separate from transaction outputs.
 await receipt(await wallet.sendTransaction({account:localAccount,chain:null,to:router,value:parseEther('0.2')}));
 const now=(await publicClient.getBlock()).timestamp;
 const base={amount:parseEther('100'),minBtcOut:parseEther('0.001'),minMusdRedeemed:parseEther('60'),deadline:now+3600n,recipient,firstHint:zeroAddress,upperHint:zeroAddress,lowerHint:zeroAddress,partialNICR:0n,maxIterations:50n};
 const execute=r=>write(router,routerArtifact.abi,'redeem',[r]);
 const tokenBalance=who=>read(token,tokenArtifact.abi,'balanceOf',[who]);

 await t.test('partial fill refunds payer and sends BTC to chosen recipient without dust leakage',async()=>{
  await write(manager,managerArtifact.abi,'set',[parseEther('60'),parseEther('0.001')]);
  const payerBefore=await tokenBalance(payer);
  const recipientBefore=await publicClient.getBalance({address:recipient});
  assert.equal((await execute(base)).status,'success');
  assert.equal(payerBefore-await tokenBalance(payer),parseEther('60'));
  assert.equal(await tokenBalance(recipient),0n);
  assert.equal(await tokenBalance(router),parseEther('7'));
  assert.equal(await publicClient.getBalance({address:router}),parseEther('0.2'));
  assert.equal(await publicClient.getBalance({address:recipient})-recipientBefore,parseEther('0.001'));
 });
 await t.test('minimum BTC failure reverts the burn, transfer, and allowance spend',async()=>{
  const before=await tokenBalance(payer);
  const allowance=await read(token,tokenArtifact.abi,'allowance',[payer,router]);
  assert.equal((await execute({...base,minBtcOut:parseEther('0.002')})).status,'reverted');
  assert.equal(await tokenBalance(payer),before);
  assert.equal(await read(token,tokenArtifact.abi,'allowance',[payer,router]),allowance);
 });
 await t.test('minimum fill rejects unexpectedly small redemptions',async()=>{
  assert.equal((await execute({...base,minMusdRedeemed:parseEther('61')})).status,'reverted');
 });
 await t.test('expired request cannot spend funds',async()=>{
  assert.equal((await execute({...base,deadline:now-1n})).status,'reverted');
 });
 await t.test('uncapped traversal and zero safety bounds are rejected',async()=>{
  for(const overrides of [{maxIterations:0n},{maxIterations:101n},{minBtcOut:0n},{minMusdRedeemed:0n},{recipient:router}]){
   assert.equal((await execute({...base,...overrides})).status,'reverted');
  }
 });
 await t.test('recipient rejection rolls back all input accounting',async()=>{
  const reject=await deploy(contracts['mocks.sol'].Reject);
  const before=await tokenBalance(payer);
  assert.equal((await execute({...base,recipient:reject})).status,'reverted');
  assert.equal(await tokenBalance(payer),before);
 });
 await t.test('recipient callback cannot reenter redemption',async()=>{
  const receiver=await deploy(contracts['mocks.sol'].Reenter);
  const {encodeFunctionData}=await import('viem');
  await write(receiver,contracts['mocks.sol'].Reenter.abi,'set',[router,encodeFunctionData({abi:routerArtifact.abi,functionName:'redeem',args:[base]})]);
  assert.equal((await execute({...base,recipient:receiver})).status,'success');
  assert.equal(await read(receiver,contracts['mocks.sol'].Reenter.abi,'attempted'),true);
  assert.equal(await read(receiver,contracts['mocks.sol'].Reenter.abi,'succeeded'),false);
 });
});

