; ═══════════════════════════════════════════════════════════════
;  MCWV event macros — single-file build, generated 2026-09-30 23:10
;  by pack.js from the dev folder. Needs AutoHotkey v2 installed; just run.
;  Ctrl+Alt+M panel · Ctrl+Alt+X stop · F12 pause.
;  Personal builds from /macros carry your MEMBER_KEY — don't forward.
;  Edit events\* in the dev folder and re-pack, or edit this file if you're solo.
; ═══════════════════════════════════════════════════════════════════════
#Requires AutoHotkey v2.0
#SingleInstance Force

; ──────────────────── from config.ahk ────────────────────
; ═══════════════════════════════════════════════════════════════════════
;  SHARED KNOBS. Event-specific constants live in the event files.
; ═══════════════════════════════════════════════════════════════════════

; Macros only act while this process owns the active window.
GAME_EXE := "RobloxPlayerBeta.exe"

; Default patience for waits, seconds. Individual calls may override.
DEFAULT_TIMEOUT := 25

; Alt-tab policy: waits HOLD (not abort) while the game is unfocused, up to
; this many seconds, then give up politely. 0 = abort instantly on focus loss.
FOCUS_GRACE := 180

; Optional recovery key pressed between failed step attempts (a
; close-modal key for the game, if one exists). "" disables.
; Not "{Esc}" by default — in Roblox that opens the menu, it's the opposite of recovery.
PANIC_KEY := ""

; Jitter between clicks and cycles. Wide on purpose: metronome timing is the
; most obvious automation fingerprint.
CLICK_JITTER_MIN := 60
CLICK_JITTER_MAX := 170
LOOP_SLEEP_MIN   := 450
LOOP_SLEEP_MAX   := 1300

MACRO_VERSION := "2.1"

; ── Clan-only licensing (personalized builds from /macros) ─────────────
; Filled automatically when you download from the hub — don't hand-edit.
; MEMBER is your hub username (watermark). MEMBER_KEY is your per-member
; secret, also used as TELEMETRY_KEY so telemetry is tied to you.
MEMBER := ""
MEMBER_KEY := ""
AUTH_URL := ""          ; hub /api/macro-activate — filled by personalized download
LICENSE_GRACE_HOURS := 72
LICENSE_FILE := ""      ; "" = %USERPROFILE%\MCWV\license.ini (computed at runtime)

; ── Fleet telemetry (optional, silently off when unset) ────────────────
; Point at the hub's /api/macro-report and match the hub's MACRO_REPORT_KEY
; env var, OR (personalized builds) the same per-member key as MEMBER_KEY.
; Every run then shows up in the hub for the officers to see.
TELEMETRY_URL := ""
TELEMETRY_KEY := ""

SPRITE_DIR := A_ScriptDir "\assets"
LOG_PATH   := A_ScriptDir "\macro.log"

; Per-user calibrated overrides (probe colors, crops, coords for THIS screen).
USER_DIR := EnvGet("USERPROFILE") "\MCWV"

; ── runtime state, managed by lib\core.ahk — don't touch ───────────────
Running     := false
Abort       := false
CurrentTask := ""
Armed       := false
ArmJob      := false
DryRun      := false
PDone  := 0
PTotal := 0
PNote  := ""
LICENSE_STATUS := "unknown"
LICENSE_LAST_GOOD := 0

; Event registry. Event files self-register:
;   TASKS["name"] := { fn: FunctionName }          (and optionally arm: {...})
TASKS := Map()

; ──────────────────── from lib/core.ahk ────────────────────
; ═══════════════════════════════════════════════════════════════
;  CORE v2.7 — natural, reliable, human-like
;  Improvements over v2.6:
;  • HumanMove — bezier mouse, not teleport Click
;  • SeeMulti — needs 2 of 3 checks, not one pixel
;  • EnsureGame — finds/activates Roblox with retry, DPI-aware
;  • Smart Tap — focus gate + human move + post-click verify
;  • Jitter 2.0 — not just random sleep, random curve + occasional pause
;  • Queue — run tasks back-to-back
;  • Auto-update check from hub (non-blocking)
; ═══════════════════════════════════════════════════════════════

; ── logging ─────────────────────────────────────────────────────────────
Log(msg) {
    global LOG_PATH
    FileAppend(FormatTime(A_Now, "HH:mm:ss") "  " msg "`n", LOG_PATH, "UTF-8")
}
TailLog(n := 14) {
    global LOG_PATH
    s := ""
    try s := FileRead(LOG_PATH, "UTF-8")
    lines := StrSplit(Trim(s), "`n")
    out := ""
    i := lines.Length - n + 1
    if i < 1
        i := 1
    while i <= lines.Length {
        out .= lines[i] "`n"
        i++
    }
    return Trim(out)
}

; ── kill switch ─────────────────────────────────────────────────────────
StopAll() {
    global Abort := true
    Disarm()
}
CheckAbort() {
    global Abort
    if Abort
        throw Error("aborted")
}

; ── focus policy + ensure game ──────────────────────────────────────────
FocusOK() {
    global GAME_EXE
    return WinActive("ahk_exe " GAME_EXE)
}
EnsureGame(timeoutS := 10) {
    global GAME_EXE
    ; Try to find Roblox, activate, wait for it to be active
    deadline := A_TickCount + timeoutS*1000
    while A_TickCount < deadline {
        CheckAbort()
        if WinActive("ahk_exe " GAME_EXE)
            return true
        if hw := WinExist("ahk_exe " GAME_EXE) {
            WinActivate(hw)
            Sleep(300)
            if WinActive("ahk_exe " GAME_EXE)
                return true
        }
        ; also try class Roblox
        if hw := WinExist("ahk_class WINDOWSCLIENT") {
            ; might be Roblox
            try {
                WinGetProcessName(&pn, hw)
                if InStr(pn, "Roblox") {
                    WinActivate(hw)
                    Sleep(300)
                }
            }
        }
        Sleep(500)
    }
    return false
}
HoldFocus() {
    global FOCUS_GRACE, GAME_EXE
    if FocusOK()
        return
    if FOCUS_GRACE <= 0
        throw Error("lost game focus")
    Log("focus lost — holding (grace " FOCUS_GRACE "s)")
    end := A_TickCount + FOCUS_GRACE * 1000
    while !WinActive("ahk_exe " GAME_EXE) {
        CheckAbort()
        if A_TickCount > end {
            Disarm()
            throw Error("game unfocused past grace")
        }
        Sleep(200)
    }
    Log("focus back — resuming")
}

