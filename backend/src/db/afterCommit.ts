import type { Prisma } from '@prisma/client';

type AfterCommitCallback = () => void | Promise<void>;
type AfterCommitHandle = { commit: () => void; rollback: () => void };

const callbacksByTransaction = new WeakMap<object, AfterCommitCallback[]>();

export function afterTransactionCommit(
  tx: Prisma.TransactionClient,
  callback: AfterCommitCallback,
): void {
  callbacksByTransaction.get(tx as object)?.push(callback);
}

export function beginAfterCommit(tx: Prisma.TransactionClient): AfterCommitHandle {
  const key = tx as object;
  const callbacks: AfterCommitCallback[] = [];
  callbacksByTransaction.set(key, callbacks);
  let settled = false;

  const takeCallbacks = () => {
    if (settled) return undefined;
    settled = true;
    callbacksByTransaction.delete(key);
    return callbacks;
  };

  return {
    commit: () => {
      const committedCallbacks = takeCallbacks();
      for (const callback of committedCallbacks ?? []) {
        void Promise.resolve().then(callback).catch(() => undefined);
      }
    },
    rollback: () => {
      takeCallbacks()?.splice(0);
    },
  };
}
