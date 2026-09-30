; ═══════════════════════════════════════════════════════════════
;  MCWV event macros — single-file build, generated 2026-09-30 19:49
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
; ═══════════════════════════════════════════════════════════════════════
;  CORE v2.1 — detection-first + clan-only licensing.
;  Doctrine, enforced by these functions (event files that bypass them
;  bypass their safety; the template never does):
;    • never trust one pixel — prefer an image crop, fall back to color
;    • never hardcode coordinates — normalized {fx,fy} against the client area
;    • never sleep-then-act — look, then act; act, then verify the act
;    • never die on the first miss — Step() retries with recovery between
;    • never act outside the game window — focus gate on every click,
;      auto-hold through alt-tabs, abort cleanly past the grace
;    • never wonder what happened — progress, log, telemetry, always
;    • never run a leaked copy unwatched — license heartbeat, watermark,
;      72h offline grace, revoke kills the copy on next check
; ═══════════════════════════════════════════════════════════════════════

; ── logging ─────────────────────────────────────────────────────────────
Log(msg) {
    global LOG_PATH
    FileAppend(FormatTime(A_Now, "HH:mm:ss") "  " msg "`n", LOG_PATH, "UTF-8")
}
TailLog(n := 6) {
    global LOG_PATH
    s := ""
    try s := FileRead(LOG_PATH, "UTF-8")
    lines := StrSplit(Trim(s), "`n")
    out := ""
    i := lines.Count() - n + 1
    if i < 1
        i := 1
    while i <= lines.Count() {
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

; ── focus policy ────────────────────────────────────────────────────────
FocusOK() {
    global GAME_EXE
    return WinActive("ahk_exe " GAME_EXE)
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

; ── generic wait (used directly by Confirm/Step; the base of everything) ─
Wait(condFn, timeoutS := DEFAULT_TIMEOUT, desc := "condition") {
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

; ── geometry: normalized points on the client area, re-read every use ───
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
    return pt   ; already absolute {x,y}
}

; ── SEE: the one detector ───────────────────────────────────────────────
; check := { img: "name.png", pt: {fx,fy}, hex: "0xRRGGBB", rad: 120 }
;   img present + file found  → ImageSearch near pt (radius), then whole client
;   no img (or missing file)  → pixel color at pt
;   both given → image wins, pixel only if the crop can't be found (a shipped
;   default before the user calibrates still "works", just less robust)
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
            ; image expected but not found — fall through to color if it has one
        }
    }
    if check.HasProp("hex") && check.HasProp("pt") {
        p := AbsPt(check.pt, c)
        got := StrLower(String(PixelGetColor(p.x, p.y, "Alt")))
        want := StrLower(String(check.hex))
        if got = want
            return { x: p.x, y: p.y, via: "px" }
    }
    return false
}
Probe(check) {
    try return SeeNow(check) ? true : false
    return false
}
See(check, timeoutS := DEFAULT_TIMEOUT, desc := "") {
    if desc = ""
        desc := check.HasProp("img") ? "image " check.img
             : (check.HasProp("hex") ? StrLower(String(check.hex)) " at " check.pt.fx "," check.pt.fy : "state")
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

; ── act ─────────────────────────────────────────────────────────────────
; Tap(hitFromSee) — dry mode logs instead of clicking and returns false so
; event code can skip its follow-ups. Live mode focus-gates right before it.
Tap(hit, desc := "") {
    global DryRun
    CheckAbort()
    HoldFocus()
    if DryRun {
        Log("DRY  would tap " (desc != "" ? desc : "target") " at " hit.x "," hit.y)
        return false
    }
    Click hit.x, hit.y
    Sleep(Random(CLICK_JITTER_MIN, CLICK_JITTER_MAX))
    return true
}
; Confirm: post-action verification. Live: wait for it, hard fail otherwise.
; Dry: report current state, never fail (nothing was clicked, after all).
Confirm(cond, timeoutS := 8, desc := "confirm") {
    global DryRun
    fn := (cond is Func) ? cond : () => SeeNow(cond)
    if DryRun {
        Log("DRY  confirm '" desc "' right now: " (fn() ? "already true" : "false (expected — no click was sent)"))
        return
    }
    Wait(fn, timeoutS, "confirm: " desc)
}

; ── resilience wrapper ──────────────────────────────────────────────────
; Step(label, tries, fn): retry with backoff + optional recovery key.
; After the last failed try, re-anchors once more before giving up.
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
            Sleep(700 * A_Index)
        }
    }
}