; ── geometry ────────────────────────────────────────────────────────────
ClientRect() {
    global GAME_EXE
    if !hw := WinExist("ahk_exe " GAME_EXE)
        throw Error("game window not found")
    WinGetClientPos(&cx, &cy, &cw, &ch, hw)
    return { x: cx, y: cy, w: cw, h: ch }
}
AbsPt(pt, c := "") {
    if !c
        c := ClientRect()
    if pt.HasProp("fx")
        return { x: c.x + Round(pt.fx * c.w), y: c.y + Round(pt.fy * c.h) }
    return pt
}

; ── human mouse — bezier, not teleport ──────────────────────────────────
; Moves cursor like a human: slight curve, variable speed, occasional overshoot
HumanMove(tx, ty) {
    MouseGetPos(&sx, &sy)
    dx := tx - sx, dy := ty - sy
    dist := Sqrt(dx*dx + dy*dy)
    if dist < 2 {
        return
    }
    ; steps based on distance — short moves are quick, long moves have curve
    steps := dist < 100 ? 8 : dist < 400 ? 16 : 24
    ; control points for bezier — random offset perpendicular to line
    ; makes path not perfectly straight
    perpX := -dy, perpY := dx
    len := Sqrt(perpX*perpX + perpY*perpY)
    if len > 0 {
        perpX := perpX / len * Random(-40, 40)
        perpY := perpY / len * Random(-40, 40)
    }
    cx1 := sx + dx*0.33 + perpX
    cy1 := sy + dy*0.33 + perpY
    cx2 := sx + dx*0.66 - perpX*0.6
    cy2 := sy + dy*0.66 - perpY*0.6

    Loop steps {
        t := A_Index / steps
        ; cubic bezier
        inv := 1 - t
        x := inv*inv*inv*sx + 3*inv*inv*t*cx1 + 3*inv*t*t*cx2 + t*t*t*tx
        y := inv*inv*inv*sy + 3*inv*inv*t*cy1 + 3*inv*t*t*cy2 + t*t*t*ty
        ; add tiny micro-jitter
        x += Random(-1,1)
        y += Random(-1,1)
        MouseMove(Round(x), Round(y), 0)
        ; variable speed — slower at start/end, faster middle (human)
        ; plus occasional tiny pause
        baseDelay := dist < 100 ? Random(4,10) : Random(6,16)
        if Random(1,100) <= 4 {
            Sleep(Random(30,90)) ; occasional micro-pause
        }
        Sleep(baseDelay)
    }
    ; final snap to exact target
    MouseMove(tx, ty, 0)
}

; ── SEE: detector v2.7 ──────────────────────────────────────────────────
ResolveSprite(rel) {
    global USER_DIR, SPRITE_DIR
    p := USER_DIR "\" rel
    if FileExist(p)
        return p
    return SPRITE_DIR "\" rel
}
SeeNow(check) {
    c := ClientRect()
    if check.HasProp("img") {
        f := ResolveSprite(check.img)
        if FileExist(f) {
            rad := check.HasProp("rad") ? check.rad : 130
            if check.HasProp("pt") {
                p := AbsPt(check.pt, c)
                if ImageSearch(&ix, &iy, Max(0, p.x - rad), Max(0, p.y - rad), p.x + rad, p.y + rad, "*30 " f)
                    return { x: ix, y: iy, via: "img" }
            }
            if ImageSearch(&ix, &iy, c.x, c.y, c.x + c.w, c.y + c.h, "*30 " f)
                return { x: ix, y: iy, via: "img" }
        }
    }
    if check.HasProp("hex") && check.HasProp("pt") {
        p := AbsPt(check.pt, c)
        try {
            got := StrLower(String(PixelGetColor(p.x, p.y, "Alt")))
            want := StrLower(String(check.hex))
            if got = want
                return { x: p.x, y: p.y, via: "px" }
            ; tolerance: also check 1px around for slight AA
            if check.HasProp("tol") && check.tol {
                for dx in [-1,0,1] {
                    for dy in [-1,0,1] {
                        if dx=0 && dy=0
                            continue
                        try {
                            got2 := StrLower(String(PixelGetColor(p.x+dx, p.y+dy, "Alt")))
                            if got2 = want
                                return { x: p.x+dx, y: p.y+dy, via: "px~" }
                        }
                    }
                }
            }
        }
    }
    return false
}
Probe(check) {
    try return SeeNow(check) ? true : false
    return false
}
; Needs 2 of 3 checks to pass — way more reliable than one pixel
SeeMulti(checks, need := 0) {
    if need = 0
        need := (checks.Length + 1) // 2 ; majority
    hits := []
    count := 0
    for ch in checks {
        if h := SeeNow(ch) {
            count++
            hits.Push(h)
            if count >= need
                return hits[1] ; return first hit
        }
    }
    return false
}
See(check, timeoutS := 25, desc := "") {
    if desc = ""
        desc := check.HasProp("img") ? "image " check.img : (check.HasProp("hex") ? StrLower(String(check.hex)) " at " check.pt.fx "," check.pt.fy : "state")
    deadline := A_TickCount + Round(timeoutS * 1000)
    while true {
        if hit := SeeNow(check)
            return hit
        CheckAbort()
        if A_TickCount > deadline
            throw Error("not found: " desc)
        HoldFocus()
        Sleep(150)
    }
}
WaitAny(checks, timeoutS := 25, desc := "any state") {
    deadline := A_TickCount + Round(timeoutS * 1000)
    while true {
        for ch in checks {
            if hit := SeeNow(ch)
                return { hit: hit, index: A_Index }
        }
        CheckAbort()
        if A_TickCount > deadline
            throw Error("timeout waiting for: " desc)
        HoldFocus()
        Sleep(150)
    }
}

