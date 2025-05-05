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

  // Helper to generate AppleScript prefix/suffix (similar to CommandExecutor)
  private static getAppleScriptTargetPrefix(ttyPath?: string): string {
    if (ttyPath) {
      // Correctly escape backslashes first, then quotes for AppleScript
      const escapedTty = ttyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

  private static getAppleScriptTargetSuffix(ttyPath?: string): string {
    if (ttyPath) {
      return `
					end tell -- end tell sess
					return result -- Return the result from the 'get' command
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

  static async retrieveBuffer(ttyPath?: string): Promise<string> {
    const scriptPrefix = this.getAppleScriptTargetPrefix(ttyPath);
    const scriptSuffix = this.getAppleScriptTargetSuffix(ttyPath);
    const scriptCommand = `get contents`; 
    const ascript = `${scriptPrefix} ${scriptCommand}${scriptSuffix}`;

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