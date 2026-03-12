import type { BrowserManager } from '../../browser';
import type { Response, FrameCommand, NthCommand } from '../../types';
import { successResponse } from '../../protocol';

export async function handleFrame(
  command: FrameCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  // Pass object with name or url property
  const frameOptions: any = command.name
    ? { name: command.name }
    : command.url
      ? { url: command.url }
      : undefined;
  const frame = frameOptions ? page.frame(frameOptions) : null;
  if (!frame) {
    return { id: command.id, success: false, error: 'Frame not found' };
  }
  // Execute commands within the frame context
  return successResponse(command.id, { frame: frame.url() });
}

export async function handleMainFrame(command: any, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.mainFrame();
  return successResponse(command.id, { mainframe: true });
}