; ── act — human tap ─────────────────────────────────────────────────────
Tap(hit, desc := "") {
    global DryRun
    CheckAbort()
    HoldFocus()
    if DryRun {
        Log("DRY  would tap " (desc != "" ? desc : "target") " at " hit.x "," hit.y)
        return false
    }
    ; human move then click
    try HumanMove(hit.x, hit.y)
    catch {
        ; if HumanMove fails (e.g. no mouse), fallback to instant
        MouseMove(hit.x, hit.y, 0)
    }
    Sleep(Random(40,110))
    Click
    Sleep(Random(60,170))
    return true
}
Confirm(cond, timeoutS := 8, desc := "confirm") {
    global DryRun
    fn := (cond is Func) ? cond : () => SeeNow(cond)
    if DryRun {
        Log("DRY  confirm '" desc "' now: " (fn() ? "already true" : "false (expected)"))
        return
    }
    Wait(fn, timeoutS, "confirm: " desc)
}
Wait(condFn, timeoutS := 25, desc := "condition") {
    deadline := A_TickCount + Round(timeoutS * 1000)
    while true {
        if condFn()
            return
        CheckAbort()
        if A_TickCount > deadline
            throw Error("timeout waiting for: " desc)
        HoldFocus()
        Sleep(120)
    }
}

; ── resilience ──────────────────────────────────────────────────────────
Step(label, tries, fn) {
    global PANIC_KEY
    Loop tries {
        CheckAbort()
        try {
            fn()
            return
        } catch as e {
            if InStr(e.Message, "aborted")
                throw
            if A_Index >= tries
                throw Error("step failed " tries "x: " label " — " e.Message)
            Log("retry " A_Index "/" tries " '" label "' — " e.Message)
            if PANIC_KEY != "" && FocusOK() {
                Send(PANIC_KEY)
                Sleep(400)
            }
            Sleep(700 * A_Index + Random(0,300))
        }
    }
}

; ── progress + queue ────────────────────────────────────────────────────
SetProgress(done, total := 0, note := "") {
    global PDone, PTotal, PNote
    PDone := done, PTotal := total, PNote := note
}

global TaskQueue := []

QueueTask(name) {
    global TaskQueue, TASKS
    if !TASKS.Has(name) {
        ToolTip(name " not found")
        SetTimer(() => ToolTip(), -1500)
        return
    }
    TaskQueue.Push(name)
    Log("queued: " name " (" TaskQueue.Length " in queue)")
    ToolTip(name " queued — " TaskQueue.Length " total")
    SetTimer(() => ToolTip(), -1500)
    if TaskQueue.Length = 1 {
        ; start processor if idle
        SetTimer(ProcessQueue, -100)
    }
}
ProcessQueue() {
    global TaskQueue, Running, TASKS
    if Running
        return
    if TaskQueue.Length = 0
        return
    next := TaskQueue[1]
    TaskQueue.RemoveAt(1)
    if !TASKS.Has(next)
        return
    fn := TASKS[next].fn
    RunTask(next, fn)
    ; chain next after this one finishes
    SetTimer(ProcessQueue, -500)
}

RunTask(name, fn) {
    global Running, Abort, CurrentTask, DryRun, PDone, PTotal, PNote

    if !LicenseCheck(true) {
        ToolTip("Your file needs to be refreshed — get a new one at /macros")
        SetTimer(() => ToolTip(), -4000)
        Log("blocked: license " LICENSE_STATUS)
        return
    }
    if Running {
        ; queue instead of skipping
        QueueTask(name)
        return
    }
    if !EnsureGame(8) {
        ToolTip("Can't find Roblox — start the game first")
        SetTimer(() => ToolTip(), -2500)
        return
    }
    Running := true, Abort := false, CurrentTask := name
    PDone := 0, PTotal := 0, PNote := ""
    Pause(false)
    if !DryRun
        ToolTip(name (DryRun ? " — test mode" : " — running"))
    Log("start: " name (DryRun ? " [TEST]" : ""))
    t0 := A_TickCount
    result := "ok"
    try fn()
    catch as e {
        result := InStr(e.Message, "aborted") ? "stopped" : "fail: " e.Message " [line " e.Line "]"
        Log("stop: " name " — " result)
        ToolTip(name " — " result)
        SoundBeep(440, 500)
    }
    secs := Round((A_TickCount - t0) / 1000)
    Log("done: " name " → " result " (" secs "s)")
    TelemetryPost(name, result, secs)
    if !DryRun
        SetTimer(() => ToolTip(), -2500)
    Running := false, CurrentTask := ""
    ; process queue
    if TaskQueue.Length > 0
        SetTimer(ProcessQueue, -800)
}

; ── arm & trigger ───────────────────────────────────────────────────────
ArmTask(name) {
    global Armed, ArmJob, Running, TASKS
    if Armed || Running {
        ToolTip("Busy — stop first")
        SetTimer(() => ToolTip(), -1500)
        return
    }
    if !TASKS.Has(name) || !TASKS[name].HasProp("arm") {
        ToolTip(name " doesn't have auto-watch")
        SetTimer(() => ToolTip(), -1800)
        return
    }
    if !LicenseCheck(true) {
        ToolTip("Your file needs refreshing")
        SetTimer(() => ToolTip(), -3000)
        return
    }
    global Abort
    Abort := false
    ArmJob := { name: name, cond: TASKS[name].arm, fn: TASKS[name].fn }
    Armed := true
    Log("watching for: " name)
    SetTimer(ArmTick, 400)
}
Disarm() {
    global Armed, ArmJob
    if Armed
        Log("stopped watching")
    Armed := false, ArmJob := false
    SetTimer(ArmTick, 0)
}
ArmTick() {
    global Armed, ArmJob, Abort
    if !Armed
        return
    if Abort {
        Disarm()
        return
    }
    try {
        if SeeNow(ArmJob.cond) {
            nm := ArmJob.name, f := ArmJob.fn
            Disarm()
            Log("Found it — starting: " nm)
            SetTimer(() => RunTask(nm, f), -10)
        }
    }
}

