const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{
   const calls=[];window.walletTest={calls,phantomUsed:false};
   let added=false,chain='0x1';
   const metamask={isMetaMask:true,on:()=>{},removeListener:()=>{},request:async({method,params})=>{
    calls.push({method,params});
    if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0x1111111111111111111111111111111111111111'];
    if(method==='eth_chainId')return chain;
    if(method==='wallet_switchEthereumChain'){if(!added)throw {code:4902,message:'Unknown chain'};chain=params[0].chainId;return null;}
    if(method==='wallet_addEthereumChain'){added=true;return null;}
    throw Error('Unexpected method '+method);
   }};
   window.ethereum={isPhantom:true,request:()=>{window.walletTest.phantomUsed=true;throw Error('Phantom selected');}};
   window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask'},provider:metamask}})));
  });
  await page.goto(process.env.CAPITAL_URL||'http://127.0.0.1:3002/capital');
  await page.getByRole('button',{name:'Connect MetaMask'}).click();
  await page.getByText('Wallet connected to Mezo testnet.',{exact:true}).waitFor();
  const state=await page.evaluate(()=>window.walletTest);
  assert.equal(state.phantomUsed,false);
  const add=state.calls.find(x=>x.method==='wallet_addEthereumChain');
  assert.equal(add.params[0].chainId,'0x7b7b');
  assert.deepEqual(add.params[0].rpcUrls,['https://rpc.test.mezo.org']);
  assert.equal(state.calls.filter(x=>x.method==='wallet_switchEthereumChain').length,2);
  console.log('PASS: Phantom ignored; MetaMask discovers, adds and switches to Mezo testnet.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