; ── progress + run wrapper ──────────────────────────────────────────────
SetProgress(done, total := 0, note := "") {
    global PDone, PTotal, PNote
    PDone := done, PTotal := total, PNote := note
}

RunTask(name, fn) {
    global Running, Abort, CurrentTask, DryRun
    global PDone, PTotal, PNote

    ; ── clan-only gate ──────────────────────────────────────────────
    if !LicenseCheck(true) {
        ToolTip("License blocked — get your file at /macros or contact officer")
        SetTimer(() => ToolTip(), -4000)
        Log("blocked: license " LICENSE_STATUS)
        return
    }

    if Running {
        ToolTip("another task is running — " name " skipped")
        SetTimer(() => ToolTip(), -1800)
        return
    }
    if !WinActive("ahk_exe " GAME_EXE) {
        WinActivate("ahk_exe " GAME_EXE)
        Sleep(250)
    }
    if !WinActive("ahk_exe " GAME_EXE) {
        ToolTip("game window not found — " name " not started")
        SetTimer(() => ToolTip(), -2200)
        return
    }
    Running := true, Abort := false, CurrentTask := name
    PDone := 0, PTotal := 0, PNote := ""
    Pause(false)
    if !DryRun
        ToolTip(name (DryRun ? " [dry]" : "") " running")
    Log("start: " name (DryRun ? " [DRY]" : ""))
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
}

; ── arm & trigger: idle-watch for a condition, fire the task the moment
;    it's true (whole clan hits the same server frame) ────────────────────
ArmTask(name) {
    global Armed, ArmJob, Running, TASKS
    if Armed || Running {
        ToolTip("busy — stop/disarm first")
        SetTimer(() => ToolTip(), -1500)
        return
    }
    if !TASKS.Has(name) || !TASKS[name].HasProp("arm") {
        ToolTip(name " has no arm check defined")
        SetTimer(() => ToolTip(), -1800)
        return
    }
    ; clan-only gate for arm too — don't let a revoked copy sit watching
    if !LicenseCheck(true) {
        ToolTip("License blocked — can't arm")
        SetTimer(() => ToolTip(), -3000)
        return
    }
    global Abort
    Abort := false   ; a previous StopAll must not disarm this new watch
    ArmJob := { name: name, cond: TASKS[name].arm, fn: TASKS[name].fn }
    Armed := true
    Log("armed: " name)
    SetTimer(ArmTick, 450)
}
Disarm() {
    global Armed, ArmJob
    if Armed
        Log("disarmed")
    Armed := false, ArmJob := false
    SetTimer(ArmTick, 0)
}
ArmTick() {
    global Armed, ArmJob, Abort
    if !Armed
        return
    if Abort {            ; StopAll during arm — respect it, stay disarmed
        Disarm()
        return
    }
    try {
        if SeeNow(ArmJob.cond) {
            nm := ArmJob.name, f := ArmJob.fn
            Disarm()
            Log("TRIGGER: " nm)
            SetTimer(() => RunTask(nm, f), -10)
        }
    }
}