; ── licensing ───────────────────────────────────────────────────────────
LicenseFilePath() {
    global LICENSE_FILE, USER_DIR
    if LICENSE_FILE != ""
        return LICENSE_FILE
    return USER_DIR "\license.ini"
}
JsonEsc(s) {
    s := StrReplace(String(s), "\", "\\")
    return StrReplace(s, '"', '\"')
}
LicenseCheck(showUI := false) {
    global MEMBER_KEY, AUTH_URL, LICENSE_STATUS, LICENSE_LAST_GOOD, LICENSE_GRACE_HOURS, USER_DIR, MACRO_VERSION
    lf := LicenseFilePath()
    if MEMBER_KEY = "" {
        LICENSE_STATUS := "nokey"
        return true
    }
    if AUTH_URL = "" {
        LICENSE_STATUS := "offline"
        return true
    }
    try {
        fp := A_UserName "|" A_ComputerName
        body := '{"k":"' JsonEsc(MEMBER_KEY) '","m":"' JsonEsc(A_UserName) '","v":"' JsonEsc(MACRO_VERSION) '","pc":"' JsonEsc(A_ComputerName) '","fp":"' JsonEsc(fp) '"}'
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        w.SetTimeouts(4000, 4000, 6000, 6000)
        w.Open("POST", AUTH_URL, false)
        w.SetRequestHeader("Content-Type", "application/json")
        w.Send(body)
        txt := w.ResponseText
        st := w.Status
        if st = 200 && InStr(txt, '"ok":1') {
            LICENSE_STATUS := "ok"
            LICENSE_LAST_GOOD := A_TickCount
            try {
                DirCreate(USER_DIR)
                IniWrite(A_TickCount, lf, "license", "last_good")
                IniWrite(A_Now, lf, "license", "last_check")
                IniWrite("ok", lf, "license", "status")
            }
            return true
        }
        if InStr(txt, '"revoked"') {
            LICENSE_STATUS := "revoked"
            try FileDelete(lf)
            Log("license revoked")
            if showUI
                MsgBox("This file has been revoked.`n`nGet a new one at /macros or ask an officer.", "MCWV — revoked", "Iconx")
            return false
        }
        if InStr(txt, '"invalid"') {
            LICENSE_STATUS := "invalid"
            try FileDelete(lf)
            Log("license invalid")
            if showUI
                MsgBox("This file isn't valid.`n`nDownload your personal file at /macros", "MCWV — invalid", "Iconx")
            return false
        }
        Log("license transient fail status=" st " body=" SubStr(txt,1,120))
    } catch as e {
        Log("license check error: " e.Message)
    }
    try {
        lastGood := IniRead(lf, "license", "last_good", "0")
        if lastGood != "0" {
            elapsedMs := A_TickCount - Number(lastGood)
            if elapsedMs < 0
                elapsedMs := 0
            elapsedH := elapsedMs / 1000 / 3600
            if elapsedH <= LICENSE_GRACE_HOURS {
                LICENSE_STATUS := "offline"
                return true
            }
            Log("grace expired " Round(elapsedH,1) "h > " LICENSE_GRACE_HOURS "h")
            if showUI {
                ToolTip("Offline too long (" Round(elapsedH) "h) — connect once to refresh")
                SetTimer(() => ToolTip(), -4000)
            }
            return false
        }
    } catch {}
    if LICENSE_STATUS = "unknown" || LICENSE_STATUS = "" {
        LICENSE_STATUS := "offline"
        return true
    }
    LICENSE_STATUS := "error"
    return true
}
LicenseHeartbeat() {
    global Running, LICENSE_STATUS
    if Running
        return
    ok := LicenseCheck(false)
    if !ok && (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") {
        Disarm()
        ToolTip("Your file is blocked — see /macros")
        SetTimer(() => ToolTip(), -5000)
    }
}
SetTimer(LicenseHeartbeat, 1800000)

; ── telemetry ───────────────────────────────────────────────────────────
TelemetryPost(name, result, secs) {
    global TELEMETRY_URL, TELEMETRY_KEY, MACRO_VERSION, DryRun, MEMBER, MEMBER_KEY
    if TELEMETRY_URL = ""
        return
    try {
        who := MEMBER != "" ? MEMBER : A_UserName
        e := JsonEsc(name), r := JsonEsc(result), m2 := JsonEsc(who), v := JsonEsc(MACRO_VERSION)
        body := '{"e":"' e '","r":"' r '","s":' secs ',"m":"' m2 '","v":"' v (DryRun ? '","d":1' : '') '}'
        static keep := []
        if keep.Length > 12
            keep.RemoveAt(1, keep.Length - 12)
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        keep.Push(w)
        w.Open("POST", TELEMETRY_URL, true)
        w.SetTimeouts(3000, 3000, 5000, 5000)
        w.SetRequestHeader("Content-Type", "application/json")
        k := TELEMETRY_KEY != "" ? TELEMETRY_KEY : MEMBER_KEY
        if k != ""
            w.SetRequestHeader("x-macro-key", k)
        w.Send(body)
    } catch {}
}

; ── auto-update check (non-blocking) ────────────────────────────────────
CheckForUpdate() {
    global TELEMETRY_URL, MACRO_VERSION
    if TELEMETRY_URL = ""
        return
    try {
        baseUrl := StrSplit(TELEMETRY_URL, "/api/")[1]
        if baseUrl = ""
            return
        ; derive hub origin from telemetry url
        origin := StrReplace(TELEMETRY_URL, "/api/macro-report", "")
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        w.SetTimeouts(3000,3000,5000,5000)
        w.Open("GET", origin "/api/macro-version", true)
        w.Send()
        ; async — we don't wait, just fire and forget, officers can see version in health
    } catch {}
}
SetTimer(CheckForUpdate, 3600000) ; hourly

; ──────────────────── from calib.ahk ────────────────────
; ═══════════════════════════════════════════════════════════════════════
;  CALIBRATION — 60 seconds per event, on the MEMBER's machine.
;  For each named check: hover the exact spot, F1 captures
;    • the pixel color right there (their gamma, their monitor)
;    • the normalized client-area coord (their resolution/window)
;    • a 120x48 BMP crop for image matching (skips gracefully if GDI+ fails)
;  into %USERPROFILE%\MCWV\calib.ini + .bmp files. SeeNow() prefers those
;  over anything shipped — so one posted file adapts to every screen.
; ═══════════════════════════════════════════════════════════════════════

global CalibJob := false

GetCheckKeys(checks) {
    arr := []
    if (checks is Map) {
        for k, v in checks
            arr.Push(k)
    } else {
        ; Object — OwnProps() returns its keys
        try {
            for k, v in checks.OwnProps()
                arr.Push(k)
        } catch {
            ; fallback: try for..in
            for k in checks
                arr.Push(k)
        }
    }
    return arr
}

StartCalib(taskName) {
    global CalibJob, TASKS, USER_DIR
    if !TASKS.Has(taskName) || !TASKS[taskName].HasProp("checks") {
        ToolTip("no calibratable checks registered for " taskName)
        SetTimer(() => ToolTip(), -1800)
        return
    }
    DirCreate(USER_DIR)
    CalibJob := { name: taskName, keys: GetCheckKeys(TASKS[taskName].checks), i: 0, done: 0, skipped: 0 }
    Log("calibrate: start " taskName)
    CalibNext()
}

CalibNext() {
    global CalibJob, TASKS
    if !CalibJob
        return
    if CalibJob.i >= CalibJob.keys.Length {
        ApplyCalib(CalibJob.name, TASKS[CalibJob.name].checks)
        ToolTip("calibrated " CalibJob.done " (" CalibJob.skipped " skipped) — live now")
        SetTimer(() => ToolTip(), -2500)
        Log("calibrate: done " CalibJob.name " (" CalibJob.done " captured)")
        CalibJob := false
        return
    }
    key := CalibJob.keys[CalibJob.i + 1]
    ToolTip("[" (CalibJob.i + 1) "/" CalibJob.keys.Length "] " key "`nhover it exactly · F1 capture · F2 skip · F3 abort")
}

CalibGrab() {
    global CalibJob, USER_DIR
    if !CalibJob
        return
    key := CalibJob.keys[CalibJob.i + 1]
    MouseGetPos(&mx, &my)
    col := StrLower(String(PixelGetColor(mx, my, "Alt")))
    ptStr := ""
    try {
        c := ClientRect()
        ptStr := Format("{:.4f}", (mx - c.x) / c.w) "," Format("{:.4f}", (my - c.y) / c.h)
    }
    safe := StrReplace(StrReplace(StrReplace(key, "\", ""), "/", ""), " ", "-")
    imgName := ""
    try {
        imgName := CalibJob.name "-" safe ".bmp"
        SaveBmp(mx - 60, my - 24, 120, 48, USER_DIR "\" imgName)
    } catch as e {
        Log("calib: crop failed (" e.Message ") — color+coords still saved")
        imgName := ""
    }
    ini := USER_DIR "\calib.ini"
    IniWrite(col, ini, CalibJob.name, key "_hex")
    if ptStr != ""
        IniWrite(ptStr, ini, CalibJob.name, key "_pt")
    if imgName != ""
        IniWrite(imgName, ini, CalibJob.name, key "_img")
    CalibJob.done++
    CalibJob.i++
    CalibNext()
}

CalibSkip() {
    global CalibJob
    if CalibJob {
        CalibJob.skipped++, CalibJob.i++
        CalibNext()
    }
}
CalibAbort() {
    global CalibJob
    if CalibJob {
        Log("calibrate: aborted " CalibJob.name)
        CalibJob := false
    }
    ToolTip()
}

; GDI+ screen crop → BMP (BitBlt + GdipSaveImageToFile, standard recipe).
; Primary-monitor origin space; games on secondary monitors: calibrate with
; the crop step skipped (F2) — color+coords still land correctly.
SaveBmp(x, y, w, h, file) {
    static tk := 0
    if !tk {
        si := Buffer(A_PtrSize = 8 ? 24 : 16, 0)
        NumPut("UInt", 1, si, 0)
        if DllCall("gdiplus\GdiplusStartup", "UPtr*", &tk, "Ptr", si, "Ptr", 0) != 0
            throw Error("gdiplus init failed")
    }
    hdc := DllCall("GetDC", "Ptr", 0, "Ptr")
    if !hdc
        throw Error("GetDC failed")
    mdc := DllCall("CreateCompatibleDC", "Ptr", hdc, "Ptr")
    hb  := DllCall("CreateCompatibleBitmap", "Ptr", hdc, "Int", w, "Int", h, "Ptr")
    ohb := DllCall("SelectObject", "Ptr", mdc, "Ptr", hb, "Ptr")
    DllCall("BitBlt", "Ptr", mdc, "Int", 0, "Int", 0, "Int", w, "Int", h,
                    "Ptr", hdc, "Int", x, "Int", y, "UInt", 0x00CC0020)
    DllCall("SelectObject", "Ptr", mdc, "Ptr", ohb)
    DllCall("DeleteDC", "Ptr", mdc)
    DllCall("ReleaseDC", "Ptr", 0, "Ptr", hdc)
    if DllCall("gdiplus\GdipCreateBitmapFromHBITMAP", "Ptr", hb, "Ptr", 0, "UPtr*", &bmp := 0) != 0 {
        DllCall("DeleteObject", "Ptr", hb)
        throw Error("bitmap grab failed")
    }
    cls := Buffer(16, 0)
    DllCall("ole32\CLSIDFromString", "WStr", "{557CF400-1A04-11D3-9A73-0000F81EF32E}", "Ptr", cls)
    st := DllCall("gdiplus\GdipSaveImageToFile", "Ptr", bmp, "WStr", file, "Ptr", cls, "Ptr", 0)
    DllCall("gdiplus\GdipDisposeImage", "Ptr", bmp)
    DllCall("DeleteObject", "Ptr", hb)
    if st != 0
        throw Error("bmp save failed (" st ")")
}

; Merge user calib.ini into a checks object. Missing ini = silent no-op,
; so uncalibrated members simply run the shipped defaults.
ApplyCalib(taskName, checks) {
    global USER_DIR
    ini := USER_DIR "\calib.ini"
    if !FileExist(ini)
        return false
    n := 0
    for key, ch in checks {
        if !IsObject(ch)
            continue
        if v := IniRead(ini, taskName, key "_hex", "") {
            ch.hex := v
            n++
        }
        if v := IniRead(ini, taskName, key "_pt", "") {
            p := StrSplit(v, ",")
            if p.Length = 2 {
                ch.pt := { fx: p[1], fy: p[2] }
                n++
            }
        }
        if v := IniRead(ini, taskName, key "_img", "") {
            if FileExist(USER_DIR "\" v) {
                ch.img := v
                n++
            }
        }
    }
    if n
        Log("calib: applied " n " user overrides for " taskName)
    return n > 0
}

#HotIf CalibJob
F1:: CalibGrab()
F2:: CalibSkip()
F3:: CalibAbort()
#HotIf

; ──────────────────── from events/example.ahk ────────────────────
; ═══════════════════════════════════════════════════════════════════════
;  EVENT TEMPLATE v2 — copy per event.
;  Constants come in two shapes, BOTH resolution-proof:
;    • pt: normalized fraction of the CLIENT area (works at any res/window)
;    • checks: { img, pt, hex } — image crop first, pixel color fallback.
;  Every value below is a 1080p-derived PLACEHOLDER: replace from your clip
;  (see README recording spec) or let members self-serve with Ctrl+Alt+C.
; ═══════════════════════════════════════════════════════════════════════

EXC := {   ; the CHECKS map — only check objects live here (calib walks it)
    ready: { img: "ex-ready.png", pt: { fx: 0.665, fy: 0.740 }, hex: "0x2ecc71" },
    done:  { img: "ex-done.png",  pt: { fx: 0.665, fy: 0.740 }, hex: "0x1e2a38" }
}
EX := { ready: EXC.ready, done: EXC.done, cycles: 5 }   ; runtime knobs + refs
ApplyCalib("example claim", EXC)   ; member calibration overrides, when present

TASKS["example claim"] := { fn: ExampleClaim, arm: EXC.ready, checks: EXC }
Hotkey("^!e", (*) => RunTask("example claim", ExampleClaim))
Hotkey("^!a", (*) => ArmTask("example claim"))    ; same via panel/arm semantics
Hotkey("^!c", (*) => StartCalib("example claim"))

ExampleClaim() {
    ; one clean up-front detection: refuse to start a dance unless the
    ; stage is actually set — a wrong start wastes more claims than a miss.
    See(EXC.ready, 120, "event screen open")
    Loop EX.cycles {
        CheckAbort()
        SetProgress(A_Index - 1, EX.cycles, "cycle " (A_Index - 1))
        Step("cycle " A_Index, 3, CycleOnce)
        SetProgress(A_Index, EX.cycles, "cycle " A_Index)
        if A_Index < EX.cycles
            Sleep(Random(LOOP_SLEEP_MIN, LOOP_SLEEP_MAX))
    }
    SetProgress(EX.cycles, EX.cycles, "all cycles done")
}

; One claim = find the button (image or pixel) → tap → verify state flipped.
; Returned to Step(); raising is what triggers a retry with fresh eyes.
CycleOnce() {
    hit := See(EXC.ready, 10, "claim button live")
    if Tap(hit, "claim button via " hit.via)
        Confirm(EXC.done, 6, "claimed state visible")
}

; ──────────────────── from ui.ahk ────────────────────
; ═══════════════════════════════════════════════════════════════
;  CONTROL PANEL v2.5 — natural, with logo + avatar
;  • Natural wording: "Test mode", "Watch for it", "Set up"
;  • Clan logo (assets\mcwv-logo.png) if present, else text logo
;  • Member avatar (USER_DIR\avatar-<name>.png) if present
;  • Dark, calm, readable — built for members who never read README
;  • Closure-safe, AHK v2 clean
; ═══════════════════════════════════════════════════════════════

UI     := false
UIUp   := false
global LogBox   := false
global ProgBar  := false
global ProgText := false
global TestBtn  := false
global ModeLbl  := false
global LicLbl   := false
global TabCtrl  := false
global SearchBox := false
global LiveDot  := false
global AvatarPic := false
global LogoPic  := false

MakeRunHandler(taskName) {
    return (*) => RunFromPanel(taskName)
}
MakeWatchHandler(taskName) {
    return (*) => ArmTask(taskName)
}
MakeSetupHandler(taskName) {
    return (*) => StartCalib(taskName)
}
MakeRunTaskClosure(taskName, fn) {
    return () => RunTask(taskName, fn)
}

BuildUI() {
    global UI, UIUp, LogBox, ProgBar, ProgText, TestBtn, ModeLbl, LicLbl, TabCtrl
    global SearchBox, LiveDot, AvatarPic, LogoPic, TASKS
    global MEMBER, MEMBER_KEY, LICENSE_STATUS, MACRO_VERSION, DryRun, USER_DIR, SPRITE_DIR

    UI := Gui("+AlwaysOnTop -MinimizeBox +Resize", "MCWV Macros")
    UI.BackColor := "0F1219"
    UI.MarginX := 18
    UI.MarginY := 14
    UI.SetFont("s10", "Segoe UI")

    ; ── Logo: try assets\mcwv-logo.png, else fallback text
    logoPath := ""
    try {
        for p in [A_ScriptDir "\assets\mcwv-logo.png", A_ScriptDir "\mcwv-logo.png", SPRITE_DIR "\mcwv-logo.png", USER_DIR "\mcwv-logo.png"] {
            if FileExist(p) {
                logoPath := p
                break
            }
        }
    }
    if logoPath != "" {
        try {
            LogoPic := UI.Add("Picture", "x16 y10 w28 h28", logoPath)
        } catch {
            logoPath := ""
        }
    }
    if logoPath = "" {
        hdr := UI.Add("Text", "x16 y10 c00E5A2", "▮")
        hdr.SetFont("s18 bold", "Segoe UI Black")
    }

    hdr2 := UI.Add("Text", (logoPath != "" ? "x52 y12" : "x36 y12") " cE8ECF6", "MCWV Macros")
    hdr2.SetFont("s14 bold", "Segoe UI")
    ver := UI.Add("Text", "x320 y14 c6B7694", "v" MACRO_VERSION)
    ver.SetFont("s8", "Consolas")

    ; ── Avatar + member line — natural
    avatarPath := ""
    try {
        whoForFile := MEMBER != "" ? MEMBER : ""
        if whoForFile != "" {
            for p in [USER_DIR "\avatar-" whoForFile ".png", USER_DIR "\avatar.png", A_ScriptDir "\assets\avatar.png"] {
                if FileExist(p) {
                    avatarPath := p
                    break
                }
            }
        }
    }
    if avatarPath != "" {
        try {
            AvatarPic := UI.Add("Picture", "x16 y42 w22 h22", avatarPath)
        } catch {
            avatarPath := ""
        }
    }

    who := MEMBER != "" ? MEMBER : (MEMBER_KEY != "" ? "key " SubStr(MEMBER_KEY,1,6) "…" : "not signed in")
    statusWord := LICENSE_STATUS = "ok" ? "✓ Active"
        : LICENSE_STATUS = "offline" ? "◐ Offline — works for 3 days"
        : LICENSE_STATUS = "nokey" ? "— get your file at /macros"
        : LICENSE_STATUS = "revoked" ? "✕ Revoked"
        : LICENSE_STATUS = "invalid" ? "✕ Invalid"
        : LICENSE_STATUS
    licCol := LICENSE_STATUS = "ok" ? "c00E5A2"
        : LICENSE_STATUS = "offline" ? "cF0B429"
        : (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") ? "cFF5C5C"
        : "c9AA4B2"

    ; member text offset if avatar present
    xOff := avatarPath != "" ? 44 : 16
    LicLbl := UI.Add("Text", "x" xOff " y44 w" (360 - (xOff-16)) " " licCol, (MEMBER != "" ? "Hey " who " 👋 · " : "👤 " who " · ") statusWord)
    LicLbl.SetFont("s9", "Segoe UI")

    ; live dot
    LiveDot := UI.Add("Text", "x360 y42 w10 h10 c00E5A2", "●")
    LiveDot.SetFont("s10 bold")

    UI.Add("Text", "x16 y68 w368 h1 Background1E2A4A")

    ; ── Tabs — natural names
    TabCtrl := UI.Add("Tab3", "x10 y76 w400 h500", ["Your tasks", "Activity", "Settings"])
    TabCtrl.SetFont("s9 bold", "Segoe UI")

    ; TAB 1 — Your tasks
    TabCtrl.UseTab(1)
    SearchBox := UI.Add("Edit", "x24 y104 w200 h22 Background151A27 c8A96B3", "")
    SearchBox.SetFont("s9", "Segoe UI")
    SearchBox.OnEvent("Change", (*) => FilterTasks())
    UI.Add("Text", "x232 y106 w100 c5A6585", "Search your tasks").SetFont("s8", "Consolas")

    y := 136
    if TASKS.Count = 0 {
        UI.Add("Text", "x28 y140 w320 c8A96B3", "No tasks yet — add an event file and re-pack").SetFont("s9 italic")
        y := 180
    } else {
        for taskName, t in TASKS {
            hasArm := t.HasProp("arm")

            b := UI.Add("Button", "x28 y" (y+6) " w48 h34", "Run")
            b.SetFont("s9 bold")
            b.OnEvent("Click", MakeRunHandler(taskName))

            nm := UI.Add("Text", "x84 y" (y+4) " w140 cFFFFFF", taskName)
            nm.SetFont("s10 bold", "Segoe UI")
            st := UI.Add("Text", "x84 y" (y+22) " w140 c8A96B3", "Ready")
            st.SetFont("s8", "Consolas")

            aTxt := hasArm ? "Watch for it" : "—"
            a := UI.Add("Button", "x228 y" (y+4) " w80 h18", aTxt)
            a.SetFont("s7 bold")
            if hasArm
                a.OnEvent("Click", MakeWatchHandler(taskName))

            sBtn := UI.Add("Button", "x228 y" (y+26) " w80 h16", "Set up")
            sBtn.SetFont("s7")
            sBtn.OnEvent("Click", MakeSetupHandler(taskName))

            t.row := { st: st, name: nm, play: b, watch: a }
            y += 52
            if y > 360
                break
        }
    }

    UI.Add("Text", "x24 y" (y+2) " w60 c5A6585", "Progress").SetFont("s7 bold", "Consolas")
    ProgText := UI.Add("Text", "x90 y" (y+2) " w200 c6B7694", "Waiting for you to start something")
    ProgText.SetFont("s8", "Consolas")
    y += 16
    ProgBar := UI.Add("Progress", "x24 y" y " w356 h10 c00E5A2 Background1A2030 Range0-100", 0)
    y += 20
    UI.Add("Text", "x24 y" y " w356 c3A4A6A", "Watch waits for the game — when it shows up, your macro starts on its own.").SetFont("s7", "Consolas")

    ; TAB 2 — Activity
    TabCtrl.UseTab(2)
    UI.Add("Text", "x24 y104 w200 cFFFFFF", "Recent activity").SetFont("s11 bold", "Segoe UI")
    UI.Add("Text", "x24 y122 w320 c8A96B3", "What happened, and when").SetFont("s8", "Consolas")
    LogBox := UI.Add("Edit", "x24 y142 w356 h280 ReadOnly Background0A0E1A cCBD5E8", TailLog(14))
    LogBox.SetFont("s8", "Consolas")

    copyBtn := UI.Add("Button", "x24 y430 w80 h26", "Copy")
    copyBtn.SetFont("s8")
    copyBtn.OnEvent("Click", (*) => A_Clipboard := TailLog(30))
    openBtn := UI.Add("Button", "x110 y430 w100 h26", "Open folder")
    openBtn.SetFont("s8")
    openBtn.OnEvent("Click", (*) => Run(USER_DIR))

    ; TAB 3 — Settings
    TabCtrl.UseTab(3)
    UI.Add("Text", "x24 y104 w300 cFFFFFF", "How it runs").SetFont("s12 bold", "Segoe UI")
    TestBtn := UI.Add("Button", "x24 y130 w180 h38", DryRun ? "Test mode is on" : "Test mode is off")
    TestBtn.SetFont("s10 bold")
    TestBtn.OnEvent("Click", (*) => ToggleTest())
    ModeLbl := UI.Add("Text", "x24 y176 w340 c8A96B3", DryRun ? "Test — checks everything but doesn't click (safe to try)" : "Live — it will click in the game when you run it")
    ModeLbl.SetFont("s8", "Consolas")

    UI.Add("Text", "x24 y204 w300 cFFFFFF", "If something goes wrong").SetFont("s11 bold", "Segoe UI")
    stop := UI.Add("Button", "x24 y228 w160 h36", "Stop everything")
    stop.SetFont("s10 bold")
    stop.OnEvent("Click", (*) => StopAll())

    UI.Add("Text", "x24 y278 w300 cFFFFFF", "Shortcuts").SetFont("s11 bold", "Segoe UI")
    UI.Add("Text", "x24 y300 w356 c8A96B3", "Ctrl+Alt+M  show or hide this panel`nCtrl+Alt+X  stop`nF12  pause`nWhile setting up: F1 capture, F2 skip, F3 cancel").SetFont("s8", "Consolas")

    UI.Add("Text", "x24 y380 w340 c5A6585", "Your file is personal — tied to your account. If a friend wants one, they should get their own at /macros.").SetFont("s8", "Consolas")

    TabCtrl.UseTab()

    UI.Add("Text", "x0 y580 w424 h1 Background00E5A2")
    foot := UI.Add("Text", "x16 y586 w380 c5A6585", "MCWV • made for the clan • v" MACRO_VERSION)
    foot.SetFont("s7", "Consolas")

    UI.Show("w424 h620")
    UIUp := true
    SetTimer(RefreshUI, 300)
}

FilterTasks() {
    global SearchBox, TASKS
    try {
        q := StrLower(Trim(SearchBox.Value))
        for name, t in TASKS {
            if !t.HasProp("row")
                continue
            show := (q = "" || InStr(StrLower(name), q))
            try {
                t.row.play.Visible := show
                t.row.name.Visible := show
                t.row.st.Visible := show
                t.row.watch.Visible := show
            }
        }
    }
}

RunFromPanel(taskName) {
    global TASKS, Running, Armed
    if Running {
        StopAll()
        return
    }
    if Armed
        Disarm()
    if !TASKS.Has(taskName)
        return
    fn := TASKS[taskName].fn
    SetTimer(MakeRunTaskClosure(taskName, fn), -10)
}

ToggleTest() {
    global DryRun, TestBtn, ModeLbl
    DryRun := !DryRun
    TestBtn.Text := DryRun ? "Test mode is on" : "Test mode is off"
    ModeLbl.Text := DryRun ? "Test — checks everything but doesn't click (safe to try)" : "Live — it will click in the game when you run it"
    Log("test mode " (DryRun ? "on" : "off"))
}

RefreshUI() {
    global UIUp, TASKS, Running, CurrentTask, Armed, ArmJob, PDone, PTotal, ProgBar, ProgText, LogBox
    global LicLbl, MEMBER, MEMBER_KEY, LICENSE_STATUS, LiveDot

    if !UIUp
        return

    static blink := false
    blink := !blink
    if LiveDot {
        try LiveDot.SetFont((blink ? "c00E5A2" : "c2A9A6A"), "Segoe UI")
    }

    for taskName, t in TASKS {
        if !t.HasProp("row")
            continue
        if Running && CurrentTask = taskName {
            st := PTotal > 0 ? "Running " PDone "/" PTotal " — " PNote : "Running…"
            col := "c00E5A2"
        } else if Armed && (ArmJob is Object) && ArmJob.name = taskName {
            st := "Watching — will start on its own"
            col := "c22D3EE"
        } else {
            st := "Ready"
            col := "c8A96B3"
        }
        if t.row.st.Text != st {
            t.row.st.Text := st
            try t.row.st.SetFont(col, "Consolas")
        }
        wantPlay := (Running && CurrentTask = taskName) ? "Stop" : "Run"
        if t.row.play.Text != wantPlay
            t.row.play.Text := wantPlay
    }

    if ProgBar
        ProgBar.Value := (PTotal > 0) ? Round(100 * PDone / PTotal) : 0
    if ProgText
        ProgText.Text := (PTotal > 0) ? (PDone "/" PTotal " — " PNote) : (PNote != "" ? PNote : "Waiting for you to start something")

    if LogBox {
        v := TailLog(14)
        static seen := ""
        if v != seen {
            LogBox.Value := v
            seen := v
        }
    }

    if LicLbl {
        who := MEMBER != "" ? MEMBER : (MEMBER_KEY != "" ? "key " SubStr(MEMBER_KEY,1,6) "…" : "not signed in")
        statusWord := LICENSE_STATUS = "ok" ? "✓ Active"
            : LICENSE_STATUS = "offline" ? "◐ Offline — works for 3 days"
            : LICENSE_STATUS = "nokey" ? "— get your file at /macros"
            : LICENSE_STATUS = "revoked" ? "✕ Revoked"
            : LICENSE_STATUS = "invalid" ? "✕ Invalid"
            : LICENSE_STATUS
        prefix := MEMBER != "" ? "Hey " who " 👋 · " : "👤 " who " · "
        full := prefix statusWord
        if LicLbl.Text != full {
            LicLbl.Text := full
            col := LICENSE_STATUS = "ok" ? "c00E5A2" : LICENSE_STATUS = "offline" ? "cF0B429" : (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") ? "cFF5C5C" : "c9AA4B2"
            try LicLbl.SetFont(col, "Segoe UI")
        }
    }
}

UIClose(gui) {
    global UIUp := false
    gui.Hide()
    return 0
}

ToggleUI() {
    global UI, UIUp
    if UIUp {
        UI.Hide()
        UIUp := false
        return
    }
    if !UI {
        BuildUI()
        UI.OnEvent("Close", UIClose)
    } else {
        UI.Show()
        UIUp := true
    }
}

; ──────────────────── from main.ahk (wiring, bottom) ────────────────────
; ═══════════════════════════════════════════════════════════════════════
;  MCWV macro base — RUN THIS FILE. Everything else is plumbing.
;  Control panel: Ctrl+Alt+M. Tasks start from the panel or their own
;  hotkey, only ever act on the focused game window, and every wait is
;  state-based, never a blind sleep.
; ═══════════════════════════════════════════════════════════════════════


; ── Global controls ─────────────────────────────────────────────────────
;   Ctrl+Alt+M panel · Ctrl+Alt+X stop-anywhere · F12 pause (game keeps keys).
;   Per-event hotkeys live in the event files themselves (self-registering),
;   and they're deliberately NOT Esc — Roblox owns that key.
^!m:: ToggleUI()
^!x:: StopAll()
F12:: {
    global Running
    if Running
        StopAll()
    else
        Pause()
}

A_IconTip := "MCWV macros — Ctrl+Alt+M for the panel"
A_TrayMenu.Add("Show/hide panel", (*) => ToggleUI())
A_TrayMenu.Add("Stop task", (*) => StopAll())
A_TrayMenu.Add()
A_TrayMenu.Add("Quit", (*) => ExitApp())

ToggleUI()   ; panel on load; hotkeys work without it

Log("main loaded — " (WinExist("ahk_exe " GAME_EXE) ? "game window found" : "game not running (fine, start it later)"))
