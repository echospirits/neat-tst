export const cases = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
export const trend = (value: number | null) => value === null ? 'Unavailable' : `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
