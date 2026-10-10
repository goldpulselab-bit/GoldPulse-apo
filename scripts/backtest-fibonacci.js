"use strict";
/* Preliminary mechanical backtest for the Fibonacci 61.8 reversal setup.
 * Uses H1 OHLC and a proxy New York 17:00 trading-day boundary.
 * Intrabar ambiguity is handled conservatively. Not yet combined with blue-zone entries.
 */
const { aggregateDaily, createZones, sessionDate } = require("./backtest-blue-zones.js");

const romeHourFormatter = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Rome",hour:"2-digit",hourCycle:"h23"});
function hourRomeClose(bar) {
  return Number(romeHourFormatter.format(new Date(bar.time + 3600000)));
}
function buildFibEvents(bars) {
  const days=aggregateDaily(bars);
  const {swings}=createZones(days);
  const state=[];
  let cursor=0, previousClose=null;
  const events=[];
  for (const day of days) {
    while(cursor<swings.length && swings[cursor].confirmDate<=day.date) {
      const e=swings[cursor++];
      if(e.type==="BOTH") continue;
      const last=state[state.length-1];
      if(last && last.type===e.type) {
        const more=e.type==="H"?e.price>last.price:e.price<last.price;
        if(more) state[state.length-1]=e;
      } else state.push(e);
    }
    if(!day.closeTime) continue;
    const highs=state.filter(s=>s.type==="H"), lows=state.filter(s=>s.type==="L");
    if(!highs.length||!lows.length) continue;
    const h=highs[highs.length-1], l=lows[lows.length-1];
    // A bullish structural break needs a confirmed low after the high being broken.
    if(day.close>h.price && previousClose!==null && previousClose<=h.price && l.date>h.date) {
      const low=l.price, high=day.high, range=high-low;
      if(range>0) events.push({activationTime:day.closeTime,side:"LONG",low,high,origin:low,
        level618:high-range*0.618,level0:high,ext027:high+range*0.27,ext0618:high+range*0.618,
        breakDate:day.date});
    } else if(day.close<l.price && previousClose!==null && previousClose>=l.price && h.date>l.date) {
      const high=h.price, low=day.low, range=high-low;
      if(range>0) events.push({activationTime:day.closeTime,side:"SHORT",low,high,origin:high,
        level618:low+range*0.618,level0:low,ext027:low-range*0.27,ext0618:low-range*0.618,
        breakDate:day.date});
    }
    previousClose=day.close;
  }
  return events;
}
function backtestFibonacci(bars, targetMode="ext027") {
  if (!["ext027","ext0618","oppositeZone"].includes(targetMode)) throw new Error("Unknown target mode: "+targetMode);
  const events=buildFibEvents(bars);
  const days=aggregateDaily(bars), {zones}=createZones(days);
  let eventIndex=0, fib=null, position=null;
  const trades=[], rejected={outsideHours:0,noTargetZone:0,invalidatedBeforeEntry:0,invalidRR:0};
  function targetFor(f, entry, date) {
    if(targetMode==="ext027") return f.ext027;
    if(targetMode==="ext0618") return f.ext0618;
    if(targetMode==="oppositeZone") {
      const opposite=zones.filter(z=>!z.used&&!z.invalid&&z.createdDate<date&&
        ((f.side==="LONG"&&z.side==="SHORT"&&z.low>entry)||(f.side==="SHORT"&&z.side==="LONG"&&z.high<entry)))
        .sort((a,b)=>f.side==="LONG"?a.low-b.low:b.high-a.high)[0];
      if(!opposite) return null;
      f.targetZone=opposite;
      return f.side==="LONG"?opposite.low:opposite.high;
    }
    throw new Error("Unknown target mode: "+targetMode);
  }
  function close(bar, price, reason) {
    const p=position, R=p.side==="LONG"?(price-p.entry)/p.risk:(p.entry-price)/p.risk;
    trades.push({side:p.side,entryTime:new Date(p.entryTime).toISOString(),entry:p.entry,sl:p.origin,tp:p.tp,
      exitTime:new Date(bar.time).toISOString(),exit:price,reason,R:Number(R.toFixed(4)),rr:Number(p.rr.toFixed(4)),
      fibBreakDate:p.breakDate,targetMode});
    if(reason==="TP"&&p.targetZone) p.targetZone.used=true;
    position=null;
  }
  for(const bar of bars) {
    const date=sessionDate(bar.time);
    if(targetMode==="oppositeZone") {
      // A target blue zone must still be virgin at the time of entry.
      // Mark any earlier touch/cross before evaluating new Fibonacci entries.
      for(const z of zones) {
        if(z.used||z.invalid||date<=z.createdDate) continue;
        if(bar.high>=z.low&&bar.low<=z.high) z.invalid=true;
      }
  
    }
    while(eventIndex<events.length&&events[eventIndex].activationTime<=bar.time) {
      fib={...events[eventIndex++],belowSeen:false,armed:false,confirmationExtreme:null,invalid:false};
    }
    if(position && bar.time>=position.entryTime) {
      const stopHit=position.side==="LONG"?bar.low<=position.sl:bar.high>=position.sl;
      if(stopHit) close(bar,position.sl,position.sl===position.entry?"BE":"SL");
      else {
        const beHit=position.side==="LONG"?bar.high>=position.level0:bar.low<=position.level0;
        const tpHit=position.side==="LONG"?bar.high>=position.tp:bar.low<=position.tp;
        if(beHit&&tpHit) close(bar,position.entry,"BE");
        else if(beHit) position.sl=position.entry;
        else if(tpHit) close(bar,position.tp,"TP");
      }
    }
    if(!fib||fib.invalid||position||bar.time<fib.activationTime) continue;
    if(fib.side==="LONG"&&bar.low<=fib.origin || fib.side==="SHORT"&&bar.high>=fib.origin) {
      if(!fib.armed) { fib.invalid=true; rejected.invalidatedBeforeEntry++; }
      continue;
    }
    if(!fib.armed) {
      if(fib.side==="LONG") {
        if(!fib.belowSeen&&bar.close<fib.level618) fib.belowSeen=true;
        else if(fib.belowSeen&&bar.close>fib.level618) {
          fib.armed=true; fib.confirmationExtreme=bar.high;
        }
      } else {
        if(!fib.belowSeen&&bar.close>fib.level618) fib.belowSeen=true;
        else if(fib.belowSeen&&bar.close<fib.level618) {
          fib.armed=true; fib.confirmationExtreme=bar.low;
        }
      }
      continue;
    }
    const trigger=fib.side==="LONG"?bar.high>fib.confirmationExtreme:bar.low<fib.confirmationExtreme;
    if(!trigger) continue;
    const hour=hourRomeClose(bar);
    if(hour<9||hour>=18) { rejected.outsideHours++; fib.invalid=true; continue; }
    const entry=fib.side==="LONG"?Math.max(bar.open,fib.confirmationExtreme):Math.min(bar.open,fib.confirmationExtreme);
    const sl=fib.origin, risk=fib.side==="LONG"?entry-sl:sl-entry;
    const tp=targetFor(fib,entry,date);
    if(tp===null) { rejected.noTargetZone++; fib.invalid=true; continue; }
    const reward=fib.side==="LONG"?tp-entry:entry-tp;
    if(!(risk>0&&reward>0)) { rejected.invalidRR++; fib.invalid=true; continue; }
    position={side:fib.side,entry,entryTime:bar.time+3600000,sl,origin:sl,risk,tp,rr:reward/risk,
      level0:fib.level0,breakDate:fib.breakDate,targetZone:fib.targetZone};
    fib.invalid=true;
  }
  const wins=trades.filter(t=>t.R>0), losses=trades.filter(t=>t.R<0);
  const gp=wins.reduce((s,t)=>s+t.R,0), gl=-losses.reduce((s,t)=>s+t.R,0);
  let eq=0,peak=0,dd=0;
  for(const t of trades){eq+=t.R;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
  return {targetMode, fibEvents:events.length, closedTrades:trades.length,
    wins:wins.length,losses:losses.length,breakevens:trades.filter(t=>t.R===0).length,
    winRatePct:trades.length?Number((wins.length/trades.length*100).toFixed(2)):null,
    netR:Number(trades.reduce((s,t)=>s+t.R,0).toFixed(3)),
    avgR:trades.length?Number((trades.reduce((s,t)=>s+t.R,0)/trades.length).toFixed(4)):null,
    profitFactor:gl?Number((gp/gl).toFixed(3)):(gp?"Infinity":null),
    maxDrawdownR:Number(dd.toFixed(3)),rejected,trades};
}
module.exports={buildFibEvents,backtestFibonacci};
