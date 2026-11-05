/* Builds data/geo/county-shapes/<ST>.json, the county maps the state
   portal's Regions section draws.

   Source: us-atlas@3 counties-10m.json (US Census cartographic boundary
   files, public domain; packaging ISC). Run from a folder where
   us-atlas@3, topojson-client@3 and d3-geo@3 are installed:

     node scripts/build_county_shapes.js /path/to/node_modules /path/to/repo

   Each file: { w, h, counties: [{ n: name, f: fips, d: svg path }] }.
   Every state is drawn with a transverse Mercator projection centred on
   it, so shapes keep their real proportions (and Alaska's Aleutians do
   not wrap around the map). */
const path = require('path');
const fs = require('fs');
const [nm, repo] = process.argv.slice(2);
const topo = require(path.join(nm, 'us-atlas/counties-10m.json'));
const { feature } = require(path.join(nm, 'topojson-client'));
const d3 = require(path.join(nm, 'd3-geo'));

const regions = JSON.parse(fs.readFileSync(path.join(repo, 'data/geo/regions.json'), 'utf8')).US;
const nameToCode = Object.fromEntries(regions.map(r => [r[1], r[0]]));
const states = feature(topo, topo.objects.states).features;
const counties = feature(topo, topo.objects.counties).features;
const out = path.join(repo, 'data/geo/county-shapes');
fs.mkdirSync(out, { recursive: true });

/* Independent cities (Virginia, Baltimore, St. Louis) carry the same bare
   name as a county - Richmond city and Richmond County are both
   "Richmond" in the source. Census county codes 510 and up are the
   cities; call them "X city", the spelling the ZIP list uses. */
function displayName(c) {
  const n = c.properties.name;
  const county = +c.id.slice(2);
  const st = c.id.slice(0, 2);
  if (county >= 510 && ['51', '24', '29'].includes(st) && !/city$/i.test(n)) return n + ' city';
  return n;
}

const W = 800;
const list = {};
for (const st of states) {
  const code = nameToCode[st.properties.name];
  if (!code) { console.warn('skip', st.properties.name); continue; }
  const mine = counties.filter(c => c.id.slice(0, 2) === st.id);
  if (!mine.length) continue;
  const [lon] = d3.geoCentroid(st);
  const proj = d3.geoTransverseMercator().rotate([-lon, 0]);
  const fc = { type: 'FeatureCollection', features: mine };
  proj.fitWidth(W - 20, fc);
  const [[x0, y0], [x1, y1]] = d3.geoPath(proj).bounds(fc);
  const h = Math.ceil(y1 - y0 + 20);
  proj.translate([proj.translate()[0] - x0 + 10, proj.translate()[1] - y0 + 10]);
  const gp = d3.geoPath(proj).digits(1);
  const shapes = mine
    .map(c => ({ n: displayName(c), f: c.id, d: gp(c) }))
    .filter(c => c.d)
    .sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(out, code + '.json'), JSON.stringify({ w: W, h, counties: shapes }));
  list[code] = shapes.map(c => c.n);
}
// The plain county list the region editor and the overview use.
fs.writeFileSync(path.join(repo, 'data/geo/counties.json'),
  JSON.stringify(Object.fromEntries(Object.entries(list).sort())));
console.log(Object.keys(list).length, 'states');
