import { US_STATES } from './usStates';
export const STATE_OPTIONS = US_STATES.map(({code,name}) => [code,name] as const);
export const stateName = (code: string) => US_STATES.find(state => state.code === code)?.name ?? code;
export function parseEnabledStates(values: unknown[]): string[] {
  if (!values.length || values.some(value => typeof value !== 'string' || !US_STATES.some(state => state.code === value))) throw new Error('Select at least one valid state.');
  return [...new Set(values as string[])].sort();
}
export function accountStateValues(states: readonly string[]) { return states.flatMap(code => [code,stateName(code)]); }
