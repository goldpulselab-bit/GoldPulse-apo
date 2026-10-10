/* Alternation resolver for confirmed Daily swing candidates.
 * Candidates must be sorted by confirmedAt, then source index. This stage is deterministic,
 * but equal-price and BOTH-candidate cases are kept explicit for auditability.
 */
(function (root) {
  "use strict";

  function resolveAlternatingSwings(candidates) {
    if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
    const ordered = candidates.slice().sort((a, b) =>
      Number(a.confirmedAt) - Number(b.confirmedAt) || Number(a.index) - Number(b.index));
    const swings = [];
    const specialMarkers = [];
    for (const c of ordered) {
      if (!c || !["HIGH", "LOW", "BOTH"].includes(c.type)) continue;
      if (c.type === "BOTH") {
        specialMarkers.push({
          type: "BOTH", index: c.index, time: c.time, confirmedAt: c.confirmedAt,
          high: Number(c.high), low: Number(c.low), verticalMarker: true
        });
        // Preserve the rare dual-extreme candle as a visible/auditable event, not two
        // consecutive ordinary swing points.
        continue;
      }
      const price = Number(c.price ?? (c.type === "HIGH" ? c.high : c.low));
      if (!Number.isFinite(price)) throw new TypeError("Swing candidate has no finite price");
      const item = { ...c, price };
      const last = swings[swings.length - 1];
      if (!last || last.type !== item.type) {
        swings.push(item);
        continue;
      }
      const moreExtreme = item.type === "HIGH" ? item.price > last.price : item.price < last.price;
      // Same-type confirmation before an opposite swing updates the structural extreme.
      // Keep the latest confirmation metadata because that is when the update became known.
      if (moreExtreme) swings[swings.length - 1] = item;
    }
    return { swings, specialMarkers };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { resolveAlternatingSwings };
  root.GoldPulseSwingResolver = { resolveAlternatingSwings };
})(typeof globalThis !== "undefined" ? globalThis : this);
