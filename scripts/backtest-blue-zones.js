/* GoldPulse Lab — deterministic preliminary backtest for the blue-zone setup.
 * Node 20+, no third-party dependencies.
 * CSV columns: datetime,open,high,low,close[,volume], UTC timestamps at bar OPEN.
 * This is NOT the full strategy: Fibonacci setup and news calendar are not included.
 */
"use strict";
const fs = require("node:fs");

function parseCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV has no candle rows");
  const header = lines.shift().split(",").map(s => s.trim().toLowerCase());
  const col = name => header.indexOf(name);
  const ti = col("datetime") >= 0 ? col("datetime") : col("time");
  const oi = col("open"), hi = col("high"), li = col("low"), ci = col("close");
  if ([ti, oi, hi, li, ci].some(i => i < 0)) throw new Error("CSV needs datetime/time,open,high,low,close");
  const rows = lines.filter(Boolean).map((line, i) => {
    const a = line.split(",");
    const time = Date.parse(a[ti]);
    const c = { time, open: Number(a[oi]), high: Number(a[hi]), low: Number(a[li]), close: Number(a[ci]) };
    if (!Number.isFinite(c.time) || ![c.open,c.high,c.low,c.close].every(Number.isFinite)) throw new Error("Invalid candle at row " + (i + 2));
    if (c.high < Math.max(c.open,c.close,c.low) || c.low > Math.min(c.open,c.close,c.high)) throw new Error("Inconsistent OHLC at row " + (i + 2));
    return c;
  }).sort((a,b) => a.time-b.time);
  for (let i=1;i<rows.length;i++) if (rows[i].time===rows[i-1].time) throw new Error("Duplicate candle timestamp");
  return rows;
}

function aggregateDaily(bars) {
  const byDay = new Map();
  for (const b of bars) {
    const date = new Date(b.time).toISOString().slice(0,10);
    if (!byDay.has(date)) byDay.set(date,{date,time:Date.parse(date+"T00:00:00Z"),open:b.open,high:b.high,low:b.low,close:b.close});
    const d=byDay.get(date); d.high=Math.max(d.high,b.high); d.low=Math.min(d.low,b.low); d.close=b.close;
  }
  return [...byDay.values()].sort((a,b)=>a.time-b.time);
}

function createZones(days) {
  const zones=[], swings=[];
  for(let i=2;i<days.length;i++){
    const p=days[i-1], left=days[i-2], right=days[i];
    const isHigh=p.high>left.high&&p.high>right.high;
    const isLow=p.low<left.low&&p.low<right.low;
    if(!isHigh&&!isLow) continue;
    if(isHigh&&isLow){swings.push({type:"BOTH",date:p.date,price:p.high,verticalMarker:true});continue;}
    const type=isHigh?"H":"L", price=isHigh?p.high:p.low;
    let accepted=true;
    if(swings.length&&swings[swings.length-1].type===type){
      const last=swings[swings.length-1];
      const moreExtreme=type==="H"?price>last.price:price<last.price;
      if(moreExtreme){last.date=p.date;last.price=price;} else accepted=false;
    } else swings.push({type,date:p.date,price});
    if(!accepted) continue;
    const bodyTop=Math.max(p.open,p.close), bodyBottom=Math.min(p.open,p.close);
    const zone=isHigh
      ? {side:"SHORT",low:bodyTop,high:p.high,extreme:p.high}
      : {side:"LONG",low:p.low,high:bodyBottom,extreme:p.low};
    if(zone.high>zone.low) zones.push({...zone,createdDate:right.date,pivotDate:p.date,used:false,invalid:false,armed:false});
  }
  return {zones,swings};
}

function romeCloseHour(bar) {
  const closeTime=new Date(bar.time+3600000);
  return Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",hourCycle:"h23"}).format(closeTime));
}

