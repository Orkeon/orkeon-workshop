/** Process environment: variables, home and current directory. */
export interface Environment {
  get(name: string): string | undefined;
  /** Every variable, to pass on to a process with a few changed. */
  variables(): Readonly<Record<string, string>>;
  homeDirectory(): string;
  currentDirectory(): string;
}
