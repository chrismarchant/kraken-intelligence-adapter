import { createHash, randomBytes } from "node:crypto";
import { constants, readFileSync, readdirSync } from "node:fs";
import { link, open, readdir, stat, unlink } from "node:fs/promises";
import { basename, dirname } from "node:path";

/**
 * Identifies this run of this process. A lock naming our own process id but another
 * instance was left by an earlier process that had the same id, and is dead.
 */
export const PROCESS_INSTANCE = randomBytes(8).toString("hex");

/** The fields of /proc/<pid>/stat after the command name, which may itself contain spaces. */
function procStat(pid: number): string[] | null {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, "utf8");
    return text.slice(text.lastIndexOf(")") + 2).split(" ");
  } catch {
    return null;
  }
}

/** When a process started, as the system records it; null where that cannot be read. */
export function startTimeOf(pid: number): string | null {
  return procStat(pid)?.[19] ?? null;
}

/**
 * True when the process that wrote an owner line is still running. A process id alone is not
 * enough: ids are reused, and after a restart in a container the new process often has the
 * old one's id. A process that has exited but has not been collected by its parent (a zombie)
 * still has an id and a start time; it will never write again and is not running.
 */
export function ownerAlive(pid: number, instance: string | undefined, started: string | undefined): boolean {
  if (pid === process.pid) return instance === PROCESS_INSTANCE;
  try {
    process.kill(pid, 0);
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") return false;
  }
  const fields = procStat(pid);
  if (fields === null) return true;
  if (exited(pid, fields[0])) return false;
  // The id is in use. It is the same process only if it started when the owner line says it did.
  const now = fields[19] ?? null;
  return now === null || started === undefined || started === "-" || now === started;
}

/**
 * True when every thread of the process has exited. The state in /proc/<pid>/stat is that of
 * the first thread; while a process is exiting it can read as a zombie before another thread
 * has finished a write it had begun. So each thread is looked at where that can be done.
 */
function exited(pid: number, leaderState: string | undefined): boolean {
  const gone = (state: string | undefined) => state === "Z" || state === "X";
  if (!gone(leaderState)) return false;
  let threads: string[];
  try {
    threads = readdirSync(`/proc/${pid}/task`);
  } catch {
    return true;
  }
  for (const thread of threads) {
    try {
      const text = readFileSync(`/proc/${pid}/task/${thread}/stat`, "utf8");
      if (!gone(text.slice(text.lastIndexOf(")") + 2).split(" ")[0])) return false;
    } catch {
      // The thread went away while it was being looked at.
    }
  }
  return true;
}

function ownerLine(token: string): string {
  return `${process.pid} ${PROCESS_INSTANCE} ${startTimeOf(process.pid) ?? "-"} ${token}\n`;
}

/**
 * Create `path` holding `content`, only if nothing is there. The content is written to a
 * file of its own first and then linked into place, so the file never exists half-written:
 * whoever sees it sees all of it.
 */
