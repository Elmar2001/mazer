import {
  createMazeWorkerRuntime,
  type MazeWorkerEventEmitter,
} from "@/engine/mazeWorkerRuntime";
import type {
  MazeWorkerCommand,
  MazeWorkerEvent,
} from "@/engine/mazeWorkerProtocol";

type WorkerScope = {
  onmessage: ((event: MessageEvent<MazeWorkerCommand>) => void) | null;
  postMessage: (message: MazeWorkerEvent, transfer?: Transferable[]) => void;
};

const scope = globalThis as unknown as WorkerScope;

const emit: MazeWorkerEventEmitter = (event, transfer) => {
  scope.postMessage(event, transfer);
};

const runtime = createMazeWorkerRuntime(emit);

scope.onmessage = (event) => {
  runtime.handleCommand(event.data);
};
