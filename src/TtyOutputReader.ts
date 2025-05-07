import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export default class TtyOutputReader {
  static async call(linesOfOutput?: number, ttyPath?: string, filterBase64: boolean = true) {
    const buffer = await this.retrieveBuffer(ttyPath);
    let processedBuffer = buffer;
    
    // Filter out base64 blobs if requested
    if (filterBase64) {
      // Filter out IMGCAT and similar base64 content
      processedBuffer = this.filterBase64Content(buffer);
    }
    
    if (!linesOfOutput) {
      return processedBuffer;
    }
    
    const lines = processedBuffer.split('\n');
    return lines.slice(-linesOfOutput - 1).join('\n');
  }
  
  /**
   * Filters out base64-encoded content (like IMGCAT output) from terminal output
   * @param content Terminal output text
   * @returns Filtered content with base64 blobs replaced by placeholders
   */
  static filterBase64Content(content: string): string {
    // Base64 pattern: continuous string of A-Z, a-z, 0-9, +, /, and = at the end
    const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/g;
    
    // IMGCAT specific patterns
    const imgcatPrefixPattern = /\x1b\]1337;File=([^:]+)(:[^\n]+)?\n/g;
    
    // Replace base64 content with a placeholder
    let filteredContent = content.replace(base64Pattern, '[BASE64_IMAGE_CONTENT_FILTERED]');
    
    // Also handle IMGCAT specific control sequences
    filteredContent = filteredContent.replace(imgcatPrefixPattern, '[IMGCAT_PREFIX_FILTERED]\n');
    
    return filteredContent;
  }

  static async retrieveBuffer(ttyPath?: string): Promise<string> {
    let ascript: string;
    
    if (ttyPath) {
      // Use the verified and working AppleScript format for targeting a specific session
      ascript = `
tell application "iTerm2"
  set foundSession to false
  set targetTTY to "${ttyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
  
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        try
          set sessionTty to tty of aSession
          if sessionTty is equal to targetTTY then
            tell aSession
              set termContents to contents
            end tell
            set foundSession to true
            return termContents
          end if
        on error
          -- Ignore errors and continue
        end try
      end repeat
      if foundSession then exit repeat
    end repeat
    if foundSession then exit repeat
  end repeat
  
  if not foundSession then
    return "Session with TTY " & targetTTY & " not found"
  end if
end tell`;
    } else {
      // For current session, use the simple approach
      ascript = 'tell application "iTerm2" to tell current session of current window to get contents';
    }

    try {
      const { stdout: finalContent } = await execPromise(`osascript -e '${ascript}'`);
      return finalContent.trim();
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes("Session with TTY")) {
          throw new Error(`Failed to retrieve buffer: ${error.message}`);
        }
        if (error.message.includes("Application isn\\'t running")) {
          throw new Error(`Failed to retrieve buffer: iTerm2 application might not be running. Original error: ${error.message}`);
        }
      }
      throw new Error(`Failed to retrieve buffer: ${(error as Error).message}`);
    }
  }
}