import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

const source='src/WorkingCapitalVault.sol';
const mock=`pragma solidity 0.8.30;
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
contract SavingsMock {
 ERC20Mock public musdToken; mapping(address=>uint256) public balanceOf;
 bool public dishonest; bool public attack; bool public reentered; address public strategy;
 constructor(address token){musdToken=ERC20Mock(token);strategy=address(this);}
 function setStrategy(address next) external {strategy=next;}
 function claimYield() external returns(uint256){musdToken.mint(msg.sender,1 ether);return 1 ether;}
 function setDishonest(bool on) external {dishonest=on;}
 function setAttack(bool on) external {attack=on;}
 function deposit(uint256 amount) external {
  musdToken.transferFrom(msg.sender,address(this),amount);
  balanceOf[msg.sender]+=dishonest ? amount/2 : amount;
  if(attack){(bool ok,)=msg.sender.call(abi.encodeWithSignature("allocate(uint256)",1));reentered=ok;}
 }
 function withdraw(uint256 amount) external {
  balanceOf[msg.sender]-=amount;
  musdToken.transfer(msg.sender,amount);
  musdToken.mint(msg.sender,1 ether);
 }
}`;
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[source]:{content:readFileSync(source,'utf8')},'Mocks.sol':{content:mock}},settings:{optimizer:{enabled:true,runs:1000},evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:path=>{
 try{return {contents:readFileSync(path.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/'),'utf8')};}catch{return {error:'Missing '+path};}
}}));
assert.deepEqual((output.errors??[]).filter(e=>e.severity==='error').map(e=>e.formattedMessage),[]);
const tokenArt=output.contracts['@openzeppelin/contracts/mocks/token/ERC20Mock.sol'].ERC20Mock;
const savingsArt=output.contracts['Mocks.sol'].SavingsMock;
const vaultArt=output.contracts[source].WorkingCapitalVault;
const amount=parseEther;

async function setup(t){
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'london',chainId:31611}});
 t.after(()=>provider.disconnect());
 const accounts=Object.values(provider.getInitialAccounts()).map(x=>privateKeyToAccount(x.secretKey));
 const [owner,keeper,stranger]=accounts;
 const transport=custom(provider),client=createPublicClient({transport}),wallet=createWalletClient({transport,account:owner});
 const mined=hash=>client.waitForTransactionReceipt({hash});
 const deploy=async(a,args=[])=>{const r=await mined(await wallet.deployContract({chain:null,abi:a.abi,bytecode:'0x'+a.evm.bytecode.object,args}));assert.equal(r.status,'success');return r.contractAddress;};
 const send=(address,a,functionName,args=[],account=owner)=>wallet.writeContract({chain:null,account,address,abi:a.abi,functionName,args,gas:1500000n}).then(mined);
 const read=(address,a,functionName,args=[])=>client.readContract({address,abi:a.abi,functionName,args});
 const token=await deploy(tokenArt),savings=await deploy(savingsArt,[token]);
 const vault=await deploy(vaultArt,[token,savings,owner.address]);
 const act=(name,args=[],who=owner)=>send(vault,vaultArt,name,args,who);
 const view=(name,args=[])=>read(vault,vaultArt,name,args);
 await send(token,tokenArt,'mint',[owner.address,amount('100')]);
 await send(token,tokenArt,'approve',[vault,amount('100')]);
 await act('fund',[amount('100')]);
 await act('setKeeper',[keeper.address,true]);
 const now=(await client.getBlock()).timestamp;
 const policy={reserve:amount('40'),maxPerAllocation:amount('30'),remainingBudget:amount('50'),cooldown:60n,expiresAt:now+3600n,active:true};
 await act('setPolicy',[policy]);
 return {provider,client,owner,keeper,stranger,token,savings,vault,act,view,send,read,policy};
}

