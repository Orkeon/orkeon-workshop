import type { Clock, Environment, FileSystem, HttpProbe, LlmRecorder, LlmStubServer, ProcessRunner, ShutdownSignal } from '../application/ports/index.js';
import { NodeFileSystem } from './node-file-system.js';
import { NodeHttpProbe } from './node-http-probe.js';
import { NodeLlmRecorder, NodeLlmStub } from './node-llm-stub.js';
import { NodeProcessRunner } from './node-process-runner.js';
import { ProcessEnvironment } from './process-environment.js';
import { ProcessShutdownSignal } from './process-shutdown-signal.js';
import { SystemClock } from './system-clock.js';

/** Every port, implemented for Node; the interface layer builds its use cases from this. */
export interface Adapters {
  readonly fileSystem: FileSystem;
  readonly processRunner: ProcessRunner;
  readonly httpProbe: HttpProbe;
  readonly clock: Clock;
  readonly environment: Environment;
  readonly llmRecorder: LlmRecorder;
  readonly llmStub: LlmStubServer;
  readonly shutdownSignal: ShutdownSignal;
}

export function createNodeAdapters(): Adapters {
  const llmStub = new NodeLlmStub();
  return {
    fileSystem: new NodeFileSystem(),
    processRunner: new NodeProcessRunner(),
    httpProbe: new NodeHttpProbe(),
    clock: new SystemClock(),
    environment: new ProcessEnvironment(),
    llmRecorder: new NodeLlmRecorder(llmStub),
    llmStub,
    shutdownSignal: new ProcessShutdownSignal(),
  };
}
