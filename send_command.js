#!/usr/bin/env node

// Simple script to send a command to a specific iTerm window by TTY
// Usage: node send_command.js [tty_path] [command]

import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Get arguments
const ttyPath = process.argv[2] || '/dev/ttys001';
const command = process.argv[3] || 'echo "Test message from external script"';

async function sendCommand() {
  const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  
  const ascript = `
tell application "iTerm2"
  set foundSession to false
  set targetTTY to "${ttyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
  
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        try
          if tty of aSession is targetTTY then
            tell aSession
              write text "${escapedCommand}"
            end tell
            set foundSession to true
            return "Command sent to " & targetTTY
          end if
        on error
          -- Skip errors for sessions that might not respond
        end try
      end repeat
    end repeat
  end repeat
  
  if not foundSession then
    error "Session with TTY " & targetTTY & " not found"
  end if
end tell`;

  try {
    console.log(`Sending command "${command}" to terminal ${ttyPath}...`);
    const { stdout } = await execPromise(`osascript -e '${ascript}'`);
    console.log("Result:", stdout.trim());
    return stdout.trim();
  } catch (error) {
    console.error("Error:", error.message);
    return `Error: ${error.message}`;
  }
}

// Run the function
sendCommand();