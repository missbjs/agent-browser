import type { BrowserManager } from '../../browser';
import type {
  Response,
  TraceStartCommand,
  TraceStopCommand,
  ProfilerStartCommand,
  ProfilerStopCommand,
  HarStartCommand,
  HarStopCommand,
} from '../../types';
import { successResponse } from '../../protocol';
import * as path from 'path';
import { getAppDir } from '../../daemon';
import { mkdirSync } from 'node:fs';

export async function handleTraceStart(
  command: TraceStartCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  return successResponse(command.id, { started: true });
}

export async function handleTraceStop(
  command: TraceStopCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  let tracePath = command.path;
  if (!tracePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `trace-${timestamp}.zip`;
    const traceDir = path.join(getAppDir(), 'tmp', 'traces');
    mkdirSync(traceDir, { recursive: true });
    tracePath = path.join(traceDir, filename);
  }
  await page.context().tracing.stop({ path: tracePath });
  return successResponse(command.id, { path: tracePath });
}

export async function handleProfilerStart(
  command: ProfilerStartCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.evaluate(() => (console as any).profile('profiler'));
  return successResponse(command.id, { started: true });
}

export async function handleProfilerStop(
  command: ProfilerStopCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.evaluate(() => (console as any).profileEnd('profiler'));
  return successResponse(command.id, { stopped: true });
}

export async function handleHarStart(
  command: HarStartCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.context().route(command.url, (route) => {
    route.continue();
  });
  return successResponse(command.id, { started: true });
}

export async function handleHarStop(
  command: HarStopCommand,
  browser: BrowserManager
): Promise<Response> {
  // HAR recording would need to be implemented with context-level HAR export
  return successResponse(command.id, { stopped: true });
}
