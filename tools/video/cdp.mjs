// A minimal Chrome DevTools protocol client over --remote-debugging-pipe.
// Branded Chrome only loads an unpacked extension through the protocol, and
// only over a pipe, so this launches Chrome itself. No dependencies.

import { spawn } from "node:child_process";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function launchChrome(profileDir, extraArgs = []) {
  const child = spawn(
    CHROME,
    [
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--hide-crash-restore-bubble",
      ...extraArgs,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  child.stderr.on("data", () => {});
  return { child, cdp: new Cdp(child.stdio[3], child.stdio[4]) };
}

class Cdp {
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();
  #out;
  #buffer = "";

  constructor(out, input) {
    this.#out = out;
    input.setEncoding("utf8");
    input.on("data", (chunk) => {
      this.#buffer += chunk;
      let end;
      while ((end = this.#buffer.indexOf("\0")) !== -1) {
        const text = this.#buffer.slice(0, end);
        this.#buffer = this.#buffer.slice(end + 1);
        this.#receive(JSON.parse(text));
      }
    });
  }

  #receive(message) {
    if (message.id !== undefined) {
      const waiting = this.#pending.get(message.id);
      this.#pending.delete(message.id);
      if (message.error) {
        waiting?.reject(new Error(`${waiting.method}: ${message.error.message}`));
      } else {
        waiting?.resolve(message.result);
      }
      return;
    }
    for (const listener of this.#listeners) {
      listener(message);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    const message = { id, method, params };
    if (sessionId !== undefined) {
      message.sessionId = sessionId;
    }
    this.#out.write(JSON.stringify(message) + "\0");
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
    });
  }

  /** Calls the listener for every event, with { method, params, sessionId }. */
  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Resolves with the first event that matches. */
  waitFor(method, test = () => true, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const off = this.on((message) => {
        if (message.method === method && test(message.params, message.sessionId)) {
          clearTimeout(timer);
          off();
          resolve(message);
        }
      });
    });
  }
}

/** A page session, with an evaluate that throws on page exceptions. */
export async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`In page: ${detail}`);
    }
    return result.result.value;
  };
  return { sessionId, targetId, send, evaluate };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
