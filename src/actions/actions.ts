import * as fs from 'fs';
import * as path from 'path';
import type { Page, Frame } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import type { BrowserManager, ScreencastFrame } from '../browser';
import { getAppDir } from '../daemon';
import {
  type ActionPolicy,
  checkPolicy,
  describeAction,
  getActionCategory,
  loadPolicyFile,
  initPolicyReloader,
  reloadPolicyIfChanged,
} from '../action-policy';
import { requestConfirmation, getAndRemovePending } from '../confirmation';
import { getAuthProfile, updateLastLogin } from '../auth-vault';
import {
  getSessionsDir,
  readStateFile,
  isValidSessionName,
  isEncryptedPayload,
  listStateFiles,
  cleanupExpiredStates,
} from '../state-utils';
import type {
  Command,
  Response,
  NavigateCommand,
  ClickCommand,
  TypeCommand,
  FillCommand,
  CheckCommand,
  UncheckCommand,
  UploadCommand,
  DoubleClickCommand,
  FocusCommand,
  DragCommand,
  FrameCommand,
  GetByRoleCommand,
  GetByTextCommand,
  GetByLabelCommand,
  GetByPlaceholderCommand,
  PressCommand,
  ScreenshotCommand,
  EvaluateCommand,
  WaitCommand,
  ScrollCommand,
  SelectCommand,
  HoverCommand,
  ContentCommand,
  TabNewCommand,
  TabListCommand,
  TabSwitchCommand,
  TabCloseCommand,
  WindowNewCommand,
  WindowListCommand,
  CookiesSetCommand,
  StorageGetCommand,
  StorageSetCommand,
  StorageClearCommand,
  DialogCommand,
  PdfCommand,
  RouteCommand,
  RequestsCommand,
  DownloadCommand,
  GeolocationCommand,
  PermissionsCommand,
  ViewportCommand,
  DeviceCommand,
  GetAttributeCommand,
  GetTextCommand,
  IsVisibleCommand,
  IsEnabledCommand,
  IsCheckedCommand,
  CountCommand,
  BoundingBoxCommand,
  StylesCommand,
  TraceStartCommand,
  TraceStopCommand,
  ProfilerStartCommand,
  ProfilerStopCommand,
  HarStopCommand,
  StorageStateSaveCommand,
  StateListCommand,
  StateClearCommand,
  StateShowCommand,
  StateCleanCommand,
  StateRenameCommand,
  ConsoleCommand,
  ErrorsCommand,
  KeyboardCommand,
  WheelCommand,
  TapCommand,
  ClipboardCommand,
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
  EmulateMediaCommand,
  OfflineCommand,
  HeadersCommand,
  GetByAltTextCommand,
  GetByTitleCommand,
  GetByTestIdCommand,
  NthCommand,
  WaitForUrlCommand,
  WaitForLoadStateCommand,
  SetContentCommand,
  TimezoneCommand,
  LocaleCommand,
  HttpCredentialsCommand,
  MouseMoveCommand,
  MouseDownCommand,
  MouseUpCommand,
  WaitForFunctionCommand,
  ScrollIntoViewCommand,
  AddInitScriptCommand,
  KeyDownCommand,
  KeyUpCommand,
  InsertTextCommand,
  MultiSelectCommand,
  WaitForDownloadCommand,
  ResponseBodyCommand,
  ScreencastStartCommand,
  ScreencastStopCommand,
  InputMouseCommand,
  InputKeyboardCommand,
  InputTouchCommand,
  RecordingStartCommand,
  RecordingStopCommand,
  RecordingRestartCommand,
  DiffSnapshotCommand,
  DiffScreenshotCommand,
  DiffUrlCommand,
  AuthLoginCommand,
  ConfirmCommand,
  DenyCommand,
  Annotation,
  NavigateData,
  ScreenshotData,
  EvaluateData,
  DiffSnapshotData,
  DiffScreenshotData,
  DiffUrlData,
  ContentData,
  TabInfo,
  TabListData,
  TabNewData,
  TabSwitchData,
  TabCloseData,
  WindowInfo,
  WindowListData,
  ScreencastStartData,
  ScreencastStopData,
  RecordingStartData,
  RecordingStopData,
  RecordingRestartData,
  InputEventData,
  StylesData,
} from '../types';
import { successResponse, errorResponse, parseCommand } from '../protocol';
import { diffSnapshots, diffScreenshots } from '../diff';
import { getEnhancedSnapshot } from '../snapshot';

