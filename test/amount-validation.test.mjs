import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAmount} from '../src/mezo.mjs';
test('amount validation rejects malformed and excessive inputs before RPC access',()=>{
 for(const value of ['',null,'-1','0','1e5','Infinity','1.0000001','1000001','<script>'])assert.throws(()=>validateAmount(value));
});
test('amount validation preserves supported precision exactly',()=>{
 assert.equal(validateAmount('0.000001'),1_000_000_000_000n);
 assert.equal(validateAmount('1000000'),1_000_000n*10n**18n);
});
