import solc from 'solc';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
export async function compile(extra = {}) {
  const file='contracts/BoundedRedemptionRouter.sol';
  const input={language:'Solidity',sources:{[file]:{content:await readFile(file,'utf8')},...extra},settings:{optimizer:{enabled:true,runs:200},evmVersion:'london',outputSelection:{'*':{'':['ast'],'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
  const output=JSON.parse(solc.compile(JSON.stringify(input)));
  const errors=output.errors?.filter(e=>e.severity==='error')??[];
  if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
  for(const [path,contracts] of Object.entries(output.contracts)){
    for(const [name,artifact] of Object.entries(contracts)){
      const contract=output.sources[path].ast.nodes.find(n=>n.nodeType==='ContractDefinition'&&n.name===name);
      artifact.immutableNames=Object.fromEntries((contract?.nodes??[]).filter(n=>n.nodeType==='VariableDeclaration'&&n.mutability==='immutable').map(n=>[n.id,n.name]));
    }
  }
  return output.contracts;
}
if(process.argv[1]?.endsWith('compile.mjs')){
  const contracts=await compile({'quoter.sol':{content:await readFile('contracts/ReadOnlyCLQuoter.sol','utf8')}});
  await mkdir('artifacts',{recursive:true});
  const artifact=contracts['contracts/BoundedRedemptionRouter.sol'].BoundedRedemptionRouter;
  await writeFile('artifacts/BoundedRedemptionRouter.json',JSON.stringify(artifact,null,2)+'\n');
  await writeFile('artifacts/ReadOnlyCLQuoter.json',JSON.stringify(contracts['quoter.sol'].ReadOnlyCLQuoter,null,2)+'\n');
  console.log('Compiled BoundedRedemptionRouter for London EVM. No deployment performed.');
}
