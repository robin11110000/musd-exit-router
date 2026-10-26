import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import solc from 'solc';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {keccak256} from 'viem';

const root=fileURLToPath(new URL('../',import.meta.url));
const source='src/WorkingCapitalVault.sol';
const input={language:'Solidity',sources:{[source]:{content:await readFile(resolve(root,source),'utf8')}},settings:{optimizer:{enabled:true,runs:1000},evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
const result=JSON.parse(solc.compile(JSON.stringify(input),{import:path=>{
 try{return {contents:readFileSync(resolve(root,path.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/')),'utf8')};}
 catch{return {error:'Missing '+path};}
}}));
const errors=(result.errors??[]).filter(e=>e.severity==='error');
if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
const contract=result.contracts[source].WorkingCapitalVault;
const artifact={contractName:'WorkingCapitalVault',compiler:solc.version(),chainId:31611,sourceHash:keccak256('0x'+Buffer.from(input.sources[source].content).toString('hex')),optimizer:input.settings.optimizer,evmVersion:input.settings.evmVersion,abi:contract.abi,bytecode:'0x'+contract.evm.bytecode.object};
await mkdir(resolve(root,'exports'),{recursive:true});
await writeFile(resolve(root,'exports/WorkingCapitalVault.json'),JSON.stringify(artifact,null,2)+'\n');
console.log('Exported exact ABI and deployment bytecode to exports/WorkingCapitalVault.json (no deployed address).');