async function createWhole(path: string, content: string): Promise<boolean> {
  const temporary = `${path}.${randomBytes(8).toString("hex")}.new`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    // The temporary file is gone: somebody tidied it away. Nothing was created; try again.
    if (code === "ENOENT") return false;
    // A file system with no hard links. The file is created in place; a reader may then see it
    // before its content, and treats a file with no readable owner as held until it is old.
    if (code === "EPERM" || code === "ENOSYS" || code === "EOPNOTSUPP" || code === "ENOTSUP") return createInPlace(path, content);
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function createInPlace(path: string, content: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
  return true;
}

/**
 * The text of a lock file; null if it is not there; UNREADABLE if something is there that is
 * not an ordinary file this user can read. Every read of a lock or of a right goes through
 * here. The file is opened without following a link and without waiting, and what was opened
 * is then checked: a named pipe put there, even between one step and the next, cannot hold
 * the caller, and a link, a directory or a device is not a lock of ours.
 */
async function readOrWhy(path: string): Promise<string | null | typeof UNREADABLE> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : UNREADABLE;
  }
  try {
    if (!(await handle.stat()).isFile()) return UNREADABLE;
    return await handle.readFile("utf8");
  } catch {
    return UNREADABLE;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
const UNREADABLE: unique symbol = Symbol("unreadable");

export interface OwnedLock {
  /** True while the lock file still carries this holder's token. */
  held(): Promise<boolean>;
  /** Remove the lock, if it is still this holder's. */
  release(): Promise<void>;
}

/**
 * Take a lock file that names its owner. Used for campaign records and for the small state
 * files that several processes share (the instance's spend account, the operator's ledger).
 *
 * - The file names the owning process, this run of it, when it started, and a token.
 * - A lock is taken over only when its owner is known to be gone. Age alone is never a
 *   reason: a holder that is slow or paused keeps its lock, and others wait, then give up.
 * - A dead owner's lock is removed by exactly one process (see clearDeadLock).
 * - On release, a holder removes the lock only if it still carries its own token.
 *
 * Returns null when the lock could not be taken before the timeout.
 */
export async function acquireOwnedLock(lockPath: string, options: { timeoutMs?: number; ownerlessAfterMs?: number } = {}): Promise<OwnedLock | null> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const ownerlessAfterMs = options.ownerlessAfterMs ?? 30_000;
  const mine = ownerLine(randomBytes(12).toString("hex"));
  const deadline = Date.now() + timeoutMs;
  let pause = 5;
  for (;;) {
    if (await createWhole(lockPath, mine)) break;
    if (await clearDeadLock(lockPath, ownerlessAfterMs)) continue;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, pause));
    pause = Math.min(pause * 2, 100);
  }
  const held = async () => (await readOrWhy(lockPath)) === mine;
  return {
    held,
    release: async () => {
      if (await held()) await unlink(lockPath).catch(() => undefined);
    },
  };
}

/** Run a task while holding the lock at `lockPath`. Throws if the lock cannot be taken in time. */
export async function withOwnedLock<T>(lockPath: string, what: string, task: () => Promise<T>, options: { timeoutMs?: number; ownerlessAfterMs?: number } = {}): Promise<T> {
  const lock = await acquireOwnedLock(lockPath, options);
  if (lock === null) throw new Error(`${what} is locked by another process.`);
  try {
    return await task();
  } finally {
    await lock.release();
  }
}

/** What marks one particular lock: its content, and for one with no readable owner, the file itself. */
async function generationOf(lockPath: string, content: string, owned: boolean): Promise<string | null> {
  if (owned) return createHash("sha256").update(content).digest("hex").slice(0, 24);
  const st = await stat(lockPath).catch(() => null);
  if (st === null) return null;
  return createHash("sha256").update(`${content}\n${st.ino} ${st.mtimeMs} ${st.size}`).digest("hex").slice(0, 24);
}

/**
 * For tests only: called after a lock has been read and judged dead, before anything is done
 * about it. Lets a test put other processes' steps exactly there. Always null outside tests.
 */
export const lockTestHooks: { afterJudgedDead: null | (() => Promise<void>) } = { afterJudgedDead: null };

/** How old a file left behind by a process that died while taking a lock must be before it is tidied away. */
const LEFTOVER_AFTER_MS = 60_000;

/** Longest chain of dead removers followed for one lock before giving up for this attempt. */
const MAX_SUCCESSORS = 32;

/**
 * Remove a lock whose owner no longer exists. True when the caller should try to take the
 * lock again at once; false when it should wait.
 *
 * Every lock that is taken is different from every other: its content carries a random
 * token. To remove a dead owner's lock, a process must first hold the right to remove *that*
 * lock, which is a file named after it and created only if absent, so one process holds it.
 * The holder looks at the lock again and removes it only if it is still the same one. Nobody
 * else removes it: its owner is dead, and the right is held. So a lock that some other
 * process has since taken is never removed, however the steps of several processes fall.
 *
 * If the holder of the right dies before finishing, the right passes to a successor, again a
 * file created only if absent, and only once the previous holder is known to be gone. The
 * files are deleted after the lock is; a latecomer who then claims the right afresh finds a
 * different lock, or none, and removes nothing.
 */
