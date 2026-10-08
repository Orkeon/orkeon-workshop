/**
 * Step counters for the tests that guard a reader against a quadratic scan. A wall clock says how
 * loaded the machine is as much as how the code scales; counting the steps says only the second,
 * and says it the same way on every machine.
 */

/** The array methods that walk an array to answer: the ones a per-row lookup in a growing list goes through. */
const SCANS = ['includes', 'indexOf', 'lastIndexOf', 'some', 'every', 'find', 'findIndex', 'filter'] as const;

/**
 * The work `run` asks of the scanning methods of its arrays: for each call, the length of the
 * array it may walk. A reader that looks each row up in the list of the rows before it does n²/2
 * of it for n rows; one that keeps a set, or scans lists of a fixed size, does a constant per row.
 */
export function arrayScanWork(run: () => void): number {
  const prototype = Array.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const real = SCANS.map((name) => [name, prototype[name]] as const);
  let work = 0;
  for (const [name, method] of real) {
    prototype[name] = function (this: unknown[], ...args: unknown[]): unknown {
      work += this.length;
      return (method as (...parameters: unknown[]) => unknown).apply(this, args);
    };
  }
  try {
    run();
  } finally {
    for (const [name, method] of real) {
      prototype[name] = method as (...args: unknown[]) => unknown;
    }
  }
  return work;
}

/** How many times `run` searches a string with `indexOf`: once per mark for a single pass, once per pair of marks for a rescan. */
export function indexOfCalls(run: () => void): number {
  const real = String.prototype.indexOf;
  let calls = 0;
  String.prototype.indexOf = function (this: string, ...args: [string, number?]): number {
    calls += 1;
    return real.apply(this, args);
  };
  try {
    run();
  } finally {
    String.prototype.indexOf = real;
  }
  return calls;
}