test('reserve, keeper permission, budget, cooldown, revocation and exits enforce owner policy',async t=>{
 const f=await setup(t);const {act,view,send,read,token,savings,vault,keeper,stranger,provider,policy}=f;
 const rejects=async(name,args,who)=>assert.equal((await act(name,args,who)).status,'reverted');
 await rejects('allocate',[amount('10')],stranger);
 await rejects('setKeeper',[stranger.address,true],stranger);
 await rejects('withdraw',[amount('1')],keeper);
 await rejects('allocate',[amount('31')],keeper);
 assert.equal((await act('allocate',[amount('30')],keeper)).status,'success');
 assert.equal((await view('snapshot'))[0],amount('70'));
 assert.equal(await read(token,tokenArt,'allowance',[vault,savings]),0n);
 await rejects('allocate',[amount('1')],keeper);
 await provider.request({method:'evm_increaseTime',params:[61]});await provider.request({method:'evm_mine',params:[]});
 await rejects('allocate',[amount('21')],keeper);
 assert.equal((await act('allocate',[amount('20')],keeper)).status,'success');
 assert.equal((await view('policy'))[2],0n);
 // Replacing the budget cannot bypass the owner's liquid reserve.
 await act('setPolicy',[{...policy,cooldown:0n,remainingBudget:amount('100')}]);
 await rejects('allocate',[amount('11')],keeper);
 assert.equal((await act('revoke')).status,'success');
 await rejects('allocate',[amount('1')],keeper);
 // Savings mock pays 1 MUSD simulated yield; no production APY implied.
 assert.equal((await act('withdrawSavings',[amount('50'),amount('52')])).status,'reverted');
 assert.equal(await read(savings,savingsArt,'balanceOf',[vault]),amount('50'));
 assert.equal((await act('withdrawSavings',[amount('50'),amount('51')])).status,'success');
 assert.equal((await view('snapshot'))[0],amount('101'));
 assert.equal((await act('withdraw',[amount('101')])).status,'success');
 assert.equal(await read(token,tokenArt,'balanceOf',[f.owner.address]),amount('101'));
 await rejects('harvest',[0n],keeper);
 assert.equal((await act('harvest',[amount('2')])).status,'reverted');
 assert.equal((await act('harvest',[amount('1')])).status,'success');
});

test('expired policy and dishonest savings cannot consume funds or budget',async t=>{
 const {act,view,send,read,token,savings,vault,keeper,provider,policy}=await setup(t);
 await send(savings,savingsArt,'setDishonest',[true]);
 assert.equal((await act('allocate',[amount('10')],keeper)).status,'reverted');
 assert.equal((await view('snapshot'))[0],amount('100'));
 assert.equal((await view('policy'))[2],amount('50'));
 assert.equal(await read(token,tokenArt,'allowance',[vault,savings]),0n);
 await send(savings,savingsArt,'setDishonest',[false]);
 await send(savings,savingsArt,'setStrategy',[keeper.address]);
 assert.equal((await act('allocate',[amount('10')],keeper)).status,'reverted');
 await send(savings,savingsArt,'setStrategy',[savings]);
 await provider.request({method:'evm_increaseTime',params:[3601]});await provider.request({method:'evm_mine',params:[]});
 assert.equal((await act('allocate',[amount('10')],keeper)).status,'reverted');
 assert.equal((await act('withdraw',[amount('100')])).status,'success');
});

test('a savings callback cannot reenter an otherwise authorized allocation',async t=>{
 const {act,view,send,read,savings,keeper,policy}=await setup(t);
 await act('setPolicy',[{...policy,cooldown:0n}]);
 await act('setKeeper',[savings,true]);
 await send(savings,savingsArt,'setAttack',[true]);
 assert.equal((await act('allocate',[amount('10')],keeper)).status,'success');
 assert.equal(await read(savings,savingsArt,'reentered'),false);
 assert.equal((await view('snapshot'))[0],amount('90'));
 assert.equal((await view('policy'))[2],amount('40'));
});