; ── clan-only licensing ─────────────────────────────────────────────────
; Personalized builds carry MEMBER_KEY + AUTH_URL. Flow:
;   • online: POST {k,m,v,pc,fp} to AUTH_URL → {ok:1} or {ok:0,reason}
;   • offline: if we had a good check within LICENSE_GRACE_HOURS (72h), allow
;   • revoked/invalid: block immediately, delete cached license, show message
;   • no key: allow but mark nokey (beta compat — old #strategy files still run
;     until you switch to /macros distribution; officers see "unknown" in health)
; Heartbeat: every 30 min while idle, via LicenseHeartbeat timer.

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
    global MEMBER_KEY, AUTH_URL, LICENSE_STATUS, LICENSE_LAST_GOOD
    global LICENSE_GRACE_HOURS, USER_DIR, MACRO_VERSION

    lf := LicenseFilePath()

    ; No key — old file or dev build. Allow, but mark.
    if MEMBER_KEY = "" {
        LICENSE_STATUS := "nokey"
        return true
    }

    ; No auth URL — can't verify (dev build with key but no URL). Allow if we have cache, else allow once.
    if AUTH_URL = "" {
        LICENSE_STATUS := "offline"
        return true
    }

    ; Try online verification (sync, short timeout)
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
                MsgBox("This macro key has been revoked.`n`nYour file is tied to your hub account. Get a new one at /macros or ask an officer.", "MCWV — revoked", "Iconx")
            return false
        }
        if InStr(txt, '"invalid"') {
            LICENSE_STATUS := "invalid"
            try FileDelete(lf)
            Log("license invalid")
            if showUI
                MsgBox("This macro key is invalid.`n`nDownload your personal file from the hub: /macros", "MCWV — invalid key", "Iconx")
            return false
        }
        ; Other non-200 or ok:0 but not revoked — treat as transient
        Log("license transient fail status=" st " body=" SubStr(txt,1,120))
    } catch as e {
        Log("license check network error: " e.Message)
    }

    ; Offline grace: was there a good check within window?
    try {
        lastGood := IniRead(lf, "license", "last_good", "0")
        if lastGood != "0" {
            ; A_TickCount wraps every ~49 days; handle negative elapsed as 0
            elapsedMs := A_TickCount - Number(lastGood)
            if elapsedMs < 0
                elapsedMs := 0
            elapsedH := elapsedMs / 1000 / 3600
            if elapsedH <= LICENSE_GRACE_HOURS {
                LICENSE_STATUS := "offline"
                return true
            }
            ; grace expired
            Log("license grace expired " Round(elapsedH,1) "h > " LICENSE_GRACE_HOURS "h")
            if showUI {
                ToolTip("License offline grace expired (" Round(elapsedH) "h). Connect once to refresh.")
                SetTimer(() => ToolTip(), -4000)
            }
            return false
        }
    } catch {
        ; no file
    }

    ; First ever run with key but no internet — allow once so member isn't bricked on download day,
    ; but mark offline and cache will be created on next online success.
    if LICENSE_STATUS = "unknown" || LICENSE_STATUS = "" {
        LICENSE_STATUS := "offline"
        return true
    }

    ; If we got here with no cache, allow but mark error (better than bricking during beta)
    LICENSE_STATUS := "error"
    return true
}

LicenseHeartbeat() {
    global Running, LICENSE_STATUS
    ; Don't heartbeat while a task is running — check right after it finishes instead (RunTask already checks at start)
    if Running
        return
    ok := LicenseCheck(false)
    if !ok && (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") {
        ; revoked while idle — disarm and alert
        Disarm()
        ToolTip("License " LICENSE_STATUS " — macros blocked. See /macros")
        SetTimer(() => ToolTip(), -5000)
    }
}

; Start heartbeat timer on load (every 30 min). First check happens on first RunTask/ArmTask.
SetTimer(LicenseHeartbeat, 1800000)

; ── telemetry: one JSON line per run to the hub, fire-and-forget.
;    Silent no-op unless configured; a hub outage can never break a macro. ──
TelemetryPost(name, result, secs) {
    global TELEMETRY_URL, TELEMETRY_KEY, MACRO_VERSION, DryRun
    global MEMBER, MEMBER_KEY
    if TELEMETRY_URL = ""
        return
    try {
        ; Use MEMBER (hub username) if present, else A_UserName — officers see verified name for keyed builds
        who := MEMBER != "" ? MEMBER : A_UserName
        e := JsonEsc(name), r := JsonEsc(result), m2 := JsonEsc(who), v := JsonEsc(MACRO_VERSION)
        body := '{"e":"' e '","r":"' r '","s":' secs ',"m":"' m2 '","v":"' v (DryRun ? '","d":1' : '') '}'
        static keep := []
        if keep.Count() > 12
            keep.RemoveAt(1, keep.Count() - 12)   ; prune old handles; a few held is fine
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        keep.Push(w)                              ; keep alive while async send completes
        w.Open("POST", TELEMETRY_URL, true)       ; async — fire and forget, never blocks a run
        w.SetTimeouts(3000, 3000, 5000, 5000)    ; resolve/connect/send/receive ms
        w.SetRequestHeader("Content-Type", "application/json")
        ; TELEMETRY_KEY is either shared MACRO_REPORT_KEY or per-member key (both accepted by hub)
        k := TELEMETRY_KEY != "" ? TELEMETRY_KEY : MEMBER_KEY
        if k != ""
            w.SetRequestHeader("x-macro-key", k)
        else if TELEMETRY_KEY != ""
            w.SetRequestHeader("x-macro-key", TELEMETRY_KEY)
        w.Send(body)
    } catch {
        ; telemetry must NEVER throw into a macro run. Dead hub = zero symptoms.
    }
}

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

