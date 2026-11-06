; SeedhaPrint for Windows - installer (NSIS). Built by build.mjs on any OS.
;
; Runs on Windows 7, 8, 10 and 11 (32 and 64-bit), using only tools Windows 7 ships with.
;
; Program   C:\Program Files (x86)\SeedhaPrint\      (app, agent, SumatraPDF)
; Data      C:\ProgramData\SeedhaPrintAgent\          (this PC's pairing, logs; kept on update)
; Autostart all-users Startup folder, so it runs as the signed-in user and sees their printers.
;
; Defines from the build: VERSION (x.y.z), SRC (staging folder), OUTFILE

Unicode true
!include "MUI2.nsh"

!define APP "SeedhaPrint"
!define EXE "SeedhaPrint.exe"
!define DATADIR "$APPDATA\SeedhaPrintAgent" ; $APPDATA = C:\ProgramData under SetShellVarContext all
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SeedhaPrint"

Name "${APP}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES\${APP}"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "SeedhaPrint"
ManifestSupportedOS all

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "CompanyName" "SeedhaPrint"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "SeedhaPrint"

!define MUI_ICON "${SRC}\app.ico"
!define MUI_UNICON "${SRC}\app.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APP} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Everything for your shop in one app: customer jobs, printers, earnings and settings.$\r$\n$\r$\nInstall it on the computer your printers are connected to, and make sure the printer drivers are already installed.$\r$\n$\r$\nIt opens by itself every time Windows starts."
!define MUI_FINISHPAGE_TITLE "SeedhaPrint is ready"
!define MUI_FINISHPAGE_TEXT "Sign in with your shop's phone number and password, then open Printers and click Connect this PC."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open SeedhaPrint now"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro StopApp
  nsExec::Exec 'taskkill.exe /F /IM ${EXE}'
  nsExec::Exec 'taskkill.exe /F /IM SeedhaPrintAgent.exe'
  Sleep 800
!macroend

Function .onInit
  SetShellVarContext all
FunctionEnd

Section "Install"
  SetShellVarContext all
  !insertmacro StopApp

  ; Replace the earlier agent-only install. Its data folder stays, so a paired PC stays paired.
  Delete "$SMSTARTUP\SeedhaPrint Agent.lnk"
  RMDir /r "$SMPROGRAMS\SeedhaPrint Agent"
  RMDir /r "$PROGRAMFILES\SeedhaPrint Agent"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SeedhaPrintAgent"

  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\app\*.*"
  File "${SRC}\app.ico"

  ; The app runs as the normal user, so let users write its data folder (BUILTIN\Users, any language).
  CreateDirectory "${DATADIR}"
  nsExec::Exec 'icacls.exe "${DATADIR}" /grant *S-1-5-32-545:(OI)(CI)M /T /Q'

  CreateShortcut "$SMSTARTUP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APP}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "SeedhaPrint"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
SectionEnd

; Going through Explorer drops the installer's admin rights.
Function OpenApp
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${EXE}"'
FunctionEnd

Section "Uninstall"
  SetShellVarContext all
  !insertmacro StopApp
  Delete "$SMSTARTUP\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTKEY}"
  MessageBox MB_YESNO|MB_ICONQUESTION "Also remove this PC's connection and logs?$\r$\n(Choose No if you will reinstall on this PC.)" IDNO keep
    RMDir /r "${DATADIR}"
  keep:
SectionEnd
