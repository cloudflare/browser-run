// runner/dist/*.txt are imported as Text modules (Wrangler's default rule).
declare module '*.txt' {
  const text: string;
  export default text;
}
