import type { BrowserManager } from '../../browser';
import type { Response, UploadCommand, DragDropCommand } from '../../types';
import { successResponse, errorResponse } from '../../protocol';
import * as fs from 'fs';
import * as path from 'path';
import { browserLog } from '../browserLog';

export async function handleUpload(
  command: UploadCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector);
  const files = Array.isArray(command.files) ? command.files : [command.files];
  await locator.setInputFiles(files);
  return successResponse(command.id, { uploaded: true });
}

export async function handleDragDrop(
  command: DragDropCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const files = Array.isArray(command.files) ? command.files : [command.files];

  const { log, info, warn, error } = browserLog(page);

  // Validate all files exist first
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      return errorResponse(command.id, `File not found: ${filePath}`);
    }
  }

  info('[DRAGDROP] Processing', files.length, 'files');

  try {
    // Find the target element
    const target = page.locator(command.target);

    // Check if target exists
    const count = await target.count();
    if (count === 0) {
      return errorResponse(command.id, `Target not found: ${command.target}`);
    }

    // Get element info and check for drag/drop event listeners
    const elementInfo = await target.evaluate((el) => {
      // Try to get event listeners (Chrome DevTools API)
      let listeners: any = {};
      try {
        // @ts-ignore - getEventListeners is available in Chrome DevTools
        const globalListeners = getEventListeners(window);
        listeners = {
          window: Object.keys(globalListeners || {}),
        };
      } catch (e) {
        listeners.window = [];
      }

      return {
        tagName: el.tagName,
        type: (el as HTMLInputElement).type,
        className: el.className,
        id: el.id,
        ariaLabel: el.getAttribute('aria-label'),
        listeners,
      };
    });

    log('[DRAGDROP] Target element:', elementInfo);

    // Always use DataTransfer for dragdrop - don't click buttons or use setInputFiles
    // This simulates actual drag-drop behavior for all element types
    log('[DRAGDROP] Using DataTransfer to simulate drag-drop on', elementInfo.tagName);

    // Convert files to base64 for transfer
    const fileDataList = files.map((filePath) => {
      const content = fs.readFileSync(filePath);
      const base64 = content.toString('base64');
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const fileName = path.basename(filePath);
      return { base64, mimeType, fileName };
    });

    // Use evaluate to create File objects and dispatch proper drag/drop event sequence
    await target.evaluate(
      async (element, { fileDataList }) => {
        // Create DataTransfer with files
        const dt = new DataTransfer();
        for (const { base64, mimeType, fileName } of fileDataList) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const file = new File([bytes], fileName, { type: mimeType });
          dt.items.add(file);
        }

        // Simulate complete drag/drop event sequence
        // 1. dragenter - tells browser a drag is entering
        const dragEnter = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        element.dispatchEvent(dragEnter);

        // 2. dragover - required to allow drop (prevents default)
        const dragOver = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        const draggedOver = element.dispatchEvent(dragOver);

        // 3. drop - the actual drop event
        const drop = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        element.dispatchEvent(drop);

        // 4. dragend - cleanup
        const dragEnd = new DragEvent('dragend', {
          bubbles: true,
          cancelable: false,
          dataTransfer: dt,
        });
        element.dispatchEvent(dragEnd);
      },
      { fileDataList }
    );

    log('[DRAGDROP] Files dropped via DataTransfer');
    return successResponse(command.id, { dropped: files, method: 'datatransfer' });
  } catch (error: any) {
    error('[DRAGDROP] Error:', error);
    return errorResponse(command.id, `DragDrop failed: ${error.message}`);
  }
}
