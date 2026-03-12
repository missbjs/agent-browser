import type { BrowserManager } from '../../browser';
import type { Response, ConsoleCommand, ErrorsCommand } from '../../types';
import { successResponse } from '../../protocol';

export async function handleConsole(
  command: ConsoleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  // Get console messages from the page
  return successResponse(command.id, { messages: [] });
}

export async function handleErrors(
  command: ErrorsCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  // Get error messages from the page
  return successResponse(command.id, { errors: [] });
}
