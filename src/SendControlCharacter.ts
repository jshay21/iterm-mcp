import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

class SendControlCharacter {
  private targetTtyPath: string | null = null;

  constructor(targetTtyPath?: string) {
    this.targetTtyPath = targetTtyPath || null;
  }

  // This method is added for testing purposes
  protected async executeCommand(command: string): Promise<void> {
    await execPromise(command);
  }

  async send(letter: string): Promise<void> {
    let controlCode: number;
    
    // Handle special cases for telnet escape sequences
    if (letter.toUpperCase() === ']') {
      // ASCII 29 (GS - Group Separator) - the telnet escape character
      controlCode = 29;
    } 
    // Add other special cases here as needed
    else if (letter.toUpperCase() === 'ESCAPE' || letter.toUpperCase() === 'ESC') {
      // ASCII 27 (ESC - Escape)
      controlCode = 27;
    }
    else {
      // Validate input for standard control characters
      letter = letter.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) {
        throw new Error('Invalid control character letter');
      }
      
      // Convert to standard control code (A=1, B=2, etc.)
      controlCode = letter.charCodeAt(0) - 64;
    }

    let ascript: string;
    if (this.targetTtyPath) {
      // Use the verified and working AppleScript format for targeting a specific session
      ascript = `
tell application "iTerm2"
  set foundSession to false
  set targetTTY to "${this.targetTtyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
  
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        try
          set sessionTty to tty of aSession
          if sessionTty is equal to targetTTY then
            tell aSession
              write text (ASCII character ${controlCode})
            end tell
            set foundSession to true
            return
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
    error "Session with TTY " & targetTTY & " not found"
  end if
end tell`;
    } else {
      // For current session, use the simple approach
      ascript = `tell application "iTerm2" to tell current session of current window to write text (ASCII character ${controlCode})`;
    }

    try {
      await this.executeCommand(`osascript -e '${ascript}'`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes("Session with TTY")) {
          throw new Error(`Failed to send control character: ${error.message}`);
        }
        if (error.message.includes("Application isn\\'t running")) {
          throw new Error(`Failed to send control character: iTerm2 application might not be running. Original error: ${error.message}`);
        }
      }
      throw new Error(`Failed to send control character: ${(error as Error).message}`);
    }
  }
}

export default SendControlCharacter;