export async function clearDeadLock(lockPath: string, ownerlessAfterMs: number): Promise<boolean> {
  const content = await readOrWhy(lockPath);
  if (content === null) return true; // released in the meantime
  // Something is at the lock's path that is not a file this user can read: a directory, a
  // dangling link, another user's file. It is not ours to remove. The caller waits, and gives
  // up at its deadline, where it used to try again at once for ever.
  if (content === UNREADABLE) return false;
  const [pidText, instance, started] = content.trim().split(" ");
  const pid = Number(pidText);
  const owned = Number.isInteger(pid) && pid > 0;
  if (owned) {
    if (ownerAlive(pid, instance, started)) return false;
  } else {
    // No readable owner. Locks made by this code are never half-written, so this is damage or a
    // foreign file. It is treated as held until it is old.
    const age = await stat(lockPath).then((st) => Date.now() - st.mtimeMs, () => 0);
    if (age < ownerlessAfterMs) return false;
  }
  const generation = await generationOf(lockPath, content, owned);
  if (generation === null) return true;
  if (lockTestHooks.afterJudgedDead) await lockTestHooks.afterJudgedDead();

  const right = (n: number) => `${lockPath}.break.${generation}.${n}`;
  const claim = ownerLine("remover");
  let mine: string | null = null;
  for (let n = 1; n <= MAX_SUCCESSORS; n++) {
    if (await createWhole(right(n), claim)) {
      mine = right(n);
      break;
    }
    const holder = await readOrWhy(right(n));
    if (holder === null) return true; // the lock was removed and its files cleared; start again
    if (holder === UNREADABLE) return false;
    const [holderPid, holderInstance, holderStarted] = holder.trim().split(" ");
    const remover = Number(holderPid);
    if (!Number.isInteger(remover) || remover <= 0) {
      // A right with no readable holder: empty, or damaged. Where hard links cannot be made, a
      // remover killed between creating its right and writing it leaves one. It is treated as
      // held until it is old, like a lock with no readable owner, and then as a dead holder's.
      const age = await stat(right(n)).then((st) => Date.now() - st.mtimeMs, () => 0);
      if (age < ownerlessAfterMs) return false;
      continue;
    }
    // A live holder is about to finish. Wait for it.
    if (ownerAlive(remover, holderInstance, holderStarted)) return false;
    // A dead holder: the right passes to the next in line.
  }
  if (mine === null) return false;

  const now = await readOrWhy(lockPath);
  if (typeof now === "string" && now === content && (await generationOf(lockPath, now, owned)) === generation) {
    await unlink(lockPath).catch(() => undefined);
  }
  // The lock this right was for is gone for good. Clear the files that named it: the rights
  // themselves, which end in a number. Not the files other claimants are still writing, which
  // begin with the same name: removing one of those would make that claimant's attempt fail.
  const prefix = `${basename(lockPath)}.break.${generation}.`;
  const names = await readdir(dirname(lockPath)).catch(() => [] as string[]);
  const rights = names.filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)));
  await Promise.all(rights.map((name) => unlink(`${dirname(lockPath)}/${name}`).catch(() => undefined)));
  // A process that died while taking this lock, or while claiming a right to it, left the file
  // it was writing. Those that are old are tidied away here, after a crash, which is when they
  // appear. A live process slow enough to lose its file this way finds it gone and tries again.
  const stale = Date.now() - LEFTOVER_AFTER_MS;
  const leftover = names.filter((name) => name.startsWith(`${basename(lockPath)}.`) && name.endsWith(".new"));
  await Promise.all(
    leftover.map(async (name) => {
      const path = `${dirname(lockPath)}/${name}`;
      const modified = await stat(path).then((st) => st.mtimeMs, () => Infinity);
      if (modified < stale) await unlink(path).catch(() => undefined);
    }),
  );
  return true;
}
