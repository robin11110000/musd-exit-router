// Browser + real local EVM integration. Protocol/token fixtures are mocks, never public transactions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const solc=require('solc');
const ganache=require('ganache');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createWalletClient,custom,parseEther}=require('viem');
const root=path.resolve(__dirname,'..');
const MUSD='0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const SAVINGS='0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16';
const implementation='0x92D12f0a60906b39d81acD9bf8977b6c824cD98C';
const source=`pragma solidity 0.8.30;
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
contract SavingsHarness {
 mapping(address=>uint256) public balanceOf;
 function musdToken() external pure returns(address){return ${MUSD};}
 function strategy() external pure returns(address){return 0x6abE6853f3006f304709084AC37f826Be50847E0;}
 function deposit(uint256 amount) external {ERC20Mock(${MUSD}).transferFrom(msg.sender,address(this),amount);balanceOf[msg.sender]+=amount;}
 function withdraw(uint256 amount) external {balanceOf[msg.sender]-=amount;ERC20Mock(${MUSD}).transfer(msg.sender,amount);}
 function claimYield() external pure returns(uint256){return 0;}
}`;
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Harness.sol':{content:source}},settings:{evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}}),{import:p=>({contents:fs.readFileSync(path.resolve(root,p.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/')),'utf8')})}));
assert.deepEqual((output.errors||[]).filter(e=>e.severity==='error'),[]);
const token=output.contracts['@openzeppelin/contracts/mocks/token/ERC20Mock.sol'].ERC20Mock;
const savings=output.contracts['Harness.sol'].SavingsHarness;

(async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{chainId:31611,hardfork:'london'}});
 let browser;
 try{
  const accounts=await provider.request({method:'eth_accounts',params:[]});
  await provider.request({method:'evm_setAccountCode',params:[MUSD,'0x'+token.evm.deployedBytecode.object]});
  await provider.request({method:'evm_setAccountCode',params:[SAVINGS,'0x'+savings.evm.deployedBytecode.object]});
  await provider.request({method:'evm_setAccountStorageAt',params:[SAVINGS,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc','0x'+implementation.slice(2).padStart(64,'0')]});
  const wallet=createWalletClient({account:accounts[0],transport:custom(provider)});
  await wallet.writeContract({chain:null,address:MUSD,abi:token.abi,functionName:'mint',args:[accounts[0],parseEther('100')]});
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('localWallet',async request=>{
   if(request.method==='wallet_switchEthereumChain'){assert.equal(request.params[0].chainId,'0x7b7b');return null;}
   if(request.method==='eth_requestAccounts')return accounts;
   return provider.request(request);
  });
  await page.addInitScript(()=>{const meta={isMetaMask:true,request:request=>window.localWallet(request),on:()=>{},removeListener:()=>{}};window.ethereum={isPhantom:true,request:()=>{throw Error('Phantom must not be selected');}};window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask'},provider:meta}})));});
  await page.route('https://rpc.test.mezo.org/**',async route=>{
   const payload=route.request().postDataJSON();
   const handle=async req=>{try{return {jsonrpc:'2.0',id:req.id,result:await provider.request({method:req.method,params:req.params||[]})};}catch(e){return {jsonrpc:'2.0',id:req.id,error:{code:e.code||-32000,message:e.message,data:e.data}};}};
   const body=Array.isArray(payload)?await Promise.all(payload.map(handle)):await handle(payload);
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  });
  await page.goto(process.env.CAPITAL_URL||'http://127.0.0.1:3002/capital',{timeout:120000});
  await page.getByRole('button',{name:'Connect MetaMask'}).click();
  await page.getByText('Wallet connected to Mezo testnet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Deploy empty vault'}).click();
  await page.getByText(/Vault read at testnet block/).waitFor({timeout:90000});
  const address=await page.getByLabel('Vault address',{exact:true}).inputValue();
  assert.match(address,/^0x[a-fA-F0-9]{40}$/);
  const confirm=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.getByText('Confirmed on Mezo testnet. Balances refreshed.',{exact:true}).waitFor({timeout:60000});};
  await page.getByLabel('Amount / MUSD',{exact:true}).fill('100');
  await confirm('Approve & fund test MUSD');
  await page.getByLabel('Liquid reserve / MUSD',{exact:true}).fill('40');
  await page.getByLabel('Allocation limit / MUSD',{exact:true}).fill('60');
  await page.getByLabel('Total budget / MUSD',{exact:true}).fill('60');
  await page.getByLabel('Cooldown / seconds',{exact:true}).fill('0');
  await confirm('Activate testnet policy');
  await page.getByLabel('Amount / MUSD',{exact:true}).fill('60');
  await confirm('Allocate test MUSD');
  assert.equal(await page.getByLabel('Total budget / MUSD',{exact:true}).inputValue(),'0.0');
  assert.equal(await page.getByLabel('Liquid reserve / MUSD',{exact:true}).inputValue(),'40.0');
  await confirm('Revoke automation');
  await page.getByLabel('Minimum return / MUSD',{exact:true}).fill('60');
  await confirm('Return savings to reserve');
  await page.getByLabel('Amount / MUSD',{exact:true}).fill('100');
  await confirm('Withdraw liquid MUSD');
  const assetBalances=await page.locator('.metrics strong').allTextContents();
  assert.deepEqual(assetBalances,['0','0','0']);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({network:'local EVM, chain 31611, mocked MUSD/savings',passed:['wallet connection','artifact deployment','runtime verification','exact approval and funding','policy activation','allocation','policy input refresh','revocation','savings unwind','owner withdrawal'],publicTransactions:0}));
 }finally{if(browser)await browser.close();await provider.disconnect();}
})().catch(e=>{console.error(e);process.exitCode=1;});
