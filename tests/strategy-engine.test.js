const assert = require("node:assert/strict");
const e = require("../src/strategy-engine.js");

const candles = [
  {time:1, open:5, high:7, low:4, close:6},
  {time:2, open:6, high:10, low:5, close:8},
  {time:3, open:8, high:9, low:6, close:7}
];
const p = e.confirmedPivotAt(candles, 2);
assert.equal(p.type, "HIGH");
assert.equal(p.index, 1);
assert.equal(p.confirmedAt, 3);

assert.equal(e.balanceReferenceLot(500), 0.01);
assert.equal(e.balanceReferenceLot(501), 0.02);
assert.equal(e.balanceReferenceLot(801), 0.03);
assert.equal(e.balanceReferenceLot(1101), 0.04);

const zone = e.wickZone({open:10, high:15, low:8, close:12}, "HIGH");
assert.deepEqual([zone.low, zone.high], [12, 15]);
assert.equal(e.zoneTouched(zone, {high:13, low:11}), true);
assert.equal(e.zoneTouched(zone, {high:11, low:10}), false);

assert.equal(e.rewardRisk(100, 90, 120, "LONG"), 2);
assert.equal(e.rewardRisk(100, 110, 80, "SHORT"), 2);
assert.equal(e.rewardRisk(100, 90, 105, "LONG"), 0.5);
assert.equal(e.rewardRisk(100, 110, 120, "LONG"), null);

const stats = e.summarizeTrades([{pnl:10},{pnl:-5},{pnl:-2},{pnl:4}], 100);
assert.equal(stats.trades, 4);
assert.equal(stats.wins, 2);
assert.equal(stats.losses, 2);
assert.equal(stats.netPnl, 7);
assert.equal(stats.endingBalance, 107);
assert.equal(stats.maxConsecutiveLosses, 2);
assert.equal(stats.profitFactor, 14 / 7);

const capped = e.sizeForRisk({balance:2000, riskPercent:3, stopPips:10, pipValuePer001:0.09});
assert.equal(capped.lot, 0.06); // balance-band ceiling at €2,000
const minLot = e.sizeForRisk({balance:200, riskPercent:0.5, stopPips:120, pipValuePer001:0.09});
assert.equal(minLot.lot, 0.01);
assert.equal(minLot.minimumLotExceedsRisk, true);

assert.throws(() => e.validateCandles([{open:1, high:0, low:0.5, close:0.5, time:1}]), RangeError);
console.log("GoldPulse engine primitive tests: PASS");
