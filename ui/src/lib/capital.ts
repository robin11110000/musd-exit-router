import {BrowserProvider,Contract,JsonRpcProvider,getAddress,parseUnits} from 'ethers';
import artifact from './abis/WorkingCapitalVault.json';

export const CAPITAL={chainId:31611,chainHex:'0x7b7b',rpc:'https://rpc.test.mezo.org',explorer:'https://explorer.test.mezo.org',musd:'0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',savings:'0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16',implementation:'0x92D12f0a60906b39d81acD9bf8977b6c824cD98C',strategy:'0x6abE6853f3006f304709084AC37f826Be50847E0'} as const;
export {artifact};
export function musdAmount(value:string,allowZero=false){
 if(!/^\d{1,12}(\.\d{1,18})?$/.test(value))throw new Error('Enter a positive MUSD amount with up to 18 decimals.');
 const parsed=parseUnits(value,18);if(parsed===0n&&!allowZero)throw new Error('Amount must be greater than zero.');return parsed;
}
export async function checkedProvider(){
 const provider=new JsonRpcProvider(CAPITAL.rpc);
 if(BigInt(await provider.send('eth_chainId',[]))!==31611n)throw new Error('Mezo testnet required.');
 return provider;
}
export async function verifySavings(provider:JsonRpcProvider|BrowserProvider){
 const savings=new Contract(CAPITAL.savings,['function musdToken() view returns(address)','function strategy() view returns(address)'],provider);
 const [token,strategy,storage]=await Promise.all([savings.musdToken(),savings.strategy(),provider.getStorage(CAPITAL.savings,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')]);
 if(getAddress(token)!==getAddress(CAPITAL.musd)||getAddress(strategy)!==getAddress(CAPITAL.strategy)||getAddress('0x'+storage.slice(-40))!==getAddress(CAPITAL.implementation))throw new Error('Savings configuration changed. Review required.');
}
export async function readCapital(address:string){
 const target=getAddress(address),provider=await checkedProvider();
 const block=await provider.getBlockNumber();
 const code=await provider.getCode(target,block);
 if(code==='0x')throw new Error('No contract exists at that testnet address.');
 let masked=code.slice(2).toLowerCase();
 for(const references of Object.values(artifact.immutableReferences))for(const reference of references){
  const start=reference.start*2,end=start+reference.length*2;
  masked=masked.slice(0,start)+'0'.repeat(reference.length*2)+masked.slice(end);
 }
 if(masked!==artifact.runtimeTemplate.slice(2).toLowerCase())throw new Error('Vault bytecode does not match this reviewed build.');
 const vault=new Contract(target,artifact.abi,provider);
 const [owner,token,savings,snapshot,lastAllocation]=await Promise.all([vault.owner({blockTag:block}),vault.musd({blockTag:block}),vault.savings({blockTag:block}),vault.snapshot({blockTag:block}),vault.lastAllocation({blockTag:block})]);
 if(getAddress(token)!==getAddress(CAPITAL.musd)||getAddress(savings)!==getAddress(CAPITAL.savings))throw new Error('This account targets different contracts.');
 return {address:target,owner:getAddress(owner),liquid:BigInt(snapshot[0]),principal:BigInt(snapshot[1]),policy:{reserve:BigInt(snapshot[2][0]),maxPerAllocation:BigInt(snapshot[2][1]),remainingBudget:BigInt(snapshot[2][2]),cooldown:Number(snapshot[2][3]),expiresAt:Number(snapshot[2][4]),active:Boolean(snapshot[2][5])},lastAllocation:Number(lastAllocation),block};
}
export type CapitalSnapshot=Awaited<ReturnType<typeof readCapital>>;
