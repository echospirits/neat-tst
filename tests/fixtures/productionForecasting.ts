import { forecastProduct } from '../../lib/productionForecasting/engine';
import { days, type DemandSeries, type ForecastProduct } from '../../lib/productionForecasting/model';
import { summaryFor } from '../../lib/productionForecasting/service';
const asOf = '2026-10-26';
export const fixtureProduct: ForecastProduct = { id: 'example-rum', market: 'OH', code: '2847B', name: 'Echo Spirits Rum · example' };
const series: DemandSeries[] = ['GPT', 'GRN'].map((code, location) => ({ market: 'OH', itemCode: '2847B', location: { code, name: code === 'GPT' ? 'Groveport' : 'Green' }, coverage: [{ start: '2024-01-01', end: asOf }], observations: days('2024-01-01', asOf).map((date, i) => ({ date, availableOn: date, cases: i % (location ? 14 : 7) === 0 ? 4 : 0, classification: 'A3A_BAIL' as const })) }));
export const fixtureForecast = forecastProduct(fixtureProduct, series, [{ market: 'OH', itemCode: '2847B', location: { code: 'GPT', name: 'Groveport' }, date: asOf, minimum: 14, maximum: 45, classification: 'A3A_BAIL' }], asOf);
export const fixtureRows = [summaryFor(fixtureForecast), summaryFor(forecastProduct({ ...fixtureProduct, id: 'example-gin', code: '2802B', name: 'Gin · no source history' }, [], [], asOf))];
