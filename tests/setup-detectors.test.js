const assert = require("node:assert/strict");
const d = require("../src/setup-detectors.js");

const shortBars = [
  {time:1,open:12,high:13,low:11,close:12.5},
  {time:2,open:12.5,high:14,low:12,close:13},
  {time:3,open:12,high:12.5,low:10.5,close:11.5}
];
const short = d.detectZoneCloseSequence(shortBars, {low:12,high:14}, "SHORT");
assert.equal(short.status, "CONFIRMED");
assert.equal(short.armedIndex, 0);
assert.equal(short.index, 2);
assert.equal(short.entry, 11.5);

const traversing = [{time:1,open:13,high:15,low:10,close:11}];
assert.equal(d.detectZoneCloseSequence(traversing,{low:12,high:14},"SHORT").status,"INVALIDATED");

const fibLong = [
  {time:1,open:62,high:63,low:60,close:60.5},
  {time:2,open:60.5,high:62.5,low:60,close:62},
  {time:3,open:62,high:63,low:61,close:62.5}
];
const fib = d.detectFib61Trigger(fibLong, 61, "LONG");
assert.equal(fib.status, "TRIGGERED");
assert.equal(fib.confirmationIndex, 1);
assert.equal(fib.triggerIndex, 2);
assert.equal(fib.triggerPrice, 62.5);

const noSameBarTrigger = d.detectFib61Trigger(fibLong.slice(0,2), 61, "LONG");
assert.equal(noSameBarTrigger.status, "ARMED");

console.log("GoldPulse setup detector tests: PASS");
