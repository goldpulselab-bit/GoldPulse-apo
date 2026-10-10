/* Deterministic H1 setup detectors for GoldPulse Lab.
 * Input candles must be chronological, completed OHLC bars.
 * This module detects setup sequences only; it does not place orders or model costs.
 */
(function (root) {
  "use strict";

  function inside(c, zone) {
    return Number(c.close) >= zone.low && Number(c.close) <= zone.high;
  }

  function validate(candles) {
    if (!Array.isArray(candles)) throw new TypeError("candles must be an array");
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (!c || !["time", "open", "high", "low", "close"].every(k => Number.isFinite(Number(c[k])))) {
        throw new TypeError("Invalid candle at index " + i);
      }
      if (Number(c.high) < Math.max(Number(c.open), Number(c.close), Number(c.low)) ||
          Number(c.low) > Math.min(Number(c.open), Number(c.close), Number(c.high))) {
        throw new RangeError("Inconsistent OHLC at index " + i);
      }
      if (i && Number(c.time) < Number(candles[i - 1].time)) {
        throw new RangeError("Candles must be chronological");
      }
    }
  }

  // side SHORT expects a Swing High zone; LONG expects a Swing Low zone.
  // First completed close inside the zone arms the setup; a later close outside
  // the near edge confirms it. A full traversal before arming invalidates the zone.
  function detectZoneCloseSequence(candles, zone, side) {
    validate(candles);
    if (!zone || !Number.isFinite(Number(zone.low)) || !Number.isFinite(Number(zone.high)) ||
        Number(zone.low) >= Number(zone.high) || !["LONG", "SHORT"].includes(side)) {
      throw new TypeError("Invalid zone or side");
    }
    const nearEdge = side === "SHORT" ? Number(zone.low) : Number(zone.high);
    const farEdge = side === "SHORT" ? Number(zone.high) : Number(zone.low);
    let armedAt = -1;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i], close = Number(c.close);
      if (armedAt < 0) {
        if (inside(c, zone)) {
          armedAt = i;
          continue;
        }
        const traverses = Number(c.low) <= Number(zone.low) && Number(c.high) >= Number(zone.high);
        const closesBeyondFarEdge = side === "SHORT" ? close < Number(zone.low) : close > Number(zone.high);
        if (traverses && closesBeyondFarEdge) {
          return { status: "INVALIDATED", index: i, time: c.time, reason: "full-zone-traversal-before-arming" };
        }
      } else if (i > armedAt) {
        const exits = side === "SHORT" ? close < nearEdge : close > nearEdge;
        if (exits) return { status: "CONFIRMED", side, armedIndex: armedAt, index: i, time: c.time, entry: close };
      }
    }
    return { status: armedAt >= 0 ? "ARMED" : "WAITING", armedIndex: armedAt };
  }

  // Fib retracement setup: LONG = close below level, later close above, then break
  // of the confirmation candle high. SHORT is the inverse. Break must occur on a
  // subsequent bar, avoiding use of the confirmation bar's unknown intrabar path.
  function detectFib61Trigger(candles, level, side) {
    validate(candles);
    const fib = Number(level);
    if (!Number.isFinite(fib) || !["LONG", "SHORT"].includes(side)) throw new TypeError("Invalid Fib level or side");
    let crossedAwayAt = -1;
    let confirm = null;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i], close = Number(c.close);
      if (!confirm) {
        const away = side === "LONG" ? close < fib : close > fib;
        if (away) crossedAwayAt = i;
        const returned = side === "LONG" ? close > fib : close < fib;
        if (crossedAwayAt >= 0 && i > crossedAwayAt && returned) confirm = { index: i, time: c.time, trigger: side === "LONG" ? Number(c.high) : Number(c.low) };
      } else if (i > confirm.index) {
        const triggered = side === "LONG" ? Number(c.high) >= confirm.trigger : Number(c.low) <= confirm.trigger;
        if (triggered) return { status: "TRIGGERED", side, confirmationIndex: confirm.index, confirmationTime: confirm.time, triggerIndex: i, triggerTime: c.time, triggerPrice: confirm.trigger };
      }
    }
    if (confirm) return { status: "ARMED", side, confirmationIndex: confirm.index, confirmationTime: confirm.time, triggerPrice: confirm.trigger };
    return { status: crossedAwayAt >= 0 ? "WAITING_FOR_RETURN_CLOSE" : "WAITING_FOR_FIRST_CLOSE", crossedAwayIndex: crossedAwayAt };
  }

  const api = { detectZoneCloseSequence, detectFib61Trigger };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoldPulseSetupDetectors = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
