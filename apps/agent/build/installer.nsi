; SeedhaPrint Agent - Windows installer (NSIS). Built by build.mjs on any OS.
;
;   Welcome -> Connect this PC (pairing code) -> Install -> Finish
;
; Runs on Windows 7, 8, 10 and 11 (32 and 64-bit): the agent is a 32-bit exe
; with no runtime to install, and this script uses only tools Windows 7 ships with.
;
; Program   C:\Program Files (x86)\SeedhaPrint Agent\   (agent, SumatraPDF)
; Data      C:\ProgramData\SeedhaPrintAgent\            (pairing, logs; kept on update)
; Autostart all-users Startup folder, so it runs as the signed-in user and sees their printers.
;
; Defines from the build: VERSION (x.y.z), SERVER (https://...), SRC (staging folder), OUTFILE

Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define APP "SeedhaPrint Agent"
!define EXE "SeedhaPrintAgent.exe"
!define DATADIR "$APPDATA\SeedhaPrintAgent" ; $APPDATA = C:\ProgramData under SetShellVarContext all
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SeedhaPrintAgent"
!define STATUS_URL "http://localhost:47210"

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

!define MUI_ICON "${SRC}\agent.ico"
!define MUI_UNICON "${SRC}\agent.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APP} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "This connects your shop's printers to SeedhaPrint, so customers who scan your QR code and pay get their prints automatically.$\r$\n$\r$\nInstall it on the computer the printers are connected to, and make sure the printer drivers are already installed.$\r$\n$\r$\nKeep the SeedhaPrint dashboard open: you will need a pairing code from Printers > Add shop PC."
!define MUI_FINISHPAGE_TITLE "Your printers are connected"
!define MUI_FINISHPAGE_TEXT "The agent runs quietly in the background and starts by itself with Windows.$\r$\n$\r$\nCheck the Printers page in your dashboard: this PC and its printers should appear in a few seconds. Send a test page to make sure."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Show the agent status page"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenStatus

!insertmacro MUI_PAGE_WELCOME
Page custom PairPage PairPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var Dialog
Var CodeField
Var ServerField
Var Code
Var Server
Var AlreadyPaired

Function .onInit
  SetShellVarContext all
  StrCpy $Server "${SERVER}"
  StrCpy $AlreadyPaired "0"
  IfFileExists "${DATADIR}\config.json" 0 +2
    StrCpy $AlreadyPaired "1"
FunctionEnd

!macro StopAgent
  nsExec::Exec 'taskkill.exe /F /IM ${EXE}'
  Sleep 800
!macroend

Function PairPage
  !insertmacro MUI_HEADER_TEXT "Connect this PC" "Pair it with your shop in the SeedhaPrint dashboard."
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${If} $AlreadyPaired == "1"
    ${NSD_CreateLabel} 0 0 100% 28u "This PC is already connected. Leave the code empty to keep it, or type a new code to connect it to a different shop."
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 28u "In the dashboard open Printers > Add shop PC and type the 8-character code it shows. A code works once and expires after 30 minutes."
  ${EndIf}
  Pop $0

  ${NSD_CreateLabel} 0 36u 100% 10u "Pairing code"
  Pop $0
  ${NSD_CreateText} 0 48u 130u 18u $Code
  Pop $CodeField
  CreateFont $1 "Consolas" 16 700
  SendMessage $CodeField ${WM_SETFONT} $1 1
  ${NSD_SetFocus} $CodeField

  ${NSD_CreateLabel} 0 82u 100% 10u "Server (only change this if SeedhaPrint support asks you to)"
  Pop $0
  ${NSD_CreateText} 0 94u 100% 13u $Server
  Pop $ServerField

  nsDialogs::Show
FunctionEnd

Function PairPageLeave
  ${NSD_GetText} $CodeField $Code
  ${NSD_GetText} $ServerField $Server

  ${If} $Code == ""
    ${If} $AlreadyPaired == "1"
      Return
    ${EndIf}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Please type the pairing code from the SeedhaPrint dashboard."
    Abort
  ${EndIf}

  ; Pair before installing, so a wrong code can be fixed right here.
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${SRC}\${EXE}"
  nsExec::ExecToStack '"$PLUGINSDIR\${EXE}" pair "$Code" "$Server"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP|MB_OK "This PC could not be connected:$\r$\n$\r$\n$1"
    Abort
  ${EndIf}
  StrCpy $AlreadyPaired "1"
  MessageBox MB_ICONINFORMATION|MB_OK "$1"
FunctionEnd

Section "Install"
  SetShellVarContext all
  !insertmacro StopAgent

  SetOutPath "$INSTDIR"
  File "${SRC}\${EXE}"
  File "${SRC}\SumatraPDF.exe"
  File "${SRC}\agent.ico"

  ; The agent runs as the normal user, so let users write its data folder (BUILTIN\Users, any language).
  CreateDirectory "${DATADIR}"
  nsExec::Exec 'icacls.exe "${DATADIR}" /grant *S-1-5-32-545:(OI)(CI)M /T /Q'

  ; Start at every login (the exe has no window).
  CreateShortcut "$SMSTARTUP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\agent.ico" 0

  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP} status.lnk" "$INSTDIR\${EXE}" "status" "$INSTDIR\agent.ico" 0
  CreateShortcut "$SMPROGRAMS\${APP}\Start ${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\agent.ico" 0
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APP}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "SeedhaPrint"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\agent.ico"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1

  ; Start it now as the signed-in user: launching through Explorer drops the installer's admin rights.
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${EXE}"'
SectionEnd

Function OpenStatus
  Sleep 1500
  ExecShell "open" "${STATUS_URL}"
FunctionEnd

Section "Uninstall"
  SetShellVarContext all
  !insertmacro StopAgent
  Delete "$SMSTARTUP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\SumatraPDF.exe"
  Delete "$INSTDIR\agent.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTKEY}"
  MessageBox MB_YESNO|MB_ICONQUESTION "Also remove this PC's pairing and logs?$\r$\n(Choose No if you will reinstall on this PC.)" IDNO keep
    RMDir /r "${DATADIR}"
  keep:
SectionEnd
