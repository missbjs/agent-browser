import type { BrowserManager } from '../../browser';
import type {
  Response,
  EvaluateCommand,
  WaitCommand,
  ContentCommand,
  UrlCommand,
  TitleCommand,
  EmulateMediaCommand,
  OfflineCommand,
  HeadersCommand,
  TimezoneCommand,
  LocaleCommand,
  HttpCredentialsCommand,
  SetContentCommand,
  WaitForLoadStateCommand,
  WaitForUrlCommand,
  WaitForFunctionCommand,
  AddInitScriptCommand,
  KeyDownCommand,
  KeyUpCommand,
  InsertTextCommand,
  MultiSelectCommand,
  WaitForDownloadCommand,
  ResponseBodyCommand,
  ScreencastStartCommand,
  ScreencastStopCommand,
  HighlightCommand,
  ClearCommand,
  SelectAllCommand,
  InnerTextCommand,
  InnerHtmlCommand,
  InputValueCommand,
  SetValueCommand,
  DispatchEventCommand,
  AddScriptCommand,
  AddStyleCommand,
  PauseCommand,
  NthCommand,
  ScrollIntoViewCommand,
  BringToFrontCommand,
} from '../../types';
import { successResponse, errorResponse } from '../../protocol';

export async function handleEvaluate(
  command: EvaluateCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const result = await page.evaluate(command.script);
  return successResponse(command.id, { result });
}

export async function handleWait(command: WaitCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    await page.waitForSelector(command.selector, {
      state: command.state ?? 'visible',
      timeout: command.timeout,
    });
  } else if (command.timeout) {
    await page.waitForTimeout(command.timeout);
  } else {
    // Default: wait for load state
    await page.waitForLoadState('load');
  }

  return successResponse(command.id, { waited: true });
}

export async function handleContent(
  command: ContentCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const content = await page.content();
  return successResponse(command.id, { content });
}

export async function handleUrl(command: UrlCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  const url = page.url();
  return successResponse(command.id, { url });
}

export async function handleTitle(
  command: TitleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const title = await page.title();
  return successResponse(command.id, { title });
}

export async function handleEmulateMedia(
  command: EmulateMediaCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.emulateMedia({ media: command.media });
  return successResponse(command.id, { emulated: true });
}

export async function handleOffline(
  command: OfflineCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.context().setOffline(command.offline);
  return successResponse(command.id, { offline: command.offline });
}

export async function handleHeaders(
  command: HeadersCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.setExtraHTTPHeaders(command.headers);
  return successResponse(command.id, { set: true });
}

export async function handleTimezone(
  command: TimezoneCommand,
  browser: BrowserManager
): Promise<Response> {
  // Timezone must be set at context level before navigation
  // This is a limitation - it sets for the current context
  const page = browser.getPage();
  await page.context().setGeolocation({ latitude: 0, longitude: 0 }); // Trigger context awareness
  return successResponse(command.id, {
    note: 'Timezone must be set at browser launch. Use --timezone flag.',
    timezone: command.timezone,
  });
}

export async function handleLocale(
  command: LocaleCommand,
  browser: BrowserManager
): Promise<Response> {
  // Locale must be set at context creation time
  return errorResponse(command.id, 'Locale must be configured at launch');
}

export async function handleCredentials(
  command: HttpCredentialsCommand,
  browser: BrowserManager
): Promise<Response> {
  const context = browser.getPage().context();
  await context.setHTTPCredentials({
    username: command.username,
    password: command.password,
  });
  return successResponse(command.id, { set: true });
}

export async function handleSetContent(
  command: SetContentCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.setContent(command.html);
  return successResponse(command.id, { loaded: true });
}

export async function handleWaitForLoadState(
  command: WaitForLoadStateCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForLoadState(command.state as any);
  return successResponse(command.id, { loaded: true });
}

export async function handleWaitForUrl(
  command: WaitForUrlCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForURL(command.url);
  return successResponse(command.id, { url: page.url() });
}

