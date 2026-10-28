export {mergeTests} from './types/test';

interface Debug {
  disable: () => string;
  enable: (namespaces: string) => void;
  enabled: (namespaces: string) => boolean;
}

export const debug: Debug;
export function isUnderTest(): boolean;
