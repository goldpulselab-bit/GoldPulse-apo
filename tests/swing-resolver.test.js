const assert = require("node:assert/strict");
const { resolveAlternatingSwings } = require("../src/swing-resolver.js");

const result = resolveAlternatingSwings([
  {type:"HIGH",index:1,time:1,confirmedAt:2,price:10},
  {type:"HIGH",index:3,time:3,confirmedAt:4,price:12},
  {type:"LOW",index:4,time:4,confirmedAt:5,price:7},
  {type:"LOW",index:6,time:6,confirmedAt:7,price:8},
  {type:"LOW",index:8,time:8,confirmedAt:9,price:6},
  {type:"BOTH",index:9,time:9,confirmedAt:10,high:15,low:5}
]);
assert.deepEqual(result.swings.map(s=>[s.type,s.price]), [["HIGH",12],["LOW",6]]);
assert.equal(result.specialMarkers.length,1);
assert.equal(result.specialMarkers[0].verticalMarker,true);
console.log("GoldPulse swing resolver tests: PASS");
