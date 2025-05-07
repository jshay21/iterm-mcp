tell application "iTerm2"
  set foundSession to false
  set targetTTY to "/dev/ttys001"
  
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
end tell