// Import modular handlers
import * as handlers from './handlers/index';

// Callback for screencast frames - will be set by the daemon when streaming is active
let screencastFrameCallback: ((frame: ScreencastFrame) => void) | null = null;

/**
 * Set the callback for screencast frames
 * This is called by the daemon to set up frame streaming
 */
export function setScreencastFrameCallback(
  callback: ((frame: ScreencastFrame) => void) | null
): void {
  screencastFrameCallback = callback;
}

// Snapshot response type
interface SnapshotData {
  snapshot: string;
  refs?: Record<string, { role: string; name?: string }>;
}

/**
 * Convert Playwright errors to AI-friendly messages
 * @internal Exported for testing
 */
export function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  // Handle strict mode violation (multiple elements match)
  if (message.includes('strict mode violation')) {
    // Extract count if available
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : 'multiple';

    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
        `Run 'snapshot' to get updated refs, or use a more specific CSS selector.`
    );
  }

  // Handle element not interactable (must be checked BEFORE timeout case)
  // This includes cases where an overlay/modal blocks the element
  if (message.includes('intercepts pointer events')) {
    return new Error(
      `Element "${selector}" is blocked by another element (likely a modal or overlay). ` +
        `Try dismissing any modals/cookie banners first.`
    );
  }

  // Handle element not visible
  if (message.includes('not visible') && !message.includes('Timeout')) {
    return new Error(
      `Element "${selector}" is not visible. ` +
        `Try scrolling it into view or check if it's hidden.`
    );
  }

  // Handle general timeout (element exists but action couldn't complete)
  if (message.includes('Timeout') && message.includes('exceeded')) {
    return new Error(
      `Action on "${selector}" timed out. The element may be blocked, still loading, or not interactable. ` +
        `Run 'snapshot' to check the current page state.`
    );
  }

  // Handle element not found (timeout waiting for element)
  if (
    message.includes('waiting for') &&
    (message.includes('to be visible') || message.includes('Timeout'))
  ) {
    return new Error(
      `Element "${selector}" not found or not visible. ` +
        `Run 'snapshot' to see current page elements.`
    );
  }

  // Return original error for unknown cases
  return error instanceof Error ? error : new Error(message);
}

let actionPolicy: ActionPolicy | null = null;
let confirmCategories = new Set<string>();

export function initActionPolicy(): void {
  const policyPath = process.env.AGENT_BROWSER_ACTION_POLICY;
  if (policyPath) {
    try {
      actionPolicy = loadPolicyFile(policyPath);
      initPolicyReloader(policyPath, actionPolicy);
    } catch (err) {
      console.error(
        `[ERROR] Failed to load action policy from ${policyPath}: ${err instanceof Error ? err.message : err}`
      );
      process.exit(1);
    }
  }

  const confirmActionsEnv = process.env.AGENT_BROWSER_CONFIRM_ACTIONS;
  if (confirmActionsEnv) {
    confirmCategories = new Set(
      confirmActionsEnv
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.length > 0)
    );
  }
}

/**
 * Execute a command and return a response
 */
export async function executeCommand(command: Command, browser: BrowserManager): Promise<Response> {
  try {
    // Handle confirm/deny actions (bypass policy check)
    if (command.action === 'confirm') {
      return await handleConfirm(command, browser);
    }
    if (command.action === 'deny') {
      return handleDeny(command);
    }

    // Hot-reload policy file if it changed on disk
    actionPolicy = reloadPolicyIfChanged();

    // Policy enforcement
    const decision = checkPolicy(command.action, actionPolicy, confirmCategories);
    if (decision === 'deny') {
      const category = getActionCategory(command.action);
      return errorResponse(command.id, `Action denied by policy: '${category}' is not allowed`);
    }
    if (decision === 'confirm') {
      const category = getActionCategory(command.action);
      const description = describeAction(
        command.action,
        command as unknown as Record<string, unknown>
      );
      const { confirmationId } = requestConfirmation(
        command.action,
        category,
        description,
        command as unknown as Record<string, unknown>
      );
      return successResponse(command.id, {
        confirmation_required: true,
        action: command.action,
        category,
        description,
        confirmation_id: confirmationId,
      });
    }

    return await dispatchAction(command, browser);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(command.id, message);
  }
}

