"use strict";
/* Multi-asset runner for the GoldPulse blue-zone prototype.
 * Source: EV Trading Labs public closed-year H1 JSON.GZ catalogue; attribution required.
 * No spread, commission, slippage, news filter, or Fibonacci setup is modelled.
 */
const fs = require("node:fs");
const path = require("node:path");
const { runBacktest } = require("./backtest-blue-zones.js");
const { backtestFibonacci } = require("./backtest-fibonacci.js");

const SYMBOLS = ["XAUUSD","XAGUSD","DAX","DJ","NQ","SP500","WTI"];
const YEARS = [2021,2022,2023,2024,2025];

function loadSymbol(symbol, root) {
  const bars = [];
  const yearCounts = {};
  for (const year of YEARS) {
    const file = path.join(root, symbol, "H1", String(year) + ".json");
    if (!fs.existsSync(file)) throw new Error("Missing historical data file: " + file);
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(rows)) throw new Error("Expected JSON array in " + file);
    let count = 0;
    for (const row of rows) {
      const time = Number(row.ts) * 1000;
      const bar = { time, open:Number(row.o), high:Number(row.h), low:Number(row.l), close:Number(row.c) };
      if (!Number.isFinite(time) || ![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)) continue;
      if (bar.high < Math.max(bar.open,bar.close,bar.low) || bar.low > Math.min(bar.open,bar.close,bar.high)) {
        throw new Error("Invalid OHLC in " + file + " at ts=" + row.ts);
      }
      bars.push(bar); count++;
    }
    yearCounts[year] = count;
  }
  bars.sort((a,b)=>a.time-b.time);
  const unique=[];
  for (const bar of bars) {
    if (unique.length && unique[unique.length-1].time===bar.time) continue;
    unique.push(bar);
  }
  if (unique.length < 1000) throw new Error("Insufficient H1 bars for " + symbol + ": " + unique.length);
  const result = runBacktest(unique);
  const fibonacci = Object.fromEntries(["ext027","ext0618","oppositeZone"].map(mode => [mode, backtestFibonacci(unique, mode)]));
  return {
    symbol, years:YEARS, yearCounts, dataBars:unique.length,
    from:new Date(unique[0].time).toISOString(), to:new Date(unique[unique.length-1].time).toISOString(),
    closedTrades:result.closedTrades, openAtEnd:result.openAtEnd,
    wins:result.wins, losses:result.losses, breakevens:result.breakevens,
    winRatePct:result.winRatePct, netR:result.netR, avgR:result.avgR,
    profitFactor:result.profitFactor, maxClosedTradeDrawdownR:result.maxClosedTradeDrawdownR,
    rejected:result.rejected, trades:result.trades, fibonacci
  };
}

function main() {
  const dataRoot = process.argv[2] || "data";
  const outputRoot = process.argv[3] || "backtest-results";
  fs.mkdirSync(outputRoot,{recursive:true});
  const results = SYMBOLS.map(symbol=>loadSymbol(symbol,dataRoot));
  const output = {
    title:"GoldPulse Lab — preliminary blue-zone multi-asset backtest",
    source:"EV Trading Labs historical OHLCV catalogue, https://evtradelabs.com/data (free use with attribution)",
    period:"2021-01-01 through 2025-12-31",
    method:"Daily structure derived from UTC H1 bars; confirmed 3-candle pivots; wick-only zones; H1 close-inside then later close-outside; one open trade at a time; 09:00–18:00 Europe/Rome entry window; SL at zone extreme; target nearest opposite virgin zone; breakeven activation at +1R; stop-first if SL and target touch same H1 candle; conservative breakeven if BE activation and target fall in same candle.",
    limitations:["Blue-zone setup only; Fibonacci setup and overlap/split-size rules are not included.","No spread, commission, slippage or financing costs; results are gross and may be optimistic.","Historical index/commodity symbols are the data provider's instruments, not necessarily identical to the user's ActivTrades CFD contract.","This is a preliminary implementation, not a validated trading system; small trade counts are not statistically conclusive."],
    results
  };
  fs.writeFileSync(path.join(outputRoot,"summary.json"),JSON.stringify(output,null,2));
  const csvHeader=["symbol","bars","from","to","closedTrades","wins","losses","breakevens","winRatePct","netR","avgR","profitFactor","maxClosedTradeDrawdownR"];
  const csvRows=[csvHeader.join(",")];
  for(const r of results) csvRows.push([r.symbol,r.dataBars,r.from,r.to,r.closedTrades,r.wins,r.losses,r.breakevens,r.winRatePct??"",r.netR,r.avgR??"",r.profitFactor??"",r.maxClosedTradeDrawdownR].join(","));
  fs.writeFileSync(path.join(outputRoot,"summary.csv"),csvRows.join("\n")+"\n");
  const tradeHeader=["symbol","side","entryTime","entry","sl","tp","exitTime","exit","reason","R","rr","zoneDate"];
  const tradeRows=[tradeHeader.join(",")];
  for(const r of results) for(const t of r.trades) tradeRows.push([r.symbol,t.side,t.entryTime,t.entry,t.sl,t.tp,t.exitTime,t.exit,t.reason,t.R,t.rr,t.zoneDate].join(","));
  fs.writeFileSync(path.join(outputRoot,"trades.csv"),tradeRows.join("\n")+"\n");
  const fibSummaryHeader=["symbol","targetMode","fibEvents","closedTrades","wins","losses","breakevens","winRatePct","netR","avgR","profitFactor","maxDrawdownR"];
  const fibSummaryRows=[fibSummaryHeader.join(",")];
  const fibTradeHeader=["symbol","targetMode","side","entryTime","entry","sl","tp","exitTime","exit","reason","R","rr","fibBreakDate"];
  const fibTradeRows=[fibTradeHeader.join(",")];
  for(const r of results) for(const [mode, f] of Object.entries(r.fibonacci)) {
    fibSummaryRows.push([r.symbol,mode,f.fibEvents,f.closedTrades,f.wins,f.losses,f.breakevens,f.winRatePct??"",f.netR,f.avgR??"",f.profitFactor??"",f.maxDrawdownR].join(","));
    for(const t of f.trades) fibTradeRows.push([r.symbol,mode,t.side,t.entryTime,t.entry,t.sl,t.tp,t.exitTime,t.exit,t.reason,t.R,t.rr,t.fibBreakDate].join(","));
  }
  fs.writeFileSync(path.join(outputRoot,"fibonacci-summary.csv"),fibSummaryRows.join("\\n")+"\\n");
  fs.writeFileSync(path.join(outputRoot,"fibonacci-trades.csv"),fibTradeRows.join("\\n")+"\\n");
  console.log(JSON.stringify({summaryCsv:path.join(outputRoot,"summary.csv"),tradesCsv:path.join(outputRoot,"trades.csv"),results:results.map(({symbol,dataBars,closedTrades,winRatePct,netR,profitFactor,maxClosedTradeDrawdownR,fibonacci})=>({symbol,dataBars,closedTrades,winRatePct,netR,profitFactor,maxClosedTradeDrawdownR,fibonacci:Object.fromEntries(Object.entries(fibonacci).map(([mode,f])=>[mode,{closedTrades:f.closedTrades,winRatePct:f.winRatePct,netR:f.netR,profitFactor:f.profitFactor,maxDrawdownR:f.maxDrawdownR}]))}))},null,2));
}
main();
