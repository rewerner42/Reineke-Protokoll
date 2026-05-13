export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface PreparedStatement<T = unknown> {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}

export interface DatabaseAdapter {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): PreparedStatement<T>;
  transaction<T>(fn: () => T): T;
  close(): void;
}
