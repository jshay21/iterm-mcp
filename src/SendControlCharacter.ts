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

  // Helper to generate AppleScript prefix/suffix (similar to CommandExecutor)
  private getAppleScriptTargetPrefix(): string {
    if (this.targetTtyPath) {
      // Correctly escape backslashes first, then quotes for AppleScript
      const escapedTty = this.targetTtyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `
tell application "iTerm2"
	set targetTty to "${escapedTty}"
	set sessionFound to false
	repeat with win in windows
		repeat with sess in sessions of win
			try
				if tty of sess is targetTty then
					set sessionFound to true
					tell sess -- Found the target session
`.trim();
    } else {
      return 'tell application "iTerm2" to tell current session of current window';
    }
  }

  private getAppleScriptTargetSuffix(): string {
    if (this.targetTtyPath) {
      return `
					end tell -- end tell sess
					-- Exit loop after action
					return -- Assuming the action was performed
				end if
			on error errMsg number errNum
				-- Ignore errors
			end try
		end repeat
	end repeat
	if not sessionFound then
		error "Session with TTY " & targetTty & " not found."
	end if
end tell
`.trim();
    } else {
      return '';
    }
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

    const scriptPrefix = this.getAppleScriptTargetPrefix();
    const scriptSuffix = this.getAppleScriptTargetSuffix();
    // The core command uses the controlCode variable
    const scriptCommand = `write text (ASCII character ${controlCode})`; 
    const ascript = `${scriptPrefix} to ${scriptCommand}${scriptSuffix}`;

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