/**
 * Dispatch a command to its handler after policy checks have passed.
 */
async function dispatchAction(command: Command, browser: BrowserManager): Promise<Response> {
  switch (command.action) {
    case 'launch':
      return await handlers.handleLaunch(command, browser);
    case 'navigate':
      return await handlers.handleNavigate(command, browser);
    case 'click':
      return await handlers.handleClick(command, browser);
    case 'type':
      return await handlers.handleType(command, browser);
    case 'fill':
      return await handlers.handleFill(command, browser);
    case 'check':
      return await handlers.handleCheck(command, browser);
    case 'uncheck':
      return await handlers.handleUncheck(command, browser);
    case 'upload':
      return await handlers.handleUpload(command, browser);
    case 'dragdrop':
      return await handlers.handleDragDrop(command, browser);
    case 'dblclick':
      return errorResponse(command.id, 'Not implemented: dblclick');
    case 'focus':
      return errorResponse(command.id, 'Not implemented: focus');
    case 'drag':
      return errorResponse(command.id, 'Not implemented: drag');
    case 'frame':
      return await handlers.handleFrame(command, browser);
    case 'mainframe':
      return await handlers.handleMainFrame(command, browser);
    case 'getbyrole':
      return await handlers.handleGetByRole(command, browser);
    case 'getbytext':
      return await handlers.handleGetByText(command, browser);
    case 'getbylabel':
      return await handlers.handleGetByLabel(command, browser);
    case 'getbyplaceholder':
      return await handlers.handleGetByPlaceholder(command, browser);
    case 'press':
      return await handlers.handlePress(command, browser);
    case 'screenshot':
      return await handlers.handleScreenshot(command, browser);
    case 'snapshot':
      return await handlers.handleSnapshot(command, browser);
    case 'evaluate':
      return await handlers.handleEvaluate(command, browser);
    case 'wait':
      return await handlers.handleWait(command, browser);
    case 'scroll':
      return await handlers.handleScroll(command, browser);
    case 'select':
      return errorResponse(command.id, 'Not implemented: select');
    case 'hover':
      return await handlers.handleHover(command, browser);
    case 'content':
      return await handlers.handleContent(command, browser);
    case 'close':
      return await handlers.handleClose(command, browser);
    case 'tab_new':
      return await handlers.handleTabNew(command, browser);
    case 'tab_list':
      return await handlers.handleTabList(command, browser);
    case 'tab_switch':
      return await handlers.handleTabSwitch(command, browser);
    case 'tab_close':
      return await handlers.handleTabClose(command, browser);
    case 'window_new':
      return await handlers.handleWindowNew(command, browser);
    case 'window_list':
      return await handlers.handleWindowList(command, browser);
    case 'cookies_get':
      return await handlers.handleCookiesGet(command, browser);
    case 'cookies_set':
      return await handlers.handleCookiesSet(command, browser);
    case 'cookies_clear':
      return await handlers.handleCookiesClear(command, browser);
    case 'storage_get':
      return await handlers.handleStorageGet(command, browser);
    case 'storage_set':
      return await handlers.handleStorageSet(command, browser);
    case 'storage_clear':
      return await handlers.handleStorageClear(command, browser);
    case 'dialog':
      return await handlers.handleDialog(command, browser);
    case 'pdf':
      return await handlers.handlePdf(command, browser);
    case 'route':
      return await handlers.handleRoute(command, browser);
    case 'unroute':
      return await handlers.handleUnroute(command, browser);
    case 'requests':
      return await handlers.handleRequests(command, browser);
    case 'download':
      return await handlers.handleDownload(command, browser);
    case 'geolocation':
      return await handlers.handleGeolocation(command, browser);
    case 'permissions':
      return await handlers.handlePermissions(command, browser);
    case 'viewport':
      return await handlers.handleViewport(command, browser);
    case 'useragent':
      return errorResponse(command.id, 'Not implemented: useragent');
    case 'device':
      return await handlers.handleDevice(command, browser);
    case 'back':
      return await handlers.handleBack(command, browser);
    case 'forward':
      return await handlers.handleForward(command, browser);
    case 'reload':
      return await handlers.handleReload(command, browser);
    case 'url':
      return await handlers.handleUrl(command, browser);
    case 'title':
      return await handlers.handleTitle(command, browser);
    case 'getattribute':
      return await handlers.handleGetAttribute(command, browser);
    case 'gettext':
      return await handlers.handleGetText(command, browser);
    case 'isvisible':
      return await handlers.handleIsVisible(command, browser);
    case 'isenabled':
      return await handlers.handleIsEnabled(command, browser);
    case 'ischecked':
      return await handlers.handleIsChecked(command, browser);
    case 'count':
      return await handlers.handleCount(command, browser);
    case 'boundingbox':
      return await handlers.handleBoundingBox(command, browser);
    case 'styles':
      return await handlers.handleStyles(command, browser);
    case 'video_start':
      return errorResponse(command.id, 'Not implemented: video_start');
    case 'video_stop':
      return errorResponse(command.id, 'Not implemented: video_stop');
    case 'trace_start':
      return await handlers.handleTraceStart(command, browser);
    case 'trace_stop':
      return await handlers.handleTraceStop(command, browser);
    case 'profiler_start':
      return await handlers.handleProfilerStart(command, browser);
    case 'profiler_stop':
      return await handlers.handleProfilerStop(command, browser);
    case 'har_start':
      return await handlers.handleHarStart(command, browser);
    case 'har_stop':
      return await handlers.handleHarStop(command, browser);
    case 'state_save':
      return errorResponse(command.id, 'Not implemented: state_save');
    case 'state_load':
      return errorResponse(command.id, 'Not implemented: state_load');
    case 'state_list':
      return errorResponse(command.id, 'Not implemented: state_list');
    case 'state_clear':
      return errorResponse(command.id, 'Not implemented: state_clear');
    case 'state_show':
      return errorResponse(command.id, 'Not implemented: state_show');
    case 'state_clean':
      return errorResponse(command.id, 'Not implemented: state_clean');
    case 'state_rename':
      return errorResponse(command.id, 'Not implemented: state_rename');
    case 'console':
      return await handlers.handleConsole(command, browser);
    case 'errors':
      return await handlers.handleErrors(command, browser);
    case 'keyboard':
      return await handlers.handleKeyboard(command, browser);
    case 'wheel':
      return await handlers.handleWheel(command, browser);
    case 'tap':
      return await handlers.handleTap(command, browser);
    case 'clipboard':
      return errorResponse(command.id, 'Not implemented: clipboard');
    case 'highlight':
      return await handlers.handleHighlight(command, browser);
    case 'clear':
      return await handlers.handleClear(command, browser);
    case 'selectall':
      return await handlers.handleSelectAll(command, browser);
    case 'innertext':
      return await handlers.handleInnerText(command, browser);
    case 'innerhtml':
      return await handlers.handleInnerHtml(command, browser);
    case 'inputvalue':
      return await handlers.handleInputValue(command, browser);
    case 'setvalue':
      return await handlers.handleSetValue(command, browser);
    case 'dispatch':
      return errorResponse(command.id, 'Not implemented: dispatch');
    case 'evalhandle':
      return errorResponse(command.id, 'Not implemented: evalhandle');
    case 'expose':
      return errorResponse(command.id, 'Not implemented: expose');
    case 'addscript':
      return await handlers.handleAddScript(command, browser);
    case 'addstyle':
      return await handlers.handleAddStyle(command, browser);
    case 'emulatemedia':
      return await handlers.handleEmulateMedia(command, browser);
    case 'offline':
      return await handlers.handleOffline(command, browser);
    case 'headers':
      return await handlers.handleHeaders(command, browser);
    case 'pause':
      return await handlers.handlePause(command, browser);
    case 'getbyalttext':
      return await handlers.handleGetByAltText(command, browser);
    case 'getbytitle':
      return await handlers.handleGetByTitle(command, browser);
    case 'getbytestid':
      return await handlers.handleGetByTestId(command, browser);
    case 'nth':
      return await handlers.handleNth(command, browser);
    case 'waitforurl':
      return await handlers.handleWaitForUrl(command, browser);
    case 'waitforloadstate':
      return await handlers.handleWaitForLoadState(command, browser);
    case 'setcontent':
      return await handlers.handleSetContent(command, browser);
    case 'timezone':
      return await handlers.handleTimezone(command, browser);
    case 'locale':
      return await handlers.handleLocale(command, browser);
    case 'credentials':
      return await handlers.handleCredentials(command, browser);
    case 'mousemove':
      return errorResponse(command.id, 'Not implemented: mousemove');
    case 'mousedown':
      return errorResponse(command.id, 'Not implemented: mousedown');
    case 'mouseup':
      return errorResponse(command.id, 'Not implemented: mouseup');
    case 'bringtofront':
      return errorResponse(command.id, 'Not implemented: bringtofront');
    case 'waitforfunction':
      return errorResponse(command.id, 'Not implemented: waitforfunction');
    case 'scrollintoview':
      return errorResponse(command.id, 'Not implemented: scrollintoview');
    case 'addinitscript':
      return errorResponse(command.id, 'Not implemented: addinitscript');
    case 'keydown':
      return await handlers.handleKeyDown(command, browser);
    case 'keyup':
      return await handlers.handleKeyUp(command, browser);
    case 'inserttext':
      return await handlers.handleInsertText(command, browser);
    case 'multiselect':
      return errorResponse(command.id, 'Not implemented: multiselect');
    case 'waitfordownload':
      return errorResponse(command.id, 'Not implemented: waitfordownload');
    case 'responsebody':
      return await handlers.handleResponseBody(command, browser);
    case 'screencast_start':
      return await handlers.handleScreencastStart(command, browser);
    case 'screencast_stop':
      return await handlers.handleScreencastStop(command, browser);
    case 'input_mouse':
      return await handlers.handleInputMouse(command, browser);
    case 'input_keyboard':
      return await handlers.handleInputKeyboard(command, browser);
    case 'input_touch':
      return await handlers.handleInputTouch(command, browser);
    case 'recording_start':
      return await handlers.handleRecordingStart(command, browser);
    case 'recording_stop':
      return await handlers.handleRecordingStop(command, browser);
    case 'recording_restart':
      return await handlers.handleRecordingRestart(command, browser);
    case 'diff_snapshot':
      return await handlers.handleDiffSnapshot(command, browser);
    case 'diff_screenshot':
      return await handlers.handleDiffScreenshot(command, browser);
    case 'diff_url':
      return await handlers.handleDiffUrl(command, browser);
    case 'auth_login':
      return await handlers.handleAuthLogin(command, browser);
    default: {
      // TypeScript narrows to never here, but we handle it for safety
      const unknownCommand = command as { id: string; action: string };
      return errorResponse(unknownCommand.id, `Unknown action: ${unknownCommand.action}`);
    }
  }
}

