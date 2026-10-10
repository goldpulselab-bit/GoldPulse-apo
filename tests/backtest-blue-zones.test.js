"use strict";
const assert = require("node:assert/strict");
const { parseCsv, aggregateDaily, createZones, runBacktest } = require("../scripts/backtest-blue-zones.js");

const csv = [
  "datetime,open,high,low,close,volume",
  "2026-01-01T10:00:00Z,10,12,9,11,100",
  "2026-01-01T11:00:00Z,11,13,10,12,110",
  "2026-01-02T10:00:00Z,12,14,11,13,120",
  "2026-01-03T10:00:00Z,13,13.5,8,9,130",
  "2026-01-04T10:00:00Z,9,10,7,8,140"
].join("\n");

const bars = parseCsv(csv);
assert.equal(bars.length, 5);
assert.equal(aggregateDaily(bars).length, 4);
assert.throws(() => parseCsv("datetime,open,high,low,close\nnot-a-date,1,2,0,1"), /Invalid candle/);
assert.throws(() => parseCsv("datetime,open,high,low,close\n2026-01-01T00:00:00Z,5,3,4,4"), /Inconsistent OHLC/);
const days = aggregateDaily(bars);
const z = createZones(days);
assert.ok(Array.isArray(z.zones));
const result = runBacktest(bars);
assert.equal(result.bars, 5);
assert.equal(result.closedTrades, 0);
assert.equal(result.netR, 0);
assert.equal(result.winRatePct, null);
console.log("Backtest parser and deterministic smoke tests passed.");
