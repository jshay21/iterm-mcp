-- Test script for writing to a specific iTerm session
-- This script is intentionally simplified to avoid syntax errors

tell application "iTerm2"
  set foundSession to false
  set targetTTY to "/dev/ttys001"
  
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        try
          set sessionTty to tty of aSession
          if sessionTty is equal to targetTTY then
            tell aSession
              write text "echo 'Hello from direct AppleScript'"
            end tell
            set foundSession to true
            exit repeat
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
  else
    return "Command sent to " & targetTTY
  end if
end tell