import { randomBytes } from "node:crypto";
import { link, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { PROCESS_INSTANCE, startTimeOf } from "./store.ts";

/**
 * A lock file that names its owner, for the small state files that several processes share
 * (the instance's spend account, the operator's ledger). The same rules as the campaign
 * store's lock:
 *
 * - The file names the owning process, this run of it, when it started, and a token.
 * - A lock is taken over only when its owner is known to be gone. Age alone is never a
 *   reason: a holder that is slow or paused keeps its lock, and others wait, then give up.
 * - Taking over moves the lock aside first, which only one contender can do, and checks
 *   that what was moved is the dead owner's lock; if it is not, it is put back.
 * - On release, a holder removes the lock only if it still carries its own token.
 */
export async function withOwnedLock<T>(lockPath: string, what: string, task: () => Promise<T>, options: { timeoutMs?: number; ownerlessAfterMs?: number } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const ownerlessAfterMs = options.ownerlessAfterMs ?? 30_000;
  const token = randomBytes(12).toString("hex");
  const mine = `${process.pid} ${PROCESS_INSTANCE} ${startTimeOf(process.pid) ?? "-"} ${token}\n`;
  const deadline = Date.now() + timeoutMs;
  let pause = 5;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(mine);
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (await clearDeadLock(lockPath, ownerlessAfterMs)) continue;
    if (Date.now() > deadline) throw new Error(`${what} is locked by another process.`);
    await new Promise((resolve) => setTimeout(resolve, pause));
    pause = Math.min(pause * 2, 100);
  }
  const held = async () => (await readFile(lockPath, "utf8").catch(() => "")) === mine;
  try {
    return await task();
  } finally {
    if (await held()) await unlink(lockPath).catch(() => undefined);
  }
}

function alive(pid: number, instance: string | undefined, started: string | undefined): boolean {
  if (pid === process.pid) return instance === PROCESS_INSTANCE;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") return false;
  }
  const now = startTimeOf(pid);
  return now === null || started === undefined || started === "-" || now === started;
}

/** Remove a lock whose owner no longer exists. True when the caller should try again at once. */
async function clearDeadLock(lockPath: string, ownerlessAfterMs: number): Promise<boolean> {
  const content = await readFile(lockPath, "utf8").catch(() => null);
  if (content === null) return true;
  const [pidText, instance, started] = content.trim().split(" ");
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0 || alive(pid, instance, started)) {
    if (Number.isInteger(pid) && pid > 0) return false;
    // No readable owner: held until it is old enough that no holder can be part-way through writing it.
    const age = await stat(lockPath).then((st) => Date.now() - st.mtimeMs, () => 0);
    if (age < ownerlessAfterMs) return false;
  }
  if ((await readFile(lockPath, "utf8").catch(() => null)) !== content) return true;
  const grave = `${lockPath}.${randomBytes(8).toString("hex")}.dead`;
  try {
    await rename(lockPath, grave);
  } catch {
    return true;
  }
  const moved = await readFile(grave, "utf8").catch(() => null);
  if (moved !== content) await link(grave, lockPath).catch(() => undefined);
  await unlink(grave).catch(() => undefined);
  return true;
}
