/* SprinklerMath engine - irrigation zone math. Pure functions, no DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SprinklerMath = api;
}(typeof self !== 'undefined' ? self : this, function () {

  // Head flow and pressure needs (typical residential).
  var HEAD_TYPES = {
    spray: { gpm: 1.5,  minPsi: 30, label: 'Spray head',  note: 'fast precipitation - runoff risk on clay and slopes' },
    rotor: { gpm: 3,    minPsi: 40, label: 'Rotor',       note: 'slow and even - long runtimes are normal, not a fault' },
    drip:  { gpm: 0.008, minPsi: 15, label: 'Drip emitter (0.5 GPH)', note: 'delivers water at the soil rate - almost never runs off' }
  };

  // Infiltration rate (in/hr): how fast each soil can drink.
  var SOILS = {
    sand: { rate: 0.8,  label: 'Sandy' },
    loam: { rate: 0.4,  label: 'Loam' },
    clay: { rate: 0.15, label: 'Clay' }
  };

  // Schedule-40 PVC actual inner diameters (inches).
  var PIPE_ID = { '3/4 in': 0.824, '1 in': 1.049, '1-1/4 in': 1.38 };
  var MAX_VELOCITY = 5; // ft/s - above this, hammer and wear

  function r2(x) { return Math.round(x * 100) / 100; }

  // Precipitation rate: inches per hour over the zone area.
  function precipRate(gpm, sqft) {
    if (sqft <= 0) return 0;
    return r2(96.25 * gpm / sqft);
  }

  // Pipe water velocity (ft/s) for a flow and pipe size.
  function pipeVelocity(gpm, pipeSize) {
    var id = PIPE_ID[pipeSize];
    if (!id) return null;
    return r2(0.4085 * gpm / (id * id));
  }

  // Heads one zone can run: 90% of supply, never more.
  function headsPerZone(supplyGpm, headGpm) {
    if (headGpm <= 0) return 0;
    return Math.max(1, Math.floor(supplyGpm * 0.9 / headGpm));
  }

  function zoneCount(headCount, perZone) {
    if (perZone <= 0) return 0;
    return Math.ceil(headCount / perZone);
  }

  // Minutes per week to deliver the water need at the zone's rate.
  function weeklyMinutes(needIn, pr) {
    if (pr <= 0) return 0;
    return r2(needIn / pr * 60);
  }

  // Longest single run before the soil stops keeping up (runoff point).
  function maxCycleMinutes(soilKey, pr) {
    var s = SOILS[soilKey];
    if (!s || pr <= 0) return null;
    return r2(s.rate / pr * 60);
  }

  // Split a session into run/soak cycles when the session exceeds the soil limit.
  function cyclePlan(sessionMin, maxCycleMin, soilKey) {
    if (maxCycleMin == null || sessionMin <= maxCycleMin) {
      return { cycles: 1, runMin: r2(sessionMin), soakMin: 0 };
    }
    var cycles = Math.ceil(sessionMin / maxCycleMin);
    return { cycles: cycles, runMin: r2(sessionMin / cycles), soakMin: soilKey === 'clay' ? 60 : 30 };
  }

  function fmtMin(min) {
    min = Math.round(min);
    if (min < 90) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }

  function checks(res, input) {
    var out = [];
    var head = HEAD_TYPES[input.headType] || HEAD_TYPES.spray;
    if (input.psi < head.minPsi) {
      out.push({ level: 'bad', text: 'Static pressure ' + input.psi + ' psi is under the ' + head.minPsi + ' psi a ' + head.label.toLowerCase() + ' needs - heads will drool, not spray.' });
    } else {
      out.push({ level: 'good', text: input.psi + ' psi covers the ' + head.minPsi + ' psi ' + head.label.toLowerCase() + ' minimum.' });
    }
    if (res.zoneGpm > input.supplyGpm) {
      out.push({ level: 'bad', text: 'Zone draws ' + res.zoneGpm + ' GPM from a ' + input.supplyGpm + ' GPM supply - split into more zones.' });
    } else {
      out.push({ level: 'good', text: 'Zone draws ' + res.zoneGpm + ' GPM of your ' + r2(input.supplyGpm * 0.9) + ' usable GPM (90% rule).' });
    }
    if (res.velocity != null && res.velocity > MAX_VELOCITY) {
      var next = input.pipeSize === '3/4 in' ? '1 in' : '1-1/4 in';
      out.push({ level: 'bad', text: 'Water moves ' + res.velocity + ' ft/s in the ' + input.pipeSize + ' pipe (max 5) - ' + next + ' pipe drops it to ' + pipeVelocity(res.zoneGpm, next) + ' ft/s.' });
    } else if (res.velocity != null) {
      out.push({ level: 'good', text: 'Velocity ' + res.velocity + ' ft/s in the ' + input.pipeSize + ' pipe is under the 5 ft/s limit.' });
    }
    var soil = SOILS[input.soil] || SOILS.loam;
    if (res.pr > soil.rate) {
      if (res.plan.cycles > 1) {
        out.push({ level: 'warn', text: 'Zone applies ' + res.pr + ' in/hr but ' + soil.label.toLowerCase() + ' only drinks ' + soil.rate + ' in/hr - past ' + res.maxCycleMin + ' min you are watering the street. Use the cycle-and-soak split below.' });
      } else {
        out.push({ level: 'warn', text: 'Zone applies ' + res.pr + ' in/hr but ' + soil.label.toLowerCase() + ' only drinks ' + soil.rate + ' in/hr - sessions stay under the ' + res.maxCycleMin + ' min runoff point, keep them that way.' });
      }
    } else {
      out.push({ level: 'good', text: 'Precipitation ' + res.pr + ' in/hr is under the ' + soil.rate + ' in/hr ' + soil.label.toLowerCase() + ' infiltration rate - no runoff.' });
    }
    if (input.headType === 'rotor' && res.pr < 0.4) {
      out.push({ level: 'warn', text: 'Rotor precipitation ' + res.pr + ' in/hr is slow - ' + fmtMin(res.weeklyMin) + ' a week is the honest number. Do not shorten it because it feels long.' });
    }
    if (res.zones > 1) {
      out.push({ level: 'warn', text: res.headCount + ' heads need ' + res.zones + ' zones (' + res.headsInZone + ' heads each) - one zone would starve them all equally.' });
    }
    return out;
  }

  function compute(input) {
    var head = HEAD_TYPES[input.headType] || HEAD_TYPES.spray;
    var supply = +input.supplyGpm, psi = +input.psi;
    var count = Math.round(+input.headCount);
    var area = +input.areaSqft, need = +(input.needInPerWeek || 1);
    var soil = input.soil || 'loam', pipe = input.pipeSize || '3/4 in';
    var headGpm = +(input.headGpm || head.gpm);
    if (!(supply > 0) || !(count > 0) || !(area > 0)) return { error: 'Supply GPM, head count, and area must be positive numbers.' };

    var perZone = headsPerZone(supply, headGpm);
    var zones = zoneCount(count, perZone);
    var headsInZone = Math.ceil(count / zones);
    var zoneGpm = r2(headsInZone * headGpm);
    var zoneArea = area / zones;
    var pr = precipRate(zoneGpm, zoneArea);
    var weekMin = weeklyMinutes(need, pr);
    var sessions = 3;
    var sessionMin = r2(weekMin / sessions);
    var maxCycle = maxCycleMinutes(soil, pr);
    var plan = cyclePlan(sessionMin, maxCycle, soil);

    var res = {
      perZone: perZone, zones: zones, headsInZone: headsInZone,
      zoneGpm: zoneGpm, zoneArea: r2(zoneArea), pr: pr,
      weeklyMin: weekMin, sessions: sessions, sessionMin: sessionMin,
      maxCycleMin: maxCycle, plan: plan,
      velocity: pipeVelocity(zoneGpm, pipe),
      headCount: count, headType: input.headType, soil: soil
    };
    res.checks = checks(res, { supplyGpm: supply, psi: psi, headType: input.headType, soil: soil, pipeSize: pipe });
    return res;
  }

  return {
    HEAD_TYPES: HEAD_TYPES, SOILS: SOILS, PIPE_ID: PIPE_ID, MAX_VELOCITY: MAX_VELOCITY,
    precipRate: precipRate, pipeVelocity: pipeVelocity, headsPerZone: headsPerZone,
    zoneCount: zoneCount, weeklyMinutes: weeklyMinutes, maxCycleMinutes: maxCycleMinutes,
    cyclePlan: cyclePlan, fmtMin: fmtMin, checks: checks, compute: compute
  };
}));
