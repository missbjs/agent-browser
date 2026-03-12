import type { BrowserManager } from '../../browser';
import type { Response, ScreenshotCommand, SnapshotCommand } from '../../types';
import { successResponse } from '../../protocol';
import * as fs from 'fs';
import * as path from 'path';
import { mkdirSync } from 'node:fs';
import { getAppDir } from '../../daemon';

export async function handleScreenshot(
  command: ScreenshotCommand,
  browser: BrowserManager
): Promise<Response<any>> {
  const page = browser.getPage();

  const options: any = {
    fullPage: command.fullPage,
    type: command.format ?? 'png',
  };

  if (command.format === 'jpeg' && command.quality !== undefined) {
    options.quality = command.quality;
  }

  let target: any = page;
  if (command.selector) {
    target = browser.getLocator(command.selector);
  }

  let savePath = command.path;
  if (!savePath) {
    const ext = command.format === 'jpeg' ? 'jpg' : 'png';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `screenshot-${timestamp}-${random}.${ext}`;
    const screenshotDir = path.join(getAppDir(), 'tmp', 'screenshots');
    mkdirSync(screenshotDir, { recursive: true });
    savePath = path.join(screenshotDir, filename);
  }

  const buffer = await target.screenshot(options);
  fs.writeFileSync(savePath, buffer);

  return successResponse(command.id, {
    path: savePath,
    base64: buffer.toString('base64'),
  });
}

export async function handleSnapshot(
  command: SnapshotCommand,
  browser: BrowserManager
): Promise<Response<any>> {
  const snapshot = await browser.getSnapshot();
  return successResponse(command.id, snapshot);
}
