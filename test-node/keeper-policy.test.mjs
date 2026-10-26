import test from 'node:test';
import assert from 'node:assert/strict';
import {planAllocation} from '../src/keeper-policy.mjs';
const base={liquid:100n,lastAllocation:0n,timestamp:1000n,policy:{active:true,reserve:40n,maxPerAllocation:30n,remainingBudget:50n,cooldown:60n,expiresAt:2000n}};
test('keeper uses the smallest of surplus, budget and per-action limit',()=>{
 assert.equal(planAllocation(base).amount,30n);
 assert.equal(planAllocation({...base,liquid:45n}).amount,5n);
 assert.equal(planAllocation({...base,policy:{...base.policy,remainingBudget:7n}}).amount,7n);
 assert.equal(planAllocation({...base,liquid:39n}).amount,0n);
});
test('keeper respects exact expiry, cooldown, revocation and empty budget boundaries',()=>{
 assert.equal(planAllocation({...base,lastAllocation:941n}).amount,0n);
 assert.equal(planAllocation({...base,lastAllocation:940n}).amount,30n);
 assert.equal(planAllocation({...base,timestamp:2000n}).amount,0n);
 assert.equal(planAllocation({...base,policy:{...base.policy,active:false}}).amount,0n);
 assert.equal(planAllocation({...base,policy:{...base.policy,remainingBudget:0n}}).amount,0n);
});
