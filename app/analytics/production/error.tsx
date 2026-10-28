'use client';
export default function Error({ reset }: { reset: () => void }) { return <div className="card" role="alert"><h1>Production Forecasting unavailable</h1><p>Saved forecasts could not be loaded. Retry in a moment or check source data with your administrator.</p><button onClick={reset}>Retry forecasts</button></div>; }
