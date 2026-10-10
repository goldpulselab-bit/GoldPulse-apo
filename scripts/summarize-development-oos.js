"use strict";
const fs=require("node:fs");
const path=require("node:path");
function stats(trades) {
  const wins=trades.filter(t=>Number(t.R)>0), losses=trades.filter(t=>Number(t.R)<0), be=trades.filter(t=>Number(t.R)===0);
  const gp=wins.reduce((s,t)=>s+Number(t.R),0), gl=-losses.reduce((s,t)=>s+Number(t.R),0);
  let equity=0,peak=0,dd=0;
  for(const t of trades){equity+=Number(t.R);peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}
  return {trades:trades.length,wins:wins.length,losses:losses.length,breakevens:be.length,
    winRateAllPct:trades.length?Number((wins.length/trades.length*100).toFixed(2)):null,
    winRateDecisivePct:(wins.length+losses.length)?Number((wins.length/(wins.length+losses.length)*100).toFixed(2)):null,
    netR:Number(trades.reduce((s,t)=>s+Number(t.R),0).toFixed(3)),
    avgR:trades.length?Number((trades.reduce((s,t)=>s+Number(t.R),0)/trades.length).toFixed(4)):null,
    profitFactor:gl?Number((gp/gl).toFixed(3)):(gp?"Infinity":null),maxDrawdownR:Number(dd.toFixed(3))};
}
function year(t){return new Date(t.entryTime).getUTCFullYear();}
function main(){
 const root=process.argv[2]||"backtest-results";
 const full=JSON.parse(fs.readFileSync(path.join(root,"summary.json"),"utf8"));
 const rows=[];
 for(const r of full.results){
  const blue=r.trades||[];
  for(const [period,pred] of [["development",y=>y>=2021&&y<=2023],["out_of_sample",y=>y>=2024&&y<=2025]]){
   rows.push({symbol:r.symbol,setup:"blueZone",period,...stats(blue.filter(t=>pred(year(t))))});
  }
  for(const [mode,f] of Object.entries(r.fibonacci||{})){
   for(const [period,pred] of [["development",y=>y>=2021&&y<=2023],["out_of_sample",y=>y>=2024&&y<=2025]]){
    rows.push({symbol:r.symbol,setup:"fibonacci_"+mode,period,...stats((f.trades||[]).filter(t=>pred(year(t))))});
   }
  }
 }
 const fields=["symbol","setup","period","trades","wins","losses","breakevens","winRateAllPct","winRateDecisivePct","netR","avgR","profitFactor","maxDrawdownR"];
 fs.writeFileSync(path.join(root,"development-oos.csv"),[fields.join(","),...rows.map(r=>fields.map(k=>r[k]??"").join(","))].join("\n")+"\n");
 const aggregate=[];
 for(const setup of [...new Set(rows.map(r=>r.setup))]) for(const period of ["development","out_of_sample"]){
  const trades=full.results.flatMap(r=>setup==="blueZone"?(r.trades||[]):(r.fibonacci?.[setup.replace("fibonacci_","")]?.trades||[])).filter(t=>period==="development"?(year(t)>=2021&&year(t)<=2023):(year(t)>=2024&&year(t)<=2025));
  aggregate.push({symbol:"ALL_SEPARATE_NOT_PORTFOLIO",setup,period,...stats(trades)});
 }
 fs.writeFileSync(path.join(root,"development-oos-aggregate.csv"),[fields.join(","),...aggregate.map(r=>fields.map(k=>r[k]??"").join(","))].join("\n")+"\n");
 console.log(JSON.stringify({files:["development-oos.csv","development-oos-aggregate.csv"],rows:rows.length,aggregate},null,2));
}
main();
