import {debug} from 'playwright-core/lib/utilsBundle';

export {asLocator} from '@isomorphic/locatorGenerators';
export {isUnderTest} from '@utils/debug';
export {getPlaywrightVersion, getUserAgent} from 'playwright-core/lib/server/userAgent';
export {debug} from 'playwright-core/lib/utilsBundle';
export {mergeTests} from 'playwright/lib/common/testType';
export * from 'playwright-core/lib/utilsBundle';
export {extractZip as extract} from '@utils/third_party/extractZip';

// console.log is unavailable during Worker module initialization.
debug.log = (...args: any[]) => console.log(...args);
