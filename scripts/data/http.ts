import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FPL_USER_AGENT } from '../../lib/fpl-client.js';
import { FETCH_ATTEMPTS, RETRY_BASE_DELAY_MS } from './config.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** retries rate limits and server errors with a growing wait; a 404 fails at once */
export async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': FPL_USER_AGENT } });
    if (response.ok) return response.text();

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= FETCH_ATTEMPTS) {
      throw new Error(`GET ${url} failed with ${response.status} after ${attempt} tries`);
    }
    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }
}

/**
 * the file on disk if a previous run saved it, otherwise a fresh download. the
 * write goes to a temp file first, so an interrupted run never leaves half a
 * file that a resumed run would trust
 */
export async function cachedDownload(
  url: string,
  path: string,
): Promise<{ text: string; fromCache: boolean }> {
  try {
    return { text: await readFile(path, 'utf8'), fromCache: true };
  } catch {
    // not cached yet
  }
  const text = await fetchText(url);
  await writeFileAtomically(path, text);
  return { text, fromCache: false };
}

export async function writeFileAtomically(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const partialPath = `${path}.partial`;
  await writeFile(partialPath, text);
  await rename(partialPath, path);
}