StartCalib(taskName) {
    global CalibJob, TASKS, USER_DIR
    if !TASKS.Has(taskName) || !TASKS[taskName].HasProp("checks") {
        ToolTip("no calibratable checks registered for " taskName)
        SetTimer(() => ToolTip(), -1800)
        return
    }
    DirCreate(USER_DIR)
    CalibJob := { name: taskName, keys: TASKS[taskName].checks.Keys(), i: 0, done: 0, skipped: 0 }
    Log("calibrate: start " taskName)
    CalibNext()
}

CalibNext() {
    global CalibJob, TASKS
    if !CalibJob
        return
    if CalibJob.i >= CalibJob.keys.Count() {
        ApplyCalib(CalibJob.name, TASKS[CalibJob.name].checks)
        ToolTip("calibrated " CalibJob.done " (" CalibJob.skipped " skipped) — live now")
        SetTimer(() => ToolTip(), -2500)
        Log("calibrate: done " CalibJob.name " (" CalibJob.done " captured)")
        CalibJob := false
        return
    }
    key := CalibJob.keys[CalibJob.i + 1]
    ToolTip("[" (CalibJob.i + 1) "/" CalibJob.keys.Count() "] " key "`nhover it exactly · F1 capture · F2 skip · F3 abort")
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
            if p.Count() = 2 {
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
;  CONTROL PANEL v2.3 — INSANE UI
;  • Dark glass, tabs, cards, live progress, natural wording
;  • Closure-safe (factory functions, no loop var capture)
;  • AHK v2 clean: A_TrayMenu, ComObject, (x is Func), no Boolean/IsFunc
;  • Single file, no assets needed — works on any member PC
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
global FooterLbl := false

; ── closure factories — AHK v2 loop var must be captured by value ──────
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
    global UI, UIUp, LogBox, ProgBar, ProgText, TestBtn, ModeLbl, LicLbl, TabCtrl, FooterLbl, TASKS
    global MEMBER, MEMBER_KEY, LICENSE_STATUS, MACRO_VERSION, DryRun, PDone, PTotal, PNote

    UI := Gui("+AlwaysOnTop -MinimizeBox +Resize", "MCWV Macros — v" MACRO_VERSION)
    UI.BackColor := "070B1A"
    UI.MarginX := 18
    UI.MarginY := 16
    UI.SetFont("s10", "Segoe UI")

    ; ── Header: logo + version + glow line
    hdr := UI.Add("Text", "x18 y12 c00FF9D", "▮ MCWV")
    hdr.SetFont("s18 bold", "Segoe UI Black")
    sub := UI.Add("Text", "x118 y16 c7C6CFF", "MACROS")
    sub.SetFont("s13 bold", "Segoe UI")
    ver := UI.Add("Text", "x320 y14 c5A6585", "v" MACRO_VERSION " • INSANE")
    ver.SetFont("s8", "Consolas")

    ; Member card — natural
    who := MEMBER != "" ? MEMBER : (MEMBER_KEY != "" ? "key " SubStr(MEMBER_KEY,1,6) "…" : "not signed in")
    statusWord := LICENSE_STATUS = "ok" ? "✓ Active"
        : LICENSE_STATUS = "offline" ? "◐ Offline — 3d grace"
        : LICENSE_STATUS = "nokey" ? "— get file at /macros"
        : LICENSE_STATUS = "revoked" ? "✕ Revoked"
        : LICENSE_STATUS = "invalid" ? "✕ Invalid"
        : LICENSE_STATUS
    licCol := LICENSE_STATUS = "ok" ? "c00FF9D"
        : LICENSE_STATUS = "offline" ? "cFFB800"
        : (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") ? "cFF4D6D"
        : "c8A96B3"
    LicLbl := UI.Add("Text", "x18 y44 w360 " licCol, "👤 " who " · " statusWord)
    LicLbl.SetFont("s9", "Segoe UI")
    ; subtle divider
    UI.Add("Text", "x18 y64 w360 h1 Background1E2A4A")

    ; ── Tabs: Tasks | Activity | Settings
    TabCtrl := UI.Add("Tab3", "x12 y72 w368 h440 cE8ECF6", ["⚡ Tasks", "📜 Activity", "⚙ Settings"])
    TabCtrl.SetFont("s9 bold", "Segoe UI")

    ; ===== TAB 1 — TASKS =====
    TabCtrl.UseTab(1)
    y := 104
    if TASKS.Count() = 0 {
        UI.Add("Text", "x28 y112 w320 c5A6585", "No macros found — add event file and re-pack").SetFont("s9 italic")
        y := 150
    } else {
        for taskName, t in TASKS {
            ; card background using disabled Edit as panel (native way to get rounded-ish dark card)
            ; we draw 3 layers: bg, button, texts
            hasArm := t.HasProp("arm")

            ; play
            b := UI.Add("Button", "x28 y" (y+6) " w44 h36", "▶")
            b.SetFont("s12 bold")
            b.OnEvent("Click", MakeRunHandler(taskName))

            ; name + status
            nm := UI.Add("Text", "x80 y" (y+4) " w132 cFFFFFF", taskName)
            nm.SetFont("s10 bold", "Segoe UI")
            st := UI.Add("Text", "x80 y" (y+22) " w132 c8A96B3", "Idle • Ready")
            st.SetFont("s8", "Consolas")

            ; watch + setup
            aTxt := hasArm ? "◉ Watch" : "—"
            a := UI.Add("Button", "x222 y" (y+6) " w68 h18", aTxt)
            a.SetFont("s7 bold")
            if hasArm
                a.OnEvent("Click", MakeWatchHandler(taskName))

            sBtn := UI.Add("Button", "x222 y" (y+28) " w68 h14", "⚙ Setup")
            sBtn.SetFont("s7")
            sBtn.OnEvent("Click", MakeSetupHandler(taskName))

            ; quick action hint
            UI.Add("Text", "x296 y" (y+10) " w60 c3A4A6A", hasArm ? "auto" : "").SetFont("s7", "Consolas")

            t.row := { st: st, name: nm, play: b, watch: a }
            y += 52
        }
    }

    ; Progress — always visible in Tasks tab
    UI.Add("Text", "x28 y" (y+2) " w60 c5A6585", "PROGRESS").SetFont("s7 bold", "Consolas")
    ProgText := UI.Add("Text", "x90 y" (y+2) " w180 c6B7694", "Waiting for task…")
    ProgText.SetFont("s8", "Consolas")
    y += 16
    ProgBar := UI.Add("Progress", "x28 y" y " w332 h10 c00FF9D Background1A2030 Range0-100", 0)
    y += 22
    UI.Add("Text", "x28 y" y " w332 c3A4A6A", "Tip: ◉ Watch waits for game signal — whole clan fires same frame").SetFont("s7", "Consolas")

    ; ===== TAB 2 — ACTIVITY =====
    TabCtrl.UseTab(2)
    UI.Add("Text", "x28 y104 w200 cFFFFFF", "Live log").SetFont("s10 bold", "Segoe UI")
    UI.Add("Text", "x28 y120 w320 c5A6585", "Every run, retry, and license check").SetFont("s8", "Consolas")
    LogBox := UI.Add("Edit", "x28 y140 w332 h260 ReadOnly Background0A0E1E cCBD5E8 -WantReturn", TailLog(14))
    LogBox.SetFont("s8", "Consolas")
    ; copy log button
    copyBtn := UI.Add("Button", "x28 y408 w80 h24", "Copy log")
    copyBtn.SetFont("s7")
    copyBtn.OnEvent("Click", (*) => A_Clipboard := TailLog(20))

    ; ===== TAB 3 — SETTINGS =====
    TabCtrl.UseTab(3)
    UI.Add("Text", "x28 y104 w300 cFFFFFF", "Execution Mode").SetFont("s11 bold", "Segoe UI")
    TestBtn := UI.Add("Button", "x28 y128 w150 h38", DryRun ? "🧪 Test: ON" : "🧪 Test: OFF")
    TestBtn.SetFont("s10 bold")
    TestBtn.OnEvent("Click", (*) => ToggleTest())

    ModeLbl := UI.Add("Text", "x28 y174 w320 c8A96B3", DryRun ? "Test mode — no clicks, just checks" : "Ready — clicks are live")
    ModeLbl.SetFont("s8", "Consolas")
    UI.Add("Text", "x28 y194 w320 c3A4A6A", "Test = safe dry-run. OFF = real clicks in Roblox.").SetFont("s7", "Consolas")

    UI.Add("Text", "x28 y224 w300 cFFFFFF", "Safety").SetFont("s11 bold", "Segoe UI")
    stop := UI.Add("Button", "x28 y248 w150 h38", "✖ Stop All")
    stop.SetFont("s10 bold")
    stop.OnEvent("Click", (*) => StopAll())
    UI.Add("Text", "x28 y294 w320 c5A6585", "Stops any running task or Watch.").SetFont("s7", "Consolas")

    UI.Add("Text", "x28 y320 w300 cFFFFFF", "Hotkeys").SetFont("s11 bold", "Segoe UI")
    UI.Add("Text", "x28 y342 w332 c8A96B3", "Ctrl+Alt+M  panel`nCtrl+Alt+X  stop`nF12  pause`nF1/F2/F3  during Setup: capture / skip / abort").SetFont("s8", "Consolas")

    UI.Add("Text", "x28 y400 w332 c3A4A6A", "Personal build — tied to your hub account. Don't forward. Get friends their own at /macros").SetFont("s7", "Consolas")

    TabCtrl.UseTab() ; end tabs

    ; ── Footer glow + status
    UI.Add("Text", "x0 y516 w400 h2 Background00FF9D")
    FooterLbl := UI.Add("Text", "x18 y522 w360 c5A6585", "MCWV • forged for war • " MACRO_VERSION)
    FooterLbl.SetFont("s7", "Consolas")

    UI.Show("w392 h548")
    UIUp := true
    SetTimer(RefreshUI, 320)
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
    TestBtn.Text := DryRun ? "🧪 Test: ON" : "🧪 Test: OFF"
    ModeLbl.Text := DryRun ? "Test mode — no clicks, just checks" : "Ready — clicks are live"
    Log("test mode " (DryRun ? "ON — safe, no clicks" : "OFF — live"))
}

RefreshUI() {
    global UIUp, TASKS, Running, CurrentTask, Armed, ArmJob, PDone, PTotal, ProgBar, ProgText, LogBox, ModeLbl, DryRun
    global LicLbl, MEMBER, MEMBER_KEY, LICENSE_STATUS, FooterLbl

    if !UIUp
        return

    ; update task rows
    for taskName, t in TASKS {
        if !t.HasProp("row")
            continue
        if Running && CurrentTask = taskName {
            st := PTotal > 0 ? "▶ Running " PDone "/" PTotal : "▶ Running…"
            col := "c00FF9D"
        } else if Armed && (ArmJob is Object) && ArmJob.name = taskName {
            st := "◉ Watching — auto"
            col := "c22D3EE"
        } else {
            st := "Idle • Ready"
            col := "c8A96B3"
        }
        if t.row.st.Text != st {
            t.row.st.Text := st
            try t.row.st.SetFont(col, "Consolas")
        }
        ; play button text changes when running
        wantPlay := (Running && CurrentTask = taskName) ? "✖" : "▶"
        if t.row.play.Text != wantPlay
            t.row.play.Text := wantPlay
    }

    ; progress
    if ProgBar {
        ProgBar.Value := (PTotal > 0) ? Round(100 * PDone / PTotal) : 0
    }
    if ProgText {
        ProgText.Text := (PTotal > 0) ? (PDone "/" PTotal " — " PNote) : (PNote != "" ? PNote : "Waiting…")
    }

    ; log
    if LogBox {
        v := TailLog(14)
        static seen := ""
        if v != seen {
            LogBox.Value := v
            seen := v
        }
    }

    ; license line
    if LicLbl {
        who := MEMBER != "" ? MEMBER : (MEMBER_KEY != "" ? "key " SubStr(MEMBER_KEY,1,6) "…" : "not signed in")
        statusWord := LICENSE_STATUS = "ok" ? "✓ Active"
            : LICENSE_STATUS = "offline" ? "◐ Offline — 3d grace"
            : LICENSE_STATUS = "nokey" ? "— get file at /macros"
            : LICENSE_STATUS = "revoked" ? "✕ Revoked"
            : LICENSE_STATUS = "invalid" ? "✕ Invalid"
            : LICENSE_STATUS
        full := "👤 " who " · " statusWord
        if LicLbl.Text != full {
            LicLbl.Text := full
            col := LICENSE_STATUS = "ok" ? "c00FF9D"
                : LICENSE_STATUS = "offline" ? "cFFB800"
                : (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") ? "cFF4D6D"
                : "c8A96B3"
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
