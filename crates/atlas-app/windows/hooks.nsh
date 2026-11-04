; Installer hooks (tauri.windows.conf.json `installerHooks`): the capture box in the Start menu, with a global key.
; A Start-menu shortcut's key works from anywhere in Windows; Ctrl+Alt+Shift+C (the Windows key cannot be given to a
; shortcut, and Ctrl+Alt alone is AltGr on many layouts). atlas-capture.exe sits beside the app (externalBin).
!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$SMPROGRAMS\Atlas Capture.lnk" "$INSTDIR\atlas-capture.exe" "" "$INSTDIR\atlas-capture.exe" 0 SW_SHOWNORMAL "ALT|CONTROL|SHIFT|C" "Capture a thought into today's log"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\Atlas Capture.lnk"
!macroend