export async function handleWaitForFunction(
  command: WaitForFunctionCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const result = await page.waitForFunction(command.expression);
  return successResponse(command.id, { result });
}

export async function handleAddInitScript(
  command: AddInitScriptCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.addInitScript({ content: command.script });
  return successResponse(command.id, { added: true });
}

export async function handleKeyDown(
  command: KeyDownCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.down(command.key);
  return successResponse(command.id, { done: true });
}

export async function handleKeyUp(
  command: KeyUpCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.up(command.key);
  return successResponse(command.id, { done: true });
}

export async function handleInsertText(
  command: InsertTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.insertText(command.text);
  return successResponse(command.id, { typed: true });
}

export async function handleMultiSelect(
  command: MultiSelectCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).selectOption(command.values);
  return successResponse(command.id, { selected: true });
}

export async function handleWaitForDownload(
  command: WaitForDownloadCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const download = await page.waitForEvent('download', { timeout: command.timeout });

  let filePath: string;
  if (command.path) {
    filePath = command.path;
    await download.saveAs(filePath);
  } else {
    filePath = (await download.path()) || download.suggestedFilename();
  }

  return successResponse(command.id, {
    path: filePath,
    filename: download.suggestedFilename(),
    url: download.url(),
  });
}

export async function handleResponseBody(
  command: ResponseBodyCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const response = await page.waitForResponse(command.url);
  const body = await response.text();
  return successResponse(command.id, { body });
}

export async function handleScreencastStart(
  command: ScreencastStartCommand,
  browser: BrowserManager
): Promise<Response> {
  // Screencast requires context-level video configuration
  return errorResponse(command.id, 'Screencast must be configured at launch');
}

export async function handleScreencastStop(
  command: ScreencastStopCommand,
  browser: BrowserManager
): Promise<Response> {
  return successResponse(command.id, { stopped: true });
}

export async function handleHighlight(
  command: HighlightCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).highlight();
  return successResponse(command.id, { highlighted: true });
}

export async function handleClear(
  command: ClearCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).clear();
  return successResponse(command.id, { cleared: true });
}

export async function handleSelectAll(
  command: SelectAllCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).selectText();
  return successResponse(command.id, { selected: true });
}

export async function handleInnerText(
  command: InnerTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const text = await page.locator(command.selector).innerText();
  return successResponse(command.id, { text });
}

export async function handleInnerHtml(
  command: InnerHtmlCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const html = await page.locator(command.selector).innerHTML();
  return successResponse(command.id, { html });
}

export async function handleInputValue(
  command: InputValueCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const value = await page.locator(command.selector).inputValue();
  return successResponse(command.id, { value });
}

export async function handleSetValue(
  command: SetValueCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).fill(command.value);
  return successResponse(command.id, { filled: true });
}

export async function handleDispatchEvent(
  command: DispatchEventCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).dispatchEvent(command.event, command.eventInit);
  return successResponse(command.id, { dispatched: true });
}

export async function handleAddScript(
  command: AddScriptCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  if (command.content) {
    await page.addScriptTag({ content: command.content });
  } else if (command.url) {
    await page.addScriptTag({ url: command.url });
  }
  return successResponse(command.id, { added: true });
}

export async function handleAddStyle(
  command: AddStyleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  if (command.content) {
    await page.addStyleTag({ content: command.content });
  } else if (command.url) {
    await page.addStyleTag({ url: command.url });
  }
  return successResponse(command.id, { added: true });
}

export async function handlePause(
  command: PauseCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.pause();
  return successResponse(command.id, { paused: true });
}

export async function handleNth(command: NthCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  const locator = page.locator(command.selector).nth(command.index);
  // Return information about the nth element
  const count = await locator.count();
  return successResponse(command.id, { count });
}

export async function handleScrollIntoView(
  command: ScrollIntoViewCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).scrollIntoViewIfNeeded();
  return successResponse(command.id, { scrolled: true });
}

export async function handleBringToFront(
  command: BringToFrontCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.bringToFront();
  return successResponse(command.id, { broughtToFront: true });
}
