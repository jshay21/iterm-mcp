import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export default class TtyOutputReader {
  static async call(linesOfOutput?: number, ttyPath?: string) {
    const buffer = await this.retrieveBuffer(ttyPath);
    if (!linesOfOutput) {
      return buffer;
    }
    const lines = buffer.split('\n');
    return lines.slice(-linesOfOutput - 1).join('\n');
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