"use strict";
const fs=require("node:fs"),path=require("node:path");
const SYMBOLS=["XAUUSD","XAGUSD","DAX","DJ","NQ","SP500","WTI"];
const YEARS=[2021,2022,2023,2024,2025];
function load(symbol,root){
 const out=[];for(const y of YEARS){const f=path.join(root,symbol,"H1",y+".json");for(const r of JSON.parse(fs.readFileSync(f,"utf8"))){const b={time:+r.ts*1000,open:+r.o,high:+r.h,low:+r.l,close:+r.c};if(Number.isFinite(b.time)&&[b.open,b.high,b.low,b.close].every(Number.isFinite))out.push(b);}}
 out.sort((a,b)=>a.time-b.time);return out.filter((b,i)=>!i||b.time!==out[i-1].time);
}
function ema(values,n){const out=Array(values.length).fill(null),k=2/(n+1);let prev=null;for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))continue;prev=prev===null?values[i]:values[i]*k+prev*(1-k);out[i]=prev;}return out;}
function rsi(bars,n=14){const out=Array(bars.length).fill(null);let gain=0,loss=0;for(let i=1;i<=n;i++){const d=bars[i].close-bars[i-1].close;gain+=Math.max(0,d);loss+=Math.max(0,-d);}let ag=gain/n,al=loss/n;out[n]=al===0?100:100-100/(1+ag/al);for(let i=n+1;i<bars.length;i++){const d=bars[i].close-bars[i-1].close;ag=(ag*(n-1)+Math.max(0,d))/n;al=(al*(n-1)+Math.max(0,-d))/n;out[i]=al===0?100:100-100/(1+ag/al);}return out;}
function atr(bars,n=14){const tr=Array(bars.length).fill(null),out=Array(bars.length).fill(null);for(let i=1;i<bars.length;i++)tr[i]=Math.max(bars[i].high-bars[i].low,Math.abs(bars[i].high-bars[i-1].close),Math.abs(bars[i].low-bars[i-1].close));let sum=0;for(let i=1;i<=n;i++)sum+=tr[i];out[n]=sum/n;for(let i=n+1;i<bars.length;i++)out[i]=(out[i-1]*(n-1)+tr[i])/n;return out;}
function adx(bars,n=14){const tr=[],pdm=[],mdm=[];for(let i=0;i<bars.length;i++){if(i===0){tr.push(null);pdm.push(0);mdm.push(0);continue;}const up=bars[i].high-bars[i-1].high,down=bars[i-1].low-bars[i].low;tr.push(Math.max(bars[i].high-bars[i].low,Math.abs(bars[i].high-bars[i-1].close),Math.abs(bars[i].low-bars[i-1].close)));pdm.push(up>down&&up>0?up:0);mdm.push(down>up&&down>0?down:0);}
 const smooth=a=>{const o=Array(a.length).fill(null);let s=0;for(let i=1;i<=n;i++)s+=a[i]||0;o[n]=s;for(let i=n+1;i<a.length;i++)o[i]=o[i-1]-o[i-1]/n+(a[i]||0);return o;};
 const st=smooth(tr),sp=smooth(pdm),sm=smooth(mdm),dx=Array(bars.length).fill(null),out=Array(bars.length).fill(null);
 for(let i=n;i<bars.length;i++){if(st[i]>0){const p=100*sp[i]/st[i],m=100*sm[i]/st[i];dx[i]=p+m?100*Math.abs(p-m)/(p+m):0;}}
 let sum=0,c=0;for(let i=n;i<bars.length;i++){if(dx[i]===null)continue;sum+=dx[i];c++;if(c===n){out[i]=sum/n;break;}}
 let first=out.findIndex(v=>v!==null);for(let i=first+1;i<bars.length;i++)if(dx[i]!==null)out[i]=(out[i-1]*(n-1)+dx[i])/n;
 return out;
}
function stats(trades,costR=0){
 const vals=trades.map(t=>t.R-costR),wins=vals.filter(x=>x>0),losses=vals.filter(x=>x<0),grossP=wins.reduce((s,x)=>s+x,0),grossL=-losses.reduce((s,x)=>s+x,0);
 let eq=1,peak=1,dd=0,maxWin=0,maxLoss=0,cw=0,cl=0;for(const x of vals){eq*=1+x*0.005;peak=Math.max(peak,eq);dd=Math.max(dd,(peak-eq)/peak);if(x>0){cw++;cl=0;maxWin=Math.max(maxWin,cw);}else if(x<0){cl++;cw=0;maxLoss=Math.max(maxLoss,cl);}else{cw=0;cl=0;}}
 let cum=0,high=0,ddR=0;for(const x of vals){cum+=x;high=Math.max(high,cum);ddR=Math.max(ddR,high-cum);}
 return {trades:vals.length,wins:wins.length,losses:losses.length,winRatePct:vals.length?+(wins.length/vals.length*100).toFixed(2):null,netR:+vals.reduce((s,x)=>s+x,0).toFixed(3),avgR:vals.length?+(vals.reduce((s,x)=>s+x,0)/vals.length).toFixed(4):null,profitFactor:grossL?+(grossP/grossL).toFixed(3):(grossP?"Infinity":null),maxDrawdownPct:+(dd*100).toFixed(2),maxDrawdownR:+ddR.toFixed(3),maxConsecutiveWins:maxWin,maxConsecutiveLosses:maxLoss};
}
function run(bars,par){
 const close=bars.map(b=>b.close),e50=ema(close,50),e200=ema(close,200),rv=rsi(bars,14),av=atr(bars,14),dx=adx(bars,14),trades=[];let pos=null;
 function closePos(i,price,reason){const p=pos;const r=p.side==="LONG"?(price-p.entry)/p.risk:(p.entry-price)/p.risk;trades.push({side:p.side,entryTime:new Date(bars[p.i].time).toISOString(),entry:p.entry,sl:p.sl,tp:p.tp,exitTime:new Date(bars[i].time).toISOString(),exit:price,reason,R:+r.toFixed(5),entryYear:new Date(bars[p.i].time).getUTCFullYear()});pos=null;}
 for(let i=201;i<bars.length;i++){
  const b=bars[i];
  if(pos){const stop=pos.side==="LONG"?b.low<=pos.sl:b.high>=pos.sl;const target=pos.side==="LONG"?b.high>=pos.tp:b.low<=pos.tp;
   if(stop&&target)closePos(i,pos.sl,"SL_same_bar");
   else if(stop)closePos(i,pos.sl,"SL");else if(target)closePos(i,pos.tp,"TP");else if(i-pos.i>=par.maxBars)closePos(i,b.close,"TIME");
  }
  if(pos||i<2||!av[i]||!e200[i]||rv[i]===null||dx[i]===null)continue;
  if(par.adx>0&&dx[i]<par.adx)continue;
  const long=b.close>e200[i]&&e50[i]>e200[i]&&rv[i-1]<par.longTrigger&&rv[i]>=par.longTrigger;
  const short=b.close<e200[i]&&e50[i]<e200[i]&&rv[i-1]>par.shortTrigger&&rv[i]<=par.shortTrigger;
  if(!long&&!short)continue;
  const j=i+1;if(j>=bars.length)break;
  const side=long?"LONG":"SHORT",entry=bars[j].open,risk=av[i]*par.slAtr;
  const sl=side==="LONG"?entry-risk:entry+risk,tp=side==="LONG"?entry+risk*par.tpR:entry-risk*par.tpR;
  pos={side,i:j,entry,risk,sl,tp};
 }
 if(pos)closePos(bars.length-1,bars[bars.length-1].close,"END");
 return trades;
}
function main(){
 const root=process.argv[2]||"data",out=process.argv[3]||"strategy-research";fs.mkdirSync(out,{recursive:true});
 const params=[];
 for(const trigger of [35,40,45,50])for(const tpR of [0.4,0.5,0.6,0.7,0.8])for(const slAtr of [1.2,1.5])for(const adxLevel of [0,18,22])params.push({name:"EMA50-200_RSI"+trigger+"_TP"+tpR+"_SL"+slAtr+"_ADX"+adxLevel,longTrigger:trigger,shortTrigger:100-trigger,tpR,slAtr,adx:adxLevel,maxBars:24});
 const symbolsToRun=SYMBOLS.filter(symbol=>fs.existsSync(path.join(root,symbol,"H1","2021.json")));
 if(!symbolsToRun.includes("XAUUSD"))throw new Error("XAUUSD H1 history is required for development and out-of-sample selection.");
 const allBars=Object.fromEntries(symbolsToRun.map(symbol=>[symbol,load(symbol,root)]));
 const candidates=params.map(p=>{const trades=run(allBars.XAUUSD,p),dev=trades.filter(t=>t.entryYear>=2021&&t.entryYear<=2023),oos=trades.filter(t=>t.entryYear>=2024&&t.entryYear<=2025);return {params:p,dev:stats(dev),oos:stats(oos),all:stats(trades),cost03:stats(dev,0.03),oosCost03:stats(oos,0.03),cost05:stats(dev,0.05),oosCost05:stats(oos,0.05),trades};});
 const score=x=>{const m=x.dev;if(m.trades<100||m.profitFactor===null||m.profitFactor==="Infinity"||m.profitFactor<1.0)return -100+m.trades/100;return (m.winRatePct||0)+Math.min(m.profitFactor,2)*0.25+Math.log(Math.max(1,m.trades)/100)/20;};
 candidates.sort((a,b)=>score(b)-score(a));const best=candidates[0];
 const rows=[],tradeRows=[],results={};
 for(const symbol of symbolsToRun){
  const trades=run(allBars[symbol],best.params),dev=trades.filter(t=>t.entryYear>=2021&&t.entryYear<=2023),oos=trades.filter(t=>t.entryYear>=2024&&t.entryYear<=2025);
  results[symbol]={selectedParams:best.params,development:stats(dev),outOfSample:stats(oos),all:stats(trades),developmentCost003R:stats(dev,0.03),outOfSampleCost003R:stats(oos,0.03),developmentCost005R:stats(dev,0.05),outOfSampleCost005R:stats(oos,0.05),selectionNote:symbol==="XAUUSD"?"Parameters selected on XAUUSD development period 2021-2023 only.":"Same XAUUSD-selected parameters applied without re-optimizing this instrument."};
  for(const [period,ts] of [["development",dev],["outOfSample",oos],["all",trades]])rows.push({symbol,variant:best.params.name,period,...stats(ts)});
  for(const t of trades)tradeRows.push({symbol,variant:best.params.name,...t});
 }
 const header=["symbol","variant","period","trades","wins","losses","winRatePct","netR","avgR","profitFactor","maxDrawdownPct","maxDrawdownR","maxConsecutiveWins","maxConsecutiveLosses"];
 fs.writeFileSync(path.join(out,"selected-summary.csv"),[header.join(","),...rows.map(r=>header.map(k=>r[k]??"").join(","))].join("\n")+"\n");
 const gridHeader=["variant","devTrades","devWinRatePct","devNetR","devProfitFactor","devMaxDDPct","devMaxWinStreak","devMaxLossStreak","oosTrades","oosWinRatePct","oosNetR","oosProfitFactor","oosMaxDDPct"];
 fs.writeFileSync(path.join(out,"gold-parameter-grid.csv"),[gridHeader.join(","),...candidates.map(x=>[x.params.name,x.dev.trades,x.dev.winRatePct,x.dev.netR,x.dev.profitFactor,x.dev.maxDrawdownPct,x.dev.maxConsecutiveWins,x.dev.maxConsecutiveLosses,x.oos.trades,x.oos.winRatePct,x.oos.netR,x.oos.profitFactor,x.oos.maxDrawdownPct].join(","))].join("\n")+"\n");
 const chosenHeader=["symbol","variant","side","entryTime","entry","sl","tp","exitTime","exit","reason","R","entryYear"];
 fs.writeFileSync(path.join(out,"selected-trades.csv"),[chosenHeader.join(","),...tradeRows.map(t=>chosenHeader.map(k=>t[k]??"").join(","))].join("\n")+"\n");
 fs.writeFileSync(path.join(out,"selected-summary.json"),JSON.stringify({title:"EMA trend + RSI pullback H1 research",source:"EV Trading Labs historical H1 OHLC data",period:"2021-2025",selection:"A single parameter set is selected on XAUUSD 2021-2023 only, then frozen and applied to 2024-2025 and other instruments. The 65% win rate is a target, never a forced outcome.",execution:"Signal on completed H1 close; enter next H1 open; ATR(14) stop; fixed TP in R; one position at a time; same-bar SL/TP assumes SL first; time exit after 24 bars; cost stress assumes 0.03R and 0.05R per trade, not broker-verified spread.",costStressRPerTrade:[0,0.03,0.05],selectedParams:best.params,developmentSelectionStats:best.dev,developmentCost003R:best.cost03,developmentCost005R:best.cost05,results},null,2));
 console.log(JSON.stringify({selectedParams:best.params,goldDevelopment:best.dev,goldOutOfSample:best.oos,goldDevelopmentCost003R:best.cost03,goldOutOfSampleCost003R:stats(best.trades.filter(t=>t.entryYear>=2024&&t.entryYear<=2025),0.03),results,gridCandidates:params.length},null,2));
}
main();
