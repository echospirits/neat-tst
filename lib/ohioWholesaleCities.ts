// Recovered from the September 19 city-correction evidence, extended by the
// owner's October 14 list. West Chester supersedes the older Westchester value.
export const OHIO_WHOLESALE_CITY_CORRECTIONS: Readonly<Record<string, string>> = {
  'ARLINGTON HGTS': 'Arlington Heights',
  'BEDFORD HGTS': 'Bedford Heights',
  'BERLIN HGTS': 'Berlin Heights',
  'BROADVIEW HGTS': 'Broadview Heights',
  'CLEVELAND HGTS': 'Cleveland Heights',
  'CUYAHOGA HGTS': 'Cuyahoga Heights',
  'GARFIELD HGTS': 'Garfield Heights',
  'GENEVA ON THE LAKE': 'Geneva',
  'GRANDVIEW HGTS': 'Grandview Heights',
  'HIGHLAND HGTS': 'Highland Heights',
  'HUBER HGTS': 'Huber Heights',
  'LEWIS CTR': 'Lewis Center',
  'LINCOLN HGTS': 'Lincoln Heights',
  'MAPLE HGTS': 'Maple Heights',
  'MAYFIELD HGTS': 'Mayfield Heights',
  'MIDDLEBURG HGTS': 'Middleburg Heights',
  'MT VERNON': 'Mount Vernon',
  'PARMA HGTS': 'Parma Heights',
  'RICHMOND HGTS': 'Richmond Heights',
  'SHAKER HGTS': 'Shaker Heights',
  'UNIVERSITY HGTS': 'University Heights',
  'W CHESTER': 'West Chester',
  'WESTCHESTER': 'West Chester',
  'WARRENSVILLE HGTS': 'Warrensville Heights',
  'WASHINGTON CT HOUSE': 'Washington Court House',
  'STONE CRK': 'Stone Creek',
  'ST HENRY': 'Saint Henry',
  'MINGO JCT': 'Mingo Junction',
  'WASHINGTON CH': 'Washington Court House',
  'BLACK LICK': 'Blacklick',
  'FAIRFIELD TWP': 'Fairfield Township',
};

export const ohioCityKey = (value: string | null | undefined) =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export const isOhioCityScope = (state: string | null | undefined) =>
  ['', 'OH', 'OHIO'].includes(ohioCityKey(state));

export const ohioWholesaleCityRules = () => [...new Map([
  ...Object.entries(OHIO_WHOLESALE_CITY_CORRECTIONS),
  ...Object.values(OHIO_WHOLESALE_CITY_CORRECTIONS).map((city) => [ohioCityKey(city), city] as const),
]).entries()];

const cityRules = new Map(ohioWholesaleCityRules());

export function normalizeOhioWholesaleCity(city: string | null, state: string | null = 'OH') {
  return isOhioCityScope(state) ? cityRules.get(ohioCityKey(city)) ?? city : city;
}
