// Read-only, fixed-network probe. No signer, wallet, keys, or transaction methods.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, decodeFunctionResult, parseAbi, keccak256 } from 'viem';

const base = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
const RPC = 'https://rpc.test.mezo.org';
if (manifest.chainId !== 31611 || manifest.rpc !== RPC) throw new Error('Manifest must use fixed Mezo testnet');
const report = { observedAt: new Date().toISOString(), rpc: RPC, chainId: null, block: null, contracts: {}, sources: {} };
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
async function request(url, options = {}) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}
async function rpc(method, params = []) {
  if (!['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call'].includes(method)) throw new Error('Non-read RPC refused');
  const body = await request(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json({ jsonrpc: '2.0', id: 1, method, params }) });
  if (body.error) throw new Error(json(body.error));
  if (body.result === undefined) throw new Error('Missing RPC result');
  return body.result;
}
async function capture(f) { try { return { ok: true, value: await f() }; } catch (e) { return { ok: false, error: e.message }; } }
async function explorer(address) {
  const url = `https://api.explorer.test.mezo.org/api/v2/smart-contracts/${address}`;
  const c = await request(url);
  return { url, name: c.name, isVerified: c.is_verified, proxyType: c.proxy_type, implementations: c.implementations, abi: c.abi, compilerVersion: c.compiler_version, sourceCode: c.source_code, additionalSources: c.additional_sources };
}
const chain = await rpc('eth_chainId');
if (BigInt(chain) !== 31611n) throw new Error(`Refusing chain ${chain}; required 31611`);
report.chainId = 31611;
const block = await rpc('eth_getBlockByNumber', ['latest', false]);
report.block = { number: block.number, hash: block.hash, timestamp: block.timestamp };
const tag = block.number;
const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
async function read(address, declaration, args = []) {
  const abi = parseAbi([declaration]);
  const functionName = abi[0].name;
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await rpc('eth_call', [{ to: address, data }, tag]);
  return decodeFunctionResult({ abi, functionName, data: result });
}
for (const [name, entry] of Object.entries(manifest.contracts)) {
  if (!entry.address) { report.contracts[name] = { status: entry.status, reason: entry.reason }; continue; }
  const address = entry.address.toLowerCase();
  const item = report.contracts[name] = { address, calls: {} };
  item.code = await capture(async () => { const code = await rpc('eth_getCode', [address, tag]); return { bytes: (code.length - 2) / 2, keccak256: keccak256(code), note: name === 'skip' ? 'Native precompile may have no EVM bytecode; use calls to establish availability.' : undefined }; });
  item.implementationSlot = await capture(() => rpc('eth_getStorageAt', [address, implementationSlot, tag]));
  for (const call of entry.reads ?? []) item.calls[call.signature] = await capture(() => read(address, call.signature, (call.args ?? []).map(v => v === '$MAX_AGE' ? 3600n : v)));
  item.explorer = await capture(() => explorer(address));
}
const revision = manifest.sourceRevision;
for (const name of ['MUSD', 'PCV', 'PriceFeed']) {
  report.sources[name] = await capture(async () => {
    const url = `https://raw.githubusercontent.com/mezo-org/musd/${revision}/solidity/artifacts/deployments/matsnet/${name}.json`;
    const a = await request(url);
    return { url, address: a.address, abi: a.abi, deployedBytecodeHash: a.deployedBytecode ? keccak256(a.deployedBytecode) : null };
  });
}
// Follow deployed core configuration instead of inventing a savings address.
const pcv = report.sources.PCV.value?.address;
if (pcv) {
  report.pcv = {};
  for (const method of ['feeRecipient', 'btcRecipient']) {
    report.pcv[method] = await capture(() => read(pcv, `function ${method}() view returns (address)`));
  }
  const candidate = report.pcv.feeRecipient.value;
  if (candidate && !/^0x0{40}$/i.test(candidate)) {
    report.savingsCandidate = { address: candidate, provenance: 'PCV.feeRecipient; configuration linkage alone does not prove savings semantics', reads: {} };
    for (const declaration of ['function name() view returns (string)', 'function symbol() view returns (string)', 'function asset() view returns (address)', 'function totalAssets() view returns (uint256)', 'function totalSupply() view returns (uint256)']) {
      report.savingsCandidate.reads[declaration] = await capture(() => read(candidate, declaration));
    }
    report.savingsCandidate.explorer = await capture(() => explorer(candidate));
    report.savingsCandidate.implementationSlot = await capture(() => rpc('eth_getStorageAt', [candidate, implementationSlot, tag]));
    const slot = report.savingsCandidate.implementationSlot.value;
    if (slot && !/^0x0+$/.test(slot)) {
      const implementation = `0x${slot.slice(-40)}`;
      report.savingsCandidate.implementation = { address: implementation, explorer: await capture(() => explorer(implementation)), codeHash: await capture(async () => keccak256(await rpc('eth_getCode', [implementation, tag]))) };
      const abi = report.savingsCandidate.implementation.explorer.value?.abi;
      if (abi) for (const f of abi.filter(f => f.type === 'function' && f.inputs.length === 0 && f.stateMutability === 'view')) {
        report.savingsCandidate.reads[f.name] = await capture(async () => {
          const result = await rpc('eth_call', [{ to: candidate, data: encodeFunctionData({ abi, functionName: f.name }) }, tag]);
          return decodeFunctionResult({ abi, functionName: f.name, data: result });
        });
      }
      const strategy = report.savingsCandidate.reads.strategy?.value;
      if (strategy) report.savingsCandidate.strategy = { address: strategy, explorer: await capture(() => explorer(strategy)), codeHash: await capture(async () => keccak256(await rpc('eth_getCode', [strategy, tag]))) };
    }
  }
}
const pyth = manifest.contracts.pyth.address.toLowerCase();
report.pythUnsafe = await capture(() => read(pyth, 'function getPriceUnsafe(bytes32) view returns ((int64 price,uint64 conf,int32 expo,uint256 publishTime))', [manifest.contracts.pyth.reads[0].args[0]]));
report.sourceRuntimeMatch = {};
for (const [name, source] of Object.entries(report.sources)) {
  if (source.value?.deployedBytecodeHash) report.sourceRuntimeMatch[name] = await capture(async () => ({ match: keccak256(await rpc('eth_getCode', [source.value.address, tag])) === source.value.deployedBytecodeHash, note: 'Exact hash equality only; mismatch needs proxy/immutable/compiler analysis.' }));
}
report.earn = {};
for (const name of ['VeBTCVoter', 'GaugeFactory', 'VeBTC']) {
  report.earn[name] = await capture(async () => {
    const url = `https://raw.githubusercontent.com/mezo-org/tigris/${manifest.tigrisRevision}/solidity/deployments/testnet/${name}.json`;
    const a = await request(url);
    const code = await rpc('eth_getCode', [a.address, tag]);
    const probes = {};
    for (const declaration of name === 'VeBTC' ? ['function name() view returns (string)', 'function symbol() view returns (string)'] : name === 'GaugeFactory' ? ['function implementation() view returns (address)'] : ['function length() view returns (uint256)']) probes[declaration] = await capture(() => read(a.address, declaration));
    return { url, address: a.address, abi: a.abi, runtimeHash: keccak256(code), runtimeBytes: (code.length - 2) / 2, probes, artifactRuntimeMatch: a.deployedBytecode ? keccak256(a.deployedBytecode) === keccak256(code) : null };
  });
}
// Output is always in this owned integration directory, never an arbitrary path.
await writeFile(new URL('evidence.json', base), json(report) + '\n');
console.log(`Read-only evidence saved: ${fileURLToPath(new URL('evidence.json', base))}`);
console.log(json({ chainId: report.chainId, block: report.block, contracts: Object.fromEntries(Object.entries(report.contracts).map(([k,v]) => [k, { address: v.address, status: v.status, calls: v.calls }])) }));
