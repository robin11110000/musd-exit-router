import {getQuotes} from '../src/mezo.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const report=await getQuotes('100');
if(report.chainId!==31611)throw new Error('Unexpected chain');
await mkdir('reports',{recursive:true});
await writeFile('reports/testnet-quotes.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({chainId:report.chainId,block:report.blockNumber,routes:report.routes.map(r=>({name:r.name,status:r.status})),executionEnabled:report.executionEnabled},(_,v)=>typeof v==='bigint'?v.toString():v,2));
