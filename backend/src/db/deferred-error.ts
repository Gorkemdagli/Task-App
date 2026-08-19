const deferredErrors = new WeakSet<Error>();

export function commitThenThrow(error: Error): never {
  deferredErrors.add(error);
  throw error;
}

export function takeDeferredError(error: unknown): error is Error {
  return error instanceof Error && deferredErrors.delete(error);
}
