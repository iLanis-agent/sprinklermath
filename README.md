# SprinklerMath

Sprinkler zone math for people standing in the irrigation aisle. Heads are sold
by spray radius, but zones fail on GPM, and the advice to water deep and
infrequent never says how many minutes that actually is for your soil.

## What it does

- **Zone splits from your real supply**: heads per zone at 90% of measured
  hose-bib GPM, so no zone starves.
- **Precipitation rate** per zone (96.25 x GPM / sq ft), and the honest weekly
  runtime it implies for your water need in inches.
- **Soil infiltration check**: sand 0.8, loam 0.4, clay 0.15 in/hr. When the
  zone applies water faster than the ground drinks it, you get a
  **cycle-and-soak split** (run minutes, soak minutes, cycle count) instead of
  a flooded sidewalk.
- **Pipe velocity check** in schedule-40 PVC (5 ft/s limit) with the
  next-size-up recommendation.
- **Pressure minimums** by head type: sprays 30 psi, rotors 40, drip 15.
- Rotor runtime honesty: slow precipitation means long runtimes, and shortening
  them because they feel long is how lawns die.

## Quickstart

Static site, no build step. Open `index.html` or serve the folder:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Architecture

| File | Purpose |
| --- | --- |
| `index.html` | Landing page |
| `app.html` | The calculator: supply, system, schedule, cycle-and-soak plan |
| `engine.js` | Pure irrigation math, no DOM (shared by app and tests) |
| `test-engine.js` | `node test-engine.js` - 44 assertions |

## The math

- Heads per zone: `floor(supplyGPM x 0.9 / headGPM)`, minimum 1.
- Zones: `ceil(headCount / headsPerZone)`, heads balanced across zones.
- Precipitation rate (in/hr): `96.25 x zoneGPM / zoneAreaSqft`.
- Weekly runtime (min): `needInches / PR x 60`, split into 3 sessions.
- Soil runoff limit (min): `soilRate / PR x 60`; sessions over the limit split
  into cycles with 30 min soak (60 on clay).
- Pipe velocity (ft/s): `0.4085 x GPM / innerDiameter^2` (3/4 in = 0.824,
  1 in = 1.049, 1-1/4 in = 1.38).

## References

- Hunter / Rain Bird residential design guides: 5 ft/s velocity limit,
  matched precipitation, cycle-and-soak for slopes and clay.
- USDA NRCS soil intake rates (simplified): sand 0.8, loam 0.4, clay 0.15 in/hr.

## License

MIT
