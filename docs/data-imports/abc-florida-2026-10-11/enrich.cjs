const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const rows = JSON.parse(fs.readFileSync(path.join(base, 'stores-source.json'), 'utf8'));
const output = path.join(base, 'county-evidence.json');
const evidence = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
let next = 0;
async function worker() {
  while (next < rows.length) {
    const row = rows[next++];
    if (evidence[row.store_code]?.county) continue;
    const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
    url.search = new URLSearchParams({ x: row.longitude, y: row.latitude, benchmark: 'Public_AR_Current', vintage: 'Current_Current', format: 'json', layers: 'Counties' });
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const counties = raw.result?.geographies?.Counties;
      if (counties?.length !== 1 || counties[0].STATE !== '12') throw new Error('Expected one Florida county');
      evidence[row.store_code] = { county: counties[0].BASENAME, fips: counties[0].GEOID, sourceUrl: url.href, retrievedAt: new Date().toISOString(), raw };
    } catch (error) {
      evidence[row.store_code] = { error: error.message, sourceUrl: url.href };
    }
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  }
}
Promise.all(Array.from({ length: 4 }, worker)).then(() => console.log(JSON.stringify({ count: rows.length, counties: Object.values(evidence).filter(r => r.county).length, errors: Object.entries(evidence).filter(([,r])=>r.error).map(([id,r])=>({id,error:r.error})) })));
