-- Test script for reading from a specific iTerm session
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
end tell