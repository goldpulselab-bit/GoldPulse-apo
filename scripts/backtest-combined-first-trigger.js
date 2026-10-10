"use strict";
const fs=require("node:fs");
const path=require("node:path");
function metrics(trades){
 const wins=trades.filter(t=>t.R>0),losses=trades.filter(t=>t.R<0),be=trades.filter(t=>t.R===0);
 const gp=wins.reduce((s,t)=>s+t.R,0),gl=-losses.reduce((s,t)=>s+t.R,0);
 let eq=0,peak=0,dd=0;for(const t of trades){eq+=t.R;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
 return {trades:trades.length,wins:wins.length,losses:losses.length,breakevens:be.length,
  winRateAllPct:trades.length?+(wins.length/trades.length*100).toFixed(2):null,
  winRateDecisivePct:wins.length+losses.length?+(wins.length/(wins.length+losses.length)*100).toFixed(2):null,
  netR:+trades.reduce((s,t)=>s+t.R,0).toFixed(3),avgR:trades.length?+(trades.reduce((s,t)=>s+t.R,0)/trades.length).toFixed(4):null,
  profitFactor:gl?+(gp/gl).toFixed(3):(gp?"Infinity":null),maxDrawdownR:+dd.toFixed(3)};
}
function year(t){return new Date(t.entryTime).getUTCFullYear();}
function combine(blue,fib){
 const all=[...blue.map(t=>({...t,setup:"blueZone"})),...fib.map(t=>({...t,setup:"fibonacci"}))].sort((a,b)=>Date.parse(a.entryTime)-Date.parse(b.entryTime));
 const chosen=[], skipped={overlap:0,sameEntryTimeAmbiguity:0}; let activeUntil=-Infinity;
 for(let i=0;i<all.length;){
  const ts=Date.parse(all[i].entryTime);let j=i+1;while(j<all.length&&Date.parse(all[j].entryTime)===ts)j++;
  if(j-i>1){skipped.sameEntryTimeAmbiguity+=j-i;i=j;continue;}
  const t=all[i];
  if(ts<activeUntil){skipped.overlap++;i++;continue;}
  chosen.push(t);activeUntil=Date.parse(t.exitTime);i++;
 }
 return {trades:chosen,skipped};
}
function main(){
 const root=process.argv[2]||"backtest-results";
 const full=JSON.parse(fs.readFileSync(path.join(root,"summary.json"),"utf8"));
 const rows=[],detail=[];
 for(const r of full.results) for(const [mode,f] of Object.entries(r.fibonacci||{})){
  const c=combine(r.trades||[],f.trades||[]);
  for(const [period,pred] of [["full_2021_2025",()=>true],["development_2021_2023",y=>y>=2021&&y<=2023],["out_of_sample_2024_2025",y=>y>=2024&&y<=2025]]){
   const ts=c.trades.filter(t=>pred(year(t)));
   rows.push({symbol:r.symbol,fibTarget:mode,period,...metrics(ts),skippedOverlap:c.skipped.overlap,skippedSameTime:c.skipped.sameEntryTimeAmbiguity});
   for(const t of ts) detail.push({symbol:r.symbol,fibTarget:mode,...t});
  }
 }
 const fields=["symbol","fibTarget","period","trades","wins","losses","breakevens","winRateAllPct","winRateDecisivePct","netR","avgR","profitFactor","maxDrawdownR","skippedOverlap","skippedSameTime"];
 fs.writeFileSync(path.join(root,"combined-first-trigger-summary.csv"),[fields.join(","),...rows.map(r=>fields.map(k=>r[k]??"").join(","))].join("\n")+"\n");
 const tf=["symbol","fibTarget","setup","side","entryTime","entry","sl","tp","exitTime","exit","reason","R","rr"];
 fs.writeFileSync(path.join(root,"combined-first-trigger-trades.csv"),[tf.join(","),...detail.map(t=>tf.map(k=>t[k]??"").join(","))].join("\n")+"\n");
 console.log(JSON.stringify({files:["combined-first-trigger-summary.csv","combined-first-trigger-trades.csv"],rows:rows.length,preview:rows.filter(r=>r.period==="out_of_sample_2024_2025")},null,2));
}
main();