async function handleConfirm(command: ConfirmCommand, browser: BrowserManager): Promise<Response> {
  const entry = getAndRemovePending(command.confirmationId);
  if (!entry) {
    return errorResponse(command.id, `No pending confirmation with id '${command.confirmationId}'`);
  }

  // Re-validate the stored command through the schema to guard against
  // shape drift between when the confirmation was issued and now.
  const parseResult = parseCommand(JSON.stringify(entry.command));
  if (!parseResult.success) {
    const errorMsg = (parseResult as any).error || 'Unknown error';
    return errorResponse(command.id, `Stored command is no longer valid: ${errorMsg}`);
  }
  const originalCommand = parseResult.command;

  // Re-check deny list in case policy was updated since the confirmation was issued
  actionPolicy = reloadPolicyIfChanged();
  const decision = checkPolicy(originalCommand.action, actionPolicy, new Set());
  if (decision === 'deny') {
    const category = getActionCategory(originalCommand.action);
    return errorResponse(command.id, `Action denied by policy: '${category}' is not allowed`);
  }

  return await dispatchAction(originalCommand, browser);
}

function handleDeny(command: DenyCommand): Response {
  const entry = getAndRemovePending(command.confirmationId);
  if (!entry) {
    return errorResponse(command.id, `No pending confirmation with id '${command.confirmationId}'`);
  }
  return successResponse(command.id, { denied: true });
}
