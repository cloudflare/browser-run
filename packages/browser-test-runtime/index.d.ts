import type {
  Expect,
  TestType,
} from '../../submodules/playwright/packages/playwright/types/test';

export type TestStatus =
  | 'passed'
  | 'failed'
  | 'timedOut'
  | 'skipped'
  | 'interrupted';

export interface TestInfoError {
  message?: string;
  stack?: string;
  value?: string;
}

export interface TestEndPayload {
  testId: string;
  duration: number;
  status: TestStatus;
  errors: TestInfoError[];
  hasNonRetriableError: boolean;
  expectedStatus: TestStatus;
  annotations: {type: string; description?: string}[];
  timeout: number;
}

export interface SuiteInfo {
  type: 'file' | 'describe';
  file: string;
  title: string;
  fullTitle: string;
  entries: (SuiteInfo | TestCaseInfo)[];
}

export interface TestCaseInfo {
  type: 'test';
  file: string;
  title: string;
  fullTitle: string;
  testId: string;
}

export interface TestContext {
  env: unknown;
  sessionId: string;
  assetsUrl: string;
  retry: number;
  binding: string;
}

export interface Attachment {
  name: string;
  body: string;
  contentType: string;
}

export type TestResult = TestEndPayload & {attachments?: Attachment[]};

export const _baseTest: TestType<{}, {}>;
export const expect: Expect<{}>;
export {mergeTests} from '../../submodules/playwright/packages/playwright/types/test';

export function setCurrentTestFile(file?: string): void;
export function testSuites(): Promise<SuiteInfo[]>;
export function currentTestContext<T extends TestContext = TestContext>(): T;

export class TestRunner {
  constructor(testContext: TestContext, options?: {timeout?: number});
  runTest(file: string, testId: string): Promise<TestResult>;
}

export interface Instrumentation {
  addListener(listener: unknown): void;
  removeListener(listener: unknown): void;
}

export function runWithExpectApiListener<T>(
  instrumentation: Instrumentation,
  fn: () => Promise<T>,
): Promise<T>;

export function setupArtifactsFixtures(playwright: {
  _instrumentation: Instrumentation;
  selectors: {setTestIdAttribute(name: string): void};
}): any;
