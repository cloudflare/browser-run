import fs from 'fs';

import {asLocatorDescription} from '@isomorphic/locatorGenerators';
import {ManualPromise} from '@isomorphic/manualPromise';
import {
  getActionGroup,
  renderTitleForCall,
} from '@isomorphic/protocolFormatter';
import {setTimeOrigin, timeOrigin} from '@isomorphic/time';
import {currentZone} from '@utils/zones';
import {loadConfig} from 'playwright/lib/common/configLoader';
import {
  currentTestInfo,
  setCurrentlyLoadingFileSuite,
} from 'playwright/lib/globals';
import {bindFileSuiteToProject} from 'playwright/lib/common/suiteUtils';
import {Suite, TestCase} from 'playwright/lib/common/test';
import {rootTestType} from 'playwright/lib/common/testType';
import {expect} from 'playwright/lib/matchers/expect';
import {WorkerMain} from 'playwright/lib/worker/workerMain';
import type {TestStepInternal} from 'playwright/lib/worker/testInfo';
import type {ClientInstrumentationListener} from 'playwright-core/lib/client/clientInstrumentation';

import {configLocation, playwrightTestConfig, rootSuites} from './state';

export {expect};
export {mergeTests} from 'playwright/lib/common/testType';

export const _baseTest = rootTestType.test;

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

export function setCurrentTestFile(file?: string) {
  if (!file) {
    setCurrentlyLoadingFileSuite(undefined);
    return;
  }

  const suite = new Suite(file, 'file');
  suite._requireFile = `/bundle/${file}`;
  suite.location = {file, line: 0, column: 0};
  setCurrentlyLoadingFileSuite(suite);
  rootSuites.push(suite);
}

function toInfo(test: Suite | TestCase): SuiteInfo | TestCaseInfo {
  if (test instanceof Suite) {
    return {
      type: test._type as SuiteInfo['type'],
      file: test._requireFile!,
      title: test.title,
      fullTitle: test.titlePath().join(' > '),
      entries: test._entries.map(toInfo),
    };
  }
  if (test instanceof TestCase) {
    return {
      type: 'test',
      file: test._requireFile!,
      title: test.title,
      fullTitle: test.titlePath().join(' > '),
      testId: test.id,
    };
  }
  throw new Error('Invalid test');
}

async function bindSuites() {
  const fullConfig = await loadConfig(configLocation);
  const [project] = fullConfig.projects;
  return rootSuites.map(suite => bindFileSuiteToProject(project, suite));
}

export async function testSuites(): Promise<SuiteInfo[]> {
  const suites = await bindSuites();
  return suites.map(toInfo) as SuiteInfo[];
}

class TestWorker extends WorkerMain {
  private readonly donePromise = new ManualPromise<TestResult>();
  private readonly attachments: Attachment[] = [];
  private testResult?: TestEndPayload;

  constructor(options?: {timeout?: number}) {
    super({
      workerIndex: 0,
      parallelIndex: 0,
      repeatEachIndex: 0,
      projectId: playwrightTestConfig.projects[0]!.name,
      config: {
        location: configLocation,
        configCLIOverrides: {timeout: 5000, ...options},
      },
      artifactsDir: '/tmp/tests',
      pauseOnError: false,
      pauseAtEnd: false,
    });
  }

  async result() {
    return await this.donePromise;
  }

  protected override dispatchEvent(method: string, params: any): void {
    if (method === 'attach') {
      const {name, body, path, contentType} = params;
      let fileContent: string | undefined;
      if (!body) {
        if (!path) {
          throw new Error('Either body or path must be provided');
        }
        if (!fs.existsSync(path)) {
          throw new Error(`File does not exist: ${path}`);
        }
        fileContent = fs.readFileSync(path, 'base64') as string;
      }
      this.attachments.push({name, body: body ?? fileContent!, contentType});
    }
    if (method === 'testEnd') {
      this.testResult = params;
    }
    if (method === 'done') {
      if (!this.testResult) {
        this.testResult = {
          testId: params.testId,
          errors: params.fatalErrors ?? [],
          annotations: [],
          expectedStatus: 'passed',
          status: 'failed',
          hasNonRetriableError: false,
          duration: 0,
          timeout: 0,
        };
      }
      this.donePromise.resolve({
        ...this.testResult,
        attachments: this.attachments,
      });
    }
  }
}

