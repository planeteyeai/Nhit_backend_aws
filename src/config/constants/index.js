/**
 * Barrel file — import in React:
 *   import { bridgeDropdowns, BRIDGE_RATING, optionsFromMap } from './constants';
 */

export * from './base';
export * from './configForms';
export * from './inspectionDefines';
export * from './ratings';
export * from './repairOptions';
export * from './measurementMap';
export * from './boqItemsMeta';

/** Turn { key: label } into { value, label }[] for <select> / MUI Select */
export function optionsFromMap(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).map(([value, label]) => ({
    value,
    label: label != null ? String(label) : value,
  }));
}

/** Alias used by StructureData and other bridge wizard components */
export const mapToSelectOptions = optionsFromMap;

/** Yes / No select with an empty placeholder (mirrors old constants.js export) */
export const yesNoPlaceholderFirst = [
  { value: '', label: 'Select' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
];
