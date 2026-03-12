import type { BrowserManager } from '../../browser';
import type {
  Response,
  RouteCommand,
  DownloadCommand,
  GeolocationCommand,
  PermissionsCommand,
  ViewportCommand,
  DeviceCommand,
  PdfCommand,
  DialogCommand,
  RequestsCommand,
} from '../../types';
import { successResponse, errorResponse } from '../../protocol';

export async function handleRoute(
  command: RouteCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.addRoute(command.url, {
    response: command.response,
    abort: command.abort,
  });
  return successResponse(command.id, { routed: command.url });
}

export async function handleUnroute(command: any, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.unroute(command.url);
  return successResponse(command.id, { unrouted: true });
}

export async function handleRequests(
  command: RequestsCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const requests = await browser.getRequests();
  return successResponse(command.id, { requests });
}

export async function handleDownload(
  command: DownloadCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(command.selector).click(),
  ]);
  const path = await download.path();
  return successResponse(command.id, {
    path,
    suggestedFilename: download.suggestedFilename(),
  });
}

export async function handleGeolocation(
  command: GeolocationCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  await context.setGeolocation({
    latitude: command.latitude,
    longitude: command.longitude,
    accuracy: command.accuracy,
  });
  return successResponse(command.id, { set: true });
}

export async function handlePermissions(
  command: PermissionsCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setPermissions(command.permissions, command.grant);
  return successResponse(command.id, {
    permissions: command.permissions,
    granted: command.grant,
  });
}

export async function handleViewport(
  command: ViewportCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.setViewportSize({ width: command.width, height: command.height });
  return successResponse(command.id, {
    viewport: { width: command.width, height: command.height },
  });
}

export async function handleDevice(
  command: DeviceCommand,
  browser: BrowserManager
): Promise<Response> {
  // Device emulation requires context-level configuration
  // This would need to be set during browser launch
  return errorResponse(command.id, 'Device emulation must be configured at launch');
}

export async function handlePdf(command: PdfCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.pdf({
    path: command.path,
    format: command.format ?? 'Letter',
  });
  return successResponse(command.id, { path: command.path });
}

export async function handleDialog(
  command: DialogCommand,
  browser: BrowserManager
): Promise<Response> {
  browser.setDialogHandler(command.response, command.promptText);
  return successResponse(command.id, { handler: 'set', response: command.response });
}