function runBacktest(bars, options={}) {
  const startHour=options.startHour ?? 9, endHour=options.endHour ?? 18;
  const days=aggregateDaily(bars), {zones,swings}=createZones(days);
  const trades=[], rejected={outsideHours:0,noVirginTarget:0,invalidRR:0};
  let position=null, entries=0;
  function closePosition(bar,price,reason){
    const p=position;
    const resultR=p.side==="SHORT"?(p.entry-price)/p.risk:(price-p.entry)/p.risk;
    trades.push({side:p.side,entryTime:new Date(p.entryTime).toISOString(),entry:p.entry,sl:p.initialSL,tp:p.tp,
      exitTime:new Date(bar.time).toISOString(),exit:price,reason,R:Number(resultR.toFixed(4)),rr:Number(p.rr.toFixed(4)),zoneDate:p.zone.pivotDate});
    p.zone.used=true;
    if(p.targetZone) p.targetZone.used=true;
    position=null;
  }
  for(const bar of bars){
    const date=new Date(bar.time).toISOString().slice(0,10);
    if(position && bar.time>=position.entryTime){
      // OHLC cannot reveal intrabar order: if stop and target both hit, assume stop first.
      const stopHit=position.side==="LONG"?bar.low<=position.sl:bar.high>=position.sl;
      if(stopHit) closePosition(bar,position.sl,position.sl===position.entry?"BE":"SL");
      else {
        const beHit=position.side==="LONG"?bar.high>=position.entry+position.risk:bar.low<=position.entry-position.risk;
        const targetHit=position.side==="LONG"?bar.high>=position.tp:bar.low<=position.tp;
        // If both BE activation and TP are inside one H1 candle, their order is unknown.
        // Use the conservative outcome: breakeven rather than assuming TP came first.
        if(beHit && targetHit) closePosition(bar,position.entry,"BE");
        else if(beHit) position.sl=position.entry;
        else if(targetHit) closePosition(bar,position.tp,"TP");
      }
    }
    let candidate=null;
    for(const zone of zones){
      if(zone.used||zone.invalid||date<=zone.createdDate) continue;
      const overlaps=bar.high>=zone.low&&bar.low<=zone.high;
      const closeInside=bar.close>=zone.low&&bar.close<=zone.high;
      if(!zone.armed){
        if(closeInside) zone.armed=true;
        else if(overlaps) zone.invalid=true;
        continue;
      }
      // A new break of the swing extreme invalidates the setup.
      const breaksExtreme=zone.side==="SHORT"?bar.high>zone.high:bar.low<zone.low;
      if(breaksExtreme){zone.invalid=true;continue;}
      const trigger=zone.side==="SHORT"?bar.close<zone.low:bar.close>zone.high;
      const closesWrongSide=zone.side==="SHORT"?bar.close>zone.high:bar.close<zone.low;
      if(!trigger){if(closesWrongSide) zone.invalid=true;continue;}
      // Do not queue multiple positions. A signal that fires while occupied is skipped.
      if(position||candidate){zone.used=true;continue;}
      const hour=romeCloseHour(bar);
      if(hour<startHour||hour>=endHour){rejected.outsideHours++;zone.invalid=true;continue;}
      const targetCandidates=zones.filter(t=>t.side!==zone.side&&!t.used&&!t.invalid&&t.createdDate<date&&
        (zone.side==="SHORT"?t.high<bar.close:t.low>bar.close))
        .sort((a,b)=>zone.side==="SHORT"?b.high-a.high:a.low-b.low);
      if(!targetCandidates.length){rejected.noVirginTarget++;zone.invalid=true;continue;}
      const targetZone=targetCandidates[0], entry=bar.close;
      const sl=zone.side==="SHORT"?zone.high:zone.low;
      const tp=zone.side==="SHORT"?targetZone.high:targetZone.low;
      const risk=zone.side==="SHORT"?sl-entry:entry-sl;
      const reward=zone.side==="SHORT"?entry-tp:tp-entry;
      if(!(risk>0&&reward>0)){rejected.invalidRR++;zone.invalid=true;continue;}
      candidate={side:zone.side,entry,sl,initialSL:sl,tp,risk,rr:reward/risk,
        entryTime:bar.time+3600000,zone,targetZone};
    }
    if(candidate){position=candidate;entries++;}
  }
  const wins=trades.filter(t=>t.R>0).length;
  const grossProfit=trades.filter(t=>t.R>0).reduce((s,t)=>s+t.R,0);
  const grossLoss=-trades.filter(t=>t.R<0).reduce((s,t)=>s+t.R,0);
  let equity=0,peak=0,maxDD=0;
  for(const t of trades){equity+=t.R;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);}
  return {
    period:{from:bars.length?new Date(bars[0].time).toISOString():null,to:bars.length?new Date(bars[bars.length-1].time).toISOString():null},
    bars:bars.length,dailyBars:days.length,confirmedSwings:swings.length,zones:zones.length,entries,closedTrades:trades.length,openAtEnd:position?1:0,
    wins,losses:trades.filter(t=>t.R<0).length,breakevens:trades.filter(t=>t.R===0).length,
    winRatePct:trades.length?Number((wins/trades.length*100).toFixed(2)):null,
    netR:Number(trades.reduce((s,t)=>s+t.R,0).toFixed(3)),
    avgR:trades.length?Number((trades.reduce((s,t)=>s+t.R,0)/trades.length).toFixed(4)):null,
    profitFactor:grossLoss?Number((grossProfit/grossLoss).toFixed(3)):(grossProfit?"Infinity":null),
    maxClosedTradeDrawdownR:Number(maxDD.toFixed(3)),rejected,trades
  };
}

module.exports={parseCsv,aggregateDaily,createZones,runBacktest};
if(require.main===module){
  const file=process.argv[2];
  if(!file){console.error("Usage: node scripts/backtest-blue-zones.js path/to/ohlc.csv");process.exit(2);}
  const bars=parseCsv(fs.readFileSync(file,"utf8"));
  console.log(JSON.stringify(runBacktest(bars),null,2));
}