let context: TestContext | undefined;

export function currentTestContext<T extends TestContext = TestContext>(): T {
  if (!context) {
    throw new Error('Test context not initialized');
  }
  return context as T;
}

export class TestRunner {
  constructor(
    private readonly testContext: TestContext,
    private readonly options?: {timeout?: number},
  ) {}

  async runTest(file: string, testId: string): Promise<TestResult> {
    if (timeOrigin() === 0 && Date.now() !== 0) {
      setTimeOrigin(Date.now());
    }

    context = this.testContext;
    const worker = new TestWorker(this.options);
    try {
      const {retry} = this.testContext;
      const [result] = await Promise.all([
        worker.result(),
        // plan annotations are applied by the test runner, which does not run here
        worker.runTestGroup({
          file,
          entries: [{testId, retry, planAnnotations: []}],
        }),
      ]);
      if (
        result.status === 'failed' &&
        result.errors.some(error =>
          error.message?.startsWith(
            'Cloudflare Workers does not support browserType.',
          ),
        )
      ) {
        return {...result, status: 'skipped', expectedStatus: 'skipped'};
      }
      return result;
    } finally {
      await worker.gracefullyClose();
      context = undefined;
    }
  }
}

const tracingGroupSteps: TestStepInternal[] = [];

const expectApiListener: ClientInstrumentationListener = {
  onApiCallBegin: (data, channel) => {
    const testInfo = currentTestInfo();
    if (
      !testInfo ||
      data.apiName.includes('setTestIdAttribute') ||
      data.apiName === 'tracing.groupEnd'
    ) {
      return;
    }
    const zone = currentZone().data<TestStepInternal>('stepZone');
    if (zone?.category === 'expect') {
      if (zone.apiName) data.apiName = zone.apiName;
      if (zone.shortTitle || zone.title)
        data.title = zone.shortTitle ?? zone.title;
      data.stepId = zone.stepId;
      return;
    }

    const step = testInfo._addStep(
      {
        location: data.frames[0],
        category: 'pw:api',
        title: renderTitle(
          channel.type,
          channel.method,
          channel.params,
          data.title,
        ),
        apiName: data.apiName,
        params: channel.params,
        group: getActionGroup({type: channel.type, method: channel.method}),
      },
      tracingGroupSteps[tracingGroupSteps.length - 1],
    );
    data.userData = step;
    data.stepId = step.stepId;
    if (data.apiName === 'tracing.group') tracingGroupSteps.push(step);
  },
  onApiCallEnd: data => {
    if (data.apiName === 'tracing.group') return;
    if (data.apiName === 'tracing.groupEnd') {
      tracingGroupSteps.pop()?.complete({error: data.error});
      return;
    }
    data.userData?.complete({error: data.error});
  },
};

function renderTitle(
  type: string,
  method: string,
  params: Record<string, string> | undefined,
  title?: string,
) {
  const prefix = renderTitleForCall({title, type, method, params});
  const selector =
    typeof params?.selector === 'string'
      ? asLocatorDescription('javascript', params.selector)
      : undefined;
  return prefix + (selector ? ` ${selector}` : '');
}

export interface Instrumentation {
  addListener(listener: ClientInstrumentationListener): void;
  removeListener(listener: ClientInstrumentationListener): void;
}

export async function runWithExpectApiListener<T>(
  instrumentation: Instrumentation,
  fn: () => Promise<T>,
): Promise<T> {
  instrumentation.addListener(expectApiListener);
  try {
    return await fn();
  } finally {
    instrumentation.removeListener(expectApiListener);
  }
}
