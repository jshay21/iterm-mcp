const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

async function readTtyContents(ttyPath = '/dev/ttys001') {
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
              set buffer to contents
            end tell
            set foundSession to true
            return buffer
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

  console.log("Using AppleScript:", ascript);

  try {
    const { stdout } = await execPromise(`osascript -e '${ascript}'`);
    console.log("Result:", stdout.trim());
    return stdout.trim();
  } catch (error) {
    console.error("Error:", error);
    return `Error: ${error.message}`;
  }
}

// Run the function
readTtyContents();