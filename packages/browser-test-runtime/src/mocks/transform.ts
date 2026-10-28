import {currentlyLoadingFileSuite} from 'playwright/lib/globals';

import {configLocation, playwrightTestConfig} from '../state';

interface Location {
  file: string;
  line: number;
  column: number;
}

export function requireOrImport(file: string) {
  if (file === configLocation.resolvedConfigFile) {
    return playwrightTestConfig;
  }
}

export function setTransformConfig() {}

export function transformConfig() {
  return {babelPlugins: [], external: []};
}

export function setSingleTSConfig() {}

export function singleTSConfig() {}

export function wrapFunctionWithLocation<A extends unknown[], R>(
  func: (location: Location, ...args: A) => R,
): (...args: A) => R {
  return (...args) => {
    const location = {
      file: currentlyLoadingFileSuite()?._requireFile || '',
      line: 0,
      column: 0,
    };
    return func(location, ...args);
  };
}
