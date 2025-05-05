import { exec } from 'child_process';
import { promisify } from 'util';
import { openSync, closeSync } from 'fs';
import ProcessTracker from './ProcessTracker.js';
import TtyOutputReader from './TtyOutputReader.js';

/**
 * CommandExecutor handles sending commands to iTerm2 via AppleScript.
 * 
 * This includes special handling for multiline text to prevent AppleScript syntax errors
 * when dealing with newlines in command strings. The approach uses AppleScript string 
 * concatenation with explicit line breaks rather than trying to embed newlines directly
 * in the AppleScript string.
 */

const execPromise = promisify(exec);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class CommandExecutor {
  private _execPromise: typeof execPromise;
  private targetTtyPath: string | null = null;

  /**
   * Creates an instance of CommandExecutor.
   * @param targetTtyPath Optional. The TTY device path (e.g., /dev/ttys005) of the target iTerm session.
   *                      If not provided, commands will target the current active iTerm session.
   */
  constructor(targetTtyPath?: string) {
    this.targetTtyPath = targetTtyPath || null;
    this._execPromise = execPromise;
  }

  /**
   * Executes a command in the target iTerm2 terminal session.
   * Handles single-line and multiline commands, waits for completion, and retrieves output.
   * Uses the target TTY path if provided, otherwise defaults to the current session.
   *
   * @param command The command to execute (can contain newlines)
   * @returns A promise that resolves to the terminal output after command execution
   */
  async executeCommand(command: string): Promise<string> {
    const escapedCommand = this.escapeForAppleScript(command);
    const scriptPrefix = this.getAppleScriptTargetPrefix();
    const scriptSuffix = this.getAppleScriptTargetSuffix();

    try {
      let scriptCommand: string;
      if (command.includes('\n')) {
        // Multiline: use evaluated expression
        scriptCommand = `write text (${escapedCommand})`;
      } else {
        // Single line: use standard quoted string
        scriptCommand = `write text "${escapedCommand}"`;
      }

      // Construct the full AppleScript
      // Ensure correct quoting for the -e argument
      const fullScript = `'${scriptPrefix} to ${scriptCommand}${scriptSuffix}'`;
      await this._execPromise(`/usr/bin/osascript -e ${fullScript}`);

      // --- Wait for completion ---
      // isProcessing needs to be updated to use the target TTY as well
      while (await this.isProcessing()) { // This uses the updated isProcessing
        await sleep(100);
      }

      // --- Get TTY and wait for input prompt ---
      // retrieveTtyPath will now return the correct path
      const ttyPath = await this.retrieveTtyPath();
      // isWaitingForUserInput already uses the correct ttyPath argument
      while (await this.isWaitingForUserInput(ttyPath) === false) {
        await sleep(100);
      }

      // Give a small delay for output to settle
      await sleep(200);

      // Retrieve the terminal output after command execution
      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer()
      return afterCommandBuffer
    } catch (error: unknown) {
      // Improve error message if session wasn't found
      if (error instanceof Error && error.message.includes("Session with TTY")) {
         throw new Error(`Failed to execute command: ${error.message}`);
      }
       // Check for iTerm not running
      if (error instanceof Error && error.message.includes("Application isn\\'t running")) {
          throw new Error(`Failed to execute command: iTerm2 application might not be running. Original error: ${error.message}`);
      }
      throw new Error(`Failed to execute command: ${(error as Error).message}`);
    }
  }

  async isWaitingForUserInput(ttyPath: string): Promise<boolean> {
    let fd;
    try {
      // Open the TTY file descriptor in non-blocking mode
      fd = openSync(ttyPath, 'r');
      const tracker = new ProcessTracker();
      let belowThresholdTime = 0;
      
      while (true) {
        try {
          const activeProcess = await tracker.getActiveProcess(ttyPath);
          
          if (!activeProcess) return true;

          if (activeProcess.metrics.totalCPUPercent < 1) {
            belowThresholdTime += 350;
            if (belowThresholdTime >= 1000) return true;
          } else {
            belowThresholdTime = 0;
          }

        } catch {
          return true;
        }

        await sleep(350);
      }
    } catch (error: unknown) {
      return true;
    } finally {
      if (fd !== undefined) {
        closeSync(fd);
      }
      return true;
    }
  }

  /**
   * Escapes a string for use in an AppleScript command.
   * 
   * This method handles two scenarios:
   * 1. For multiline text (containing newlines), it uses a special AppleScript
   *    string concatenation approach to properly handle line breaks
   * 2. For single-line text, it escapes special characters for AppleScript compatibility
   * 
   * @param str The string to escape
   * @returns A properly escaped string ready for AppleScript execution
   */
  private escapeForAppleScript(str: string): string {
    // Check if the string contains newlines
    if (str.includes('\n')) {
      // For multiline text, we need to use a different AppleScript approach
      // that properly handles newlines in AppleScript
      return this.prepareMultilineCommand(str);
    }
    
    // First, escape any backslashes
    str = str.replace(/\\/g, '\\\\');
    
    // Escape double quotes
    str = str.replace(/"/g, '\\"');
    
    // Handle single quotes by breaking out of the quote, escaping the quote, and going back in
    str = str.replace(/'/g, "'\\''");
    
    // Handle special characters (except newlines which are handled separately)
    str = str.replace(/[^\x20-\x7E]/g, (char) => {
      return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
    });
    
    return str;
  }
  
  /**
   * Prepares a multiline string for use in AppleScript.
   * 
   * This method handles multiline text by splitting it into separate lines
   * and creating an AppleScript expression that concatenates these lines
   * with explicit 'return' statements between them. This approach avoids
   * syntax errors that occur when trying to directly include newlines in
   * AppleScript strings.
   * 
   * @param str The multiline string to prepare
   * @returns An AppleScript-compatible string expression that preserves line breaks
   */
  private prepareMultilineCommand(str: string): string {
    // Split the input by newlines and prepare each line separately
    const lines = str.split('\n');
    
    // Create an AppleScript string that concatenates all lines with proper line breaks
    let applescriptString = '"' + this.escapeAppleScriptString(lines[0]) + '"';
    
    for (let i = 1; i < lines.length; i++) {
      // For each subsequent line, use AppleScript's string concatenation with line feed
      // The 'return' keyword in AppleScript adds a newline character
      applescriptString += ' & return & "' + this.escapeAppleScriptString(lines[i]) + '"'; 
    }
    
    return applescriptString;
  }
  
  /**
   * Escapes a single line of text for use in an AppleScript string.
   * 
   * Handles special characters that would otherwise cause syntax errors
   * in AppleScript strings:
   * - Backslashes are doubled to avoid escape sequence interpretation
   * - Double quotes are escaped to avoid prematurely terminating the string
   * - Tabs are replaced with their escape sequence
   * 
   * @param str The string to escape (should not contain newlines)
   * @returns The escaped string
   */
  private escapeAppleScriptString(str: string): string {
    // Escape quotes and backslashes for AppleScript string
    return str
      .replace(/\\/g, '\\\\')  // Double backslashes
      .replace(/"/g, '\\"')    // Escape double quotes
      .replace(/\t/g, '\\t');  // Handle tabs
  }

  /**
   * Retrieves the TTY device path for the target iTerm session.
   * If a target TTY path was provided to the constructor, it returns that path.
   * Otherwise, it retrieves the TTY path of the current active iTerm session via AppleScript.
   * @returns A promise that resolves to the TTY path string.
   */
  private async retrieveTtyPath(): Promise<string> {
    // If we have a target TTY, just return it.
    if (this.targetTtyPath) {
      // Basic validation
      if (!this.targetTtyPath.startsWith('/dev/tty')) {
          console.warn(`Warning: Provided target TTY path "${this.targetTtyPath}" does not look like a valid TTY path (e.g., /dev/ttys001).`);
      }
      return this.targetTtyPath;
    }
    // Otherwise, get the TTY of the current session (original behavior)
    try {
      // No need for complex targeting here, just get the current one if no target specified
      const { stdout } = await this._execPromise(`/usr/bin/osascript -e 'tell application "iTerm2" to tell current session of current window to get tty'`);
      const tty = stdout.trim();
      if (!tty) {
        throw new Error("Could not retrieve TTY path for the current iTerm session.");
      }
      return tty;
    } catch (error: unknown) {
       // Provide more context in error
      if (error instanceof Error && error.message.includes("Application isn\\'t running")) {
          throw new Error(`Failed to retrieve TTY path: iTerm2 application might not be running. Original error: ${error.message}`);
      }
      throw new Error(`Failed to retrieve TTY path: ${(error as Error).message}`);
    }
  }

  /**
   * Checks if the target iTerm session is currently processing a command.
   * Uses the target TTY path if provided, otherwise defaults to the current session.
   * @returns A promise that resolves to true if processing, false otherwise.
   */
  private async isProcessing(): Promise<boolean> {
    const scriptPrefix = this.getAppleScriptTargetPrefix();
    const scriptSuffix = this.getAppleScriptTargetSuffix();
    const scriptCommand = 'get is processing';
    // Ensure correct quoting for the -e argument
    const fullScript = `'${scriptPrefix} to ${scriptCommand}${scriptSuffix}'`;

    try {
      const { stdout } = await this._execPromise(`/usr/bin/osascript -e ${fullScript}`);
      return stdout.trim() === 'true';
    } catch (error: unknown) {
       // Improve error message if session wasn't found or iTerm not running
      if (error instanceof Error) {
          if (error.message.includes("Session with TTY")) {
             throw new Error(`Failed to check processing status: ${error.message}`);
          }
           if (error.message.includes("Application isn\\'t running")) {
              throw new Error(`Failed to check processing status: iTerm2 application might not be running. Original error: ${error.message}`);
          }
      }
      throw new Error(`Failed to check processing status: ${(error as Error).message}`);
    }
  }

  /**
   * Generates the AppleScript prefix to target the correct iTerm session.
   * If a targetTtyPath is specified, it finds the session by TTY.
   * Otherwise, it targets the current session of the current window.
   * @returns The AppleScript prefix string.
   */
  private getAppleScriptTargetPrefix(): string {
    if (this.targetTtyPath) {
      // Correctly escape backslashes first, then quotes for AppleScript
      const escapedTty = this.targetTtyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      // Note: This AppleScript iterates through all windows and sessions.
      // It might be slightly less performant than targeting 'current session' directly
      // if there are many windows/sessions open.
      // Using 'try...on error...end try' inside AppleScript can sometimes help with stability
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
`.trim(); // Use trim() to remove leading/trailing whitespace for clean embedding
    } else {
      // Fallback to original behavior: target the current session
      return 'tell application "iTerm2" to tell current session of current window';
    }
  }

  /**
   * Generates the AppleScript suffix corresponding to the prefix from getAppleScriptTargetPrefix.
   * @returns The AppleScript suffix string.
   */
  private getAppleScriptTargetSuffix(): string {
    if (this.targetTtyPath) {
      // Close the 'tell sess' and 'tell application' blocks, handle not found case
      return `
					end tell -- end tell sess
					-- Exit loops once action is performed on the target session
					-- Use 'exit repeat' if performing an action, but for 'get' we might need to let it finish the loop
					-- For simplicity here, assume we only care about the first match
					-- If the command was 'write text', we'd want to exit here.
					-- If it was 'get is processing', maybe not. Let's refine if needed.
					-- Adding an explicit return for functions like 'get is processing' might be safer
					return result -- Return the result from the 'get' command
				end if
			on error errMsg number errNum
				-- Ignore errors from sessions that might be closing or invalid
			end try
		end repeat
	end repeat
	if not sessionFound then
		error "Session with TTY " & targetTty & " not found."
	end if
end tell -- end tell application "iTerm2"
`.trim(); // Use trim() to remove leading/trailing whitespace
    } else {
      // No suffix needed for the simpler 'current session' case
      return '';
    }
  }
}

export default CommandExecutor;