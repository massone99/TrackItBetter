// Minimal typing for Node's built-in SQLite, used only by tests (the app has no Node types).
declare module 'node:sqlite' {
  interface StatementSync {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): Record<string, unknown>[] | unknown[][];
    setReturnArrays(enabled: boolean): void;
    get(...params: unknown[]): Record<string, unknown> | undefined;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
