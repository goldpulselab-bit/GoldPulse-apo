"use strict";
const assert = require("node:assert/strict");
const { backtestFibonacci, buildFibEvents } = require("../scripts/backtest-fibonacci.js");

const bars=[];
for(let i=0;i<120;i++){
  const time=Date.UTC(2025,0,1,0)+i*3600000;
  const base=100+Math.sin(i/7)*5+i*0.03;
  bars.push({time,open:base,high:base+1,low:base-1,close:base+0.2});
}
assert.ok(Array.isArray(buildFibEvents(bars)));
for(const mode of ["ext027","ext0618","oppositeZone"]){
  const result=backtestFibonacci(bars,mode);
  assert.equal(result.targetMode,mode);
  assert.equal(typeof result.closedTrades,"number");
  assert.ok(Array.isArray(result.trades));
  assert.equal(result.closedTrades,result.trades.length);
}
assert.throws(()=>backtestFibonacci(bars,"invalid-target"),/Unknown target mode/);
console.log("Fibonacci backtest smoke tests passed.");
