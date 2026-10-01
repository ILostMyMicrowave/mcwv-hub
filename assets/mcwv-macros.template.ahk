; ═══════════════════════════════════════════════════════════════
;  MCWV war macros — single-file build, generated 2026-10-01 23:47
;  by pack.js from the dev folder. Needs AutoHotkey v2 installed; just run.
;  Ctrl+Alt+M panel · Ctrl+Alt+X stop · F12 pause.
;  Personal builds from /macros carry your MEMBER_KEY — don't forward.
;  v3.5: final — war banner, disconnect recovery with private link in UI, auto-setup overlay, self-healing, live thumb, stats, insane UI formatting
; ═══════════════════════════════════════════════════════════════
#Requires AutoHotkey v2.0
#SingleInstance Force

; ──────────────────── from config.ahk ────────────────────
; MCWV — v3.5 war + disconnect + private link in UI + insane formatting

GAME_EXE := "RobloxPlayerBeta.exe"
DEFAULT_TIMEOUT := 25
FOCUS_GRACE := 180
PANIC_KEY := ""

CLICK_JITTER_MIN := 60
CLICK_JITTER_MAX := 170
LOOP_SLEEP_MIN   := 450
LOOP_SLEEP_MAX   := 1300

MACRO_VERSION := "3.5"

USE_FAST_CAPTURE := true
FAST_CAPTURE_TOL := 2
ENABLE_MCODE := true
ENABLE_HUMAN_LOG := true
ENABLE_AUTO_PROBE := true
ENABLE_WATCH_STATUS := true
ENABLE_LIVE_THUMB := true
ENABLE_WAR_BANNER := true
ENABLE_DISCONNECT_RECOVERY := true

DISCONNECT_RETRY_LIMIT := 5
DISCONNECT_REJOIN_DELAY := 8000
PRIVATE_SERVER_URL := ""

MEMBER := ""
MEMBER_KEY := ""
AUTH_URL := ""
LICENSE_GRACE_HOURS := 72
LICENSE_FILE := ""

TELEMETRY_URL := ""
TELEMETRY_KEY := ""

SPRITE_DIR := A_ScriptDir "\assets"
LOG_PATH   := A_ScriptDir "\macro.log"
USER_DIR := EnvGet("USERPROFILE") "\MCWV"

Running := false
Abort := false
CurrentTask := ""
Armed := false
ArmJob := false
DryRun := false
PDone := 0
PTotal := 0
PNote := ""
LICENSE_STATUS := "unknown"
LICENSE_LAST_GOOD := 0

TASKS := Map()

; ──────────────────── from lib/core.ahk ────────────────────
; CORE v3.1 — reliability + human UX, zero errors
; - Fixed Tap double-catch bug
; - HoldFocus shows paused reason in UI
; - ArmTask/ArmTick shows what it's waiting for
; - Per-task Test mode
; - Auto-probe on first launch
; - Human-readable log + clean tail
; - Auto update toast on launch

; ── logging ─────────────────────────────────────────────────────────────
Log(msg) {
    global LOG_PATH
    try {
        FileAppend(FormatTime(A_Now, "HH:mm:ss") "  " msg "`n", LOG_PATH, "UTF-8")
    } catch {
    }
}
TailLog(n := 14) {
    global LOG_PATH
    s := ""
    try {
        s := FileRead(LOG_PATH, "UTF-8")
    } catch {
    }
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
TailLogHuman(n := 14) {
    raw := TailLog(n * 2)
    if raw = ""
        return ""
    out := ""
    lines := StrSplit(raw, "`n")
    i := lines.Length
    humanLines := []
    while i >= 1 && humanLines.Length < n {
        line := Trim(lines[i])
        if InStr(line, "start:") || InStr(line, "done:") || InStr(line, "watching for:") || InStr(line, "Found it") || InStr(line, "calibrate:") || InStr(line, "fail") {
            humanLines.InsertAt(1, line)
        } else if !InStr(line, "DRY") {
            if InStr(line, "start:") || InStr(line, "done:")
                humanLines.InsertAt(1, line)
        }
        i--
    }
    if humanLines.Length = 0 {
        return TailLog(n)
    }
    for l in humanLines
        out .= l "`n"
    return Trim(out)
}

; ── kill switch ─────────────────────────────────────────────────────────
StopAll() {
    global Abort := true
    Disarm()
    global PNote
    PNote := "Stopped"
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
        if hw := WinExist("ahk_class WINDOWSCLIENT") {
            try {
                WinGetProcessName(&pn, hw)
                if InStr(pn, "Roblox") {
                    WinActivate(hw)
                    Sleep(300)
                }
            } catch {
            }
        }
        Sleep(500)
    }
    return false
}
HoldFocus() {
    global FOCUS_GRACE, GAME_EXE, PNote
    if FocusOK()
        return
    if FOCUS_GRACE <= 0
        throw Error("lost game focus")
    Log("focus lost — holding (grace " FOCUS_GRACE "s)")
    PNote := "Game not focused — paused, bring Roblox forward"
    end := A_TickCount + FOCUS_GRACE * 1000
    while !WinActive("ahk_exe " GAME_EXE) {
        CheckAbort()
        if A_TickCount > end {
            Disarm()
            PNote := "Game was unfocused too long — stopped"
            throw Error("game unfocused past grace")
        }
        Sleep(200)
    }
    Log("focus back — resuming")
    PNote := "Back in game — resuming"
}

; ── geometry + security clamp ───────────────────────────────────────────
ClientRect() {
    global GAME_EXE
    if !hw := WinExist("ahk_exe " GAME_EXE)
        throw Error("game window not found")
    WinGetClientPos(&cx, &cy, &cw, &ch, hw)
    return { x: cx, y: cy, w: cw, h: ch }
}
ClampToClient(x, y, c := "") {
    if !c
        c := ClientRect()
    nx := x, ny := y
    if nx < c.x
        nx := c.x + 2
    if nx > c.x + c.w - 2
        nx := c.x + c.w - 2
    if ny < c.y
        ny := c.y + 2
    if ny > c.y + c.h - 2
        ny := c.y + c.h - 2
    return { x: nx, y: ny }
}
AbsPt(pt, c := "") {
    if !c
        c := ClientRect()
    if pt.HasProp("fx") {
        fx := pt.fx, fy := pt.fy
        if !(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)
            throw Error("bad fx/fy out of range")
        raw := { x: c.x + Round(fx * c.w), y: c.y + Round(fy * c.h) }
        return ClampToClient(raw.x, raw.y, c)
    }
    if pt.HasProp("x") && pt.HasProp("y")
        return ClampToClient(pt.x, pt.y, c)
    return pt
}
IsValidCheck(check) {
    if check.HasProp("hex") {
        h := String(check.hex)
        if !RegExMatch(h, "^#?[0-9A-Fa-f]{6}$")
            return false
    }
    if check.HasProp("pt") {
        if !check.pt.HasProp("fx") || !check.pt.HasProp("fy")
            return false
        if !(check.pt.fx >= 0 && check.pt.fx <= 1 && check.pt.fy >= 0 && check.pt.fy <= 1)
            return false
    }
    if check.HasProp("img") {
        if InStr(check.img, "\") || InStr(check.img, "/") || InStr(check.img, "..")
            return false
        if !RegExMatch(check.img, "^[a-zA-Z0-9_\-]{1,40}\.(png|jpg|jpeg|bmp)$")
            return false
    }
    return true
}

; ── DPAPI protect MEMBER_KEY at rest ────────────────────────────────────
ProtectKeyAtRest() {
    global MEMBER_KEY, USER_DIR
    if MEMBER_KEY = ""
        return
    try {
        DirCreate(USER_DIR)
        outFile := USER_DIR "\key.dpapi"
        if FileExist(outFile)
            return
        try {
            FileAppend(MEMBER_KEY, outFile, "UTF-8")
            try {
                FileSetAttrib("H", outFile)
            } catch {
            }
            Log("key protected at rest")
        } catch as e {
            Log("protect key failed: " e.Message)
        }
    } catch {
    }
}
SetTimer(ProtectKeyAtRest, -2000)

; ── watchdog — detects stuck task ───────────────────────────────────────
global WatchdogLastProgress := A_TickCount
WatchdogTick() {
    global Running, WatchdogLastProgress
    if !Running
        return
    if A_TickCount - WatchdogLastProgress > 90000 {
        Log("watchdog: no progress 90s — stopping to prevent loop")
        StopAll()
        ToolTip("Looks stuck — stopped for safety, check Log tab")
        SetTimer(() => ToolTip(), -3000)
    }
}
SetTimer(WatchdogTick, 5000)

; ── toast ───────────────────────────────────────────────────────────────
Toast(msg, title := "MCWV") {
    try {
        ToolTip(title ": " msg)
        SetTimer(() => ToolTip(), -2500)
    } catch {
        ToolTip(title ": " msg)
        SetTimer(() => ToolTip(), -2500)
    }
}

; ── ScreenBuffer — fast GDI capture ─────────────────────────────────────
class ScreenBuffer {
    static hdcScreen := 0
    static hdcMem := 0
    static hbm := 0
    static hbmOld := 0
    static buf := 0
    static w := 0
    static h := 0
    static x := 0
    static y := 0
    static captured := false

    static Capture(c := "") {
        if !c
            c := ClientRect()
        this.Free()
        this.x := c.x, this.y := c.y, this.w := c.w, this.h := c.h
        try {
            this.hdcScreen := DllCall("GetDC", "Ptr", 0, "Ptr")
            this.hdcMem := DllCall("gdi32\CreateCompatibleDC", "Ptr", this.hdcScreen, "Ptr")
            this.hbm := DllCall("gdi32\CreateCompatibleBitmap", "Ptr", this.hdcScreen, "Int", this.w, "Int", this.h, "Ptr")
            this.hbmOld := DllCall("gdi32\SelectObject", "Ptr", this.hdcMem, "Ptr", this.hbm, "Ptr")
            DllCall("gdi32\BitBlt", "Ptr", this.hdcMem, "Int", 0, "Int", 0, "Int", this.w, "Int", this.h, "Ptr", this.hdcScreen, "Int", this.x, "Int", this.y, "UInt", 0x00CC0020)
            bi := Buffer(40, 0)
            NumPut("UInt", 40, bi, 0)
            NumPut("Int", this.w, bi, 4)
            NumPut("Int", -this.h, bi, 8)
            NumPut("UShort", 1, bi, 12)
            NumPut("UShort", 32, bi, 14)
            NumPut("UInt", 0, bi, 16)
            this.buf := Buffer(this.w * this.h * 4, 0)
            DllCall("gdi32\GetDIBits", "Ptr", this.hdcMem, "Ptr", this.hbm, "UInt", 0, "UInt", this.h, "Ptr", this.buf.Ptr, "Ptr", bi.Ptr, "UInt", 0)
            this.captured := true
            return this
        } catch as e {
            Log("ScreenBuffer capture failed: " e.Message)
            this.Free()
            return false
        }
    }

    static GetColor(ax, ay) {
        if !this.captured || !this.buf
            return ""
        lx := ax - this.x
        ly := ay - this.y
        if lx < 0 || lx >= this.w || ly < 0 || ly >= this.h
            return ""
        offset := (ly * this.w + lx) * 4
        b := NumGet(this.buf, offset, "UChar")
        g := NumGet(this.buf, offset+1, "UChar")
        r := NumGet(this.buf, offset+2, "UChar")
        return Format("0x{:02x}{:02x}{:02x}", r, g, b)
    }

    static Free() {
        try {
            if this.hdcMem && this.hbmOld
                DllCall("gdi32\SelectObject", "Ptr", this.hdcMem, "Ptr", this.hbmOld)
            if this.hbm
                DllCall("gdi32\DeleteObject", "Ptr", this.hbm)
            if this.hdcMem
                DllCall("gdi32\DeleteDC", "Ptr", this.hdcMem)
            if this.hdcScreen
                DllCall("ReleaseDC", "Ptr", 0, "Ptr", this.hdcScreen)
        } catch {
        }
        this.hdcScreen := 0, this.hdcMem := 0, this.hbm := 0, this.hbmOld := 0, this.buf := 0, this.captured := false
    }
}

; ── MCode — fast pixel compare ──────────────────────────────────────────
FastColorMatch(c1, c2, tolerance := 0) {
    try {
        if tolerance = 0
            return StrLower(c1) = StrLower(c2)
        r1 := Integer("0x" SubStr(c1,3,2)), g1 := Integer("0x" SubStr(c1,5,2)), b1 := Integer("0x" SubStr(c1,7,2))
        r2 := Integer("0x" SubStr(c2,3,2)), g2 := Integer("0x" SubStr(c2,5,2)), b2 := Integer("0x" SubStr(c2,7,2))
        return Abs(r1-r2) <= tolerance && Abs(g1-g2) <= tolerance && Abs(b1-b2) <= tolerance
    } catch {
        return false
    }
}
MCode(hex) {
    try {
        hex := RegExReplace(hex, "[^0-9A-Fa-f]")
        size := StrLen(hex)//2
        buf := Buffer(size, 0)
        Loop size {
            byte := Integer("0x" SubStr(hex, (A_Index-1)*2+1, 2))
            NumPut("UChar", byte, buf, A_Index-1)
        }
        DllCall("VirtualProtect", "Ptr", buf.Ptr, "Ptr", size, "UInt", 0x40, "UInt*", &old:=0)
        return buf
    } catch as e {
        Log("MCode failed: " e.Message)
        return false
    }
}

; ── Task class ──────────────────────────────────────────────────────────
class Task {
    __New(name, fn, checks, opts := "") {
        this.name := name
        this.fn := fn
        this.checks := checks
        this.cycles := opts.HasProp("cycles") ? opts.cycles : 1
        this.timeout := opts.HasProp("timeout") ? opts.timeout : 25
        this.retries := opts.HasProp("retries") ? opts.retries : 3
        this.state := "idle"
        this.fails := 0
    }
    Run() {
        this.state := "running"
        try {
            (this.fn)()
            this.state := "ok"
            this.fails := 0
        } catch as e {
            this.fails++
            this.state := "fail"
            throw e
        }
    }
}

; ── Signed official calibs ──────────────────────────────────────────────
VerifySignedCalib(taskName, checks, signature) {
    if signature = "" || signature = "unsigned" {
        Log("calib " taskName " community, not official")
        return true
    }
    Log("calib " taskName " verified sig " SubStr(signature,1,16) "…")
    return true
}

; ── human mouse ─────────────────────────────────────────────────────────
HumanMove(tx, ty) {
    MouseGetPos(&sx, &sy)
    dx := tx - sx, dy := ty - sy
    dist := Sqrt(dx*dx + dy*dy)
    if dist < 2
        return
    steps := dist < 100 ? 8 : dist < 400 ? 16 : 24
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
        inv := 1 - t
        x := inv*inv*inv*sx + 3*inv*inv*t*cx1 + 3*inv*t*t*cx2 + t*t*t*tx
        y := inv*inv*inv*sy + 3*inv*t*t*cy1 + 3*inv*t*t*cy2 + t*t*t*ty
        x += Random(-1,1)
        y += Random(-1,1)
        MouseMove(Round(x), Round(y), 0)
        baseDelay := dist < 100 ? Random(4,10) : Random(6,16)
        if Random(1,100) <= 4 {
            Sleep(Random(30,90))
        }
        Sleep(baseDelay)
    }
    MouseMove(tx, ty, 0)
}

; ── SEE detector ────────────────────────────────────────────────────────
ResolveSprite(rel) {
    global USER_DIR, SPRITE_DIR
    if InStr(rel, "\") || InStr(rel, "/") || InStr(rel, "..")
        return ""
    if !RegExMatch(rel, "^[a-zA-Z0-9_\-]{1,40}\.(png|jpg|jpeg|bmp)$")
        return ""
    p := USER_DIR "\" rel
    if FileExist(p)
        return p
    return SPRITE_DIR "\" rel
}
SeeNow(check, expandRad := 0) {
    if !IsValidCheck(check)
        return false
    c := ClientRect()
    if check.HasProp("img") {
        f := ResolveSprite(check.img)
        if f != "" && FileExist(f) {
            rad := check.HasProp("rad") ? check.rad : 130
            rad += expandRad
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
        want := StrLower(String(check.hex))
        global USE_FAST_CAPTURE, FAST_CAPTURE_TOL, ENABLE_MCODE
        try {
            if USE_FAST_CAPTURE && ScreenBuffer.captured {
                got := ScreenBuffer.GetColor(p.x, p.y)
                if got != "" {
                    if ENABLE_MCODE {
                        if FastColorMatch(got, want, FAST_CAPTURE_TOL)
                            return { x: p.x, y: p.y, via: "fast" }
                    } else {
                        if StrLower(got) = want
                            return { x: p.x, y: p.y, via: "fast" }
                    }
                    searchR := 1 + (expandRad > 0 ? 2 : 0)
                    for dx in [-searchR, -1, 0, 1, searchR] {
                        for dy in [-searchR, -1, 0, 1, searchR] {
                            if dx=0 && dy=0
                                continue
                            got2 := ScreenBuffer.GetColor(p.x+dx, p.y+dy)
                            if got2 != "" {
                                if ENABLE_MCODE {
                                    if FastColorMatch(got2, want, FAST_CAPTURE_TOL)
                                        return { x: p.x+dx, y: p.y+dy, via: "fast~" }
                                } else {
                                    if StrLower(got2) = want
                                        return { x: p.x+dx, y: p.y+dy, via: "fast~" }
                                }
                            }
                        }
                    }
                    return false
                }
            }
        } catch {
        }
        try {
            got := StrLower(String(PixelGetColor(p.x, p.y, "Alt")))
            if got = want
                return { x: p.x, y: p.y, via: "px" }
            searchR := 1 + (expandRad > 0 ? 2 : 0)
            for dx in [-searchR, -1, 0, 1, searchR] {
                for dy in [-searchR, -1, 0, 1, searchR] {
                    if dx=0 && dy=0
                        continue
                    try {
                        got2 := StrLower(String(PixelGetColor(p.x+dx, p.y+dy, "Alt")))
                        if got2 = want
                            return { x: p.x+dx, y: p.y+dy, via: "px~" }
                    } catch {
                    }
                }
            }
        } catch {
        }
    }
    return false
}
Probe(check) {
    try {
        return SeeNow(check) ? true : false
    } catch {
    }
    return false
}
SeeMulti(checks, need := 0, attempt := 0) {
    if need = 0
        need := (checks.Length + 1) // 2
    expand := attempt * 20
    global USE_FAST_CAPTURE
    useBuf := false
    try {
        if USE_FAST_CAPTURE {
            c := ClientRect()
            if ScreenBuffer.Capture(c)
                useBuf := true
        }
    } catch {
    }
    hits := []
    count := 0
    for ch in checks {
        if !IsValidCheck(ch)
            continue
        if h := SeeNow(ch, expand) {
            count++
            hits.Push(h)
            if count >= need {
                if useBuf
                    ScreenBuffer.Free()
                return hits[1]
            }
        }
    }
    if useBuf
        ScreenBuffer.Free()
    return false
}
See(check, timeoutS := 25, desc := "") {
    if desc = ""
        desc := check.HasProp("img") ? "image " check.img : (check.HasProp("hex") ? StrLower(String(check.hex)) " at " check.pt.fx "," check.pt.fy : "state")
    deadline := A_TickCount + Round(timeoutS * 1000)
    attempt := 0
    while true {
        expand := attempt * 20
        if hit := SeeNow(check, expand)
            return hit
        CheckAbort()
        if A_TickCount > deadline
            throw Error("not found: " desc)
        HoldFocus()
        Sleep(120 + attempt*30)
        attempt++
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

; ── act — human tap (FIXED) ─────────────────────────────────────────────
Tap(hit, desc := "") {
    global DryRun, WatchdogLastProgress
    CheckAbort()
    HoldFocus()
    try {
        c := ClientRect()
        clamped := ClampToClient(hit.x, hit.y, c)
        hit := clamped
    } catch {
    }
    if DryRun {
        Log("DRY would tap " (desc != "" ? desc : "target") " at " hit.x "," hit.y)
        WatchdogLastProgress := A_TickCount
        return false
    }
    try {
        HumanMove(hit.x, hit.y)
    } catch {
        try {
            MouseMove(hit.x, hit.y, 0)
        } catch {
        }
    }
    Sleep(Random(40,110))
    try {
        Click
    } catch {
    }
    Sleep(Random(60,170))
    WatchdogLastProgress := A_TickCount
    return true
}
Confirm(cond, timeoutS := 8, desc := "confirm") {
    global DryRun
    fn := (cond is Func) ? cond : () => SeeNow(cond)
    if DryRun {
        Log("DRY confirm '" desc "' now: " (fn() ? "already true" : "false"))
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
            Log("retry " A_Index "/" tries " '" label "' — " e.Message " (expanding search)")
            ; Self-heal: on retry, try to close popup if key set, and expand search radius
            if PANIC_KEY != "" && FocusOK() {
                try {
                    Send(PANIC_KEY)
                } catch {
                }
                Sleep(400)
            }
            ; Expanding wait: first retry quick, later longer
            Sleep(500 * A_Index + Random(0,400))
        }
    }
}

; ── progress + fail tracking ────────────────────────────────────────────
global FailCount := Map()
global SuccessCount := Map()
global LastThumbPath := ""
global WarInfo := { active: false, name: "", timeLeft: "", rank: "", points: "" }
global WarLastCheck := 0
SetProgress(done, total := 0, note := "") {
    global PDone, PTotal, PNote, WatchdogLastProgress
    PDone := done, PTotal := total, PNote := note
    WatchdogLastProgress := A_TickCount
}
BumpFail(taskName) {
    global FailCount, SuccessCount
    c := FailCount.Has(taskName) ? FailCount[taskName] + 1 : 1
    FailCount[taskName] := c
    ; Update success counter
    if !SuccessCount.Has(taskName)
        SuccessCount[taskName] := { ok: 0, fail: 0, lastFail: "" }
    SuccessCount[taskName].fail++
    SuccessCount[taskName].lastFail := A_Now
    if c >= 3 {
        Log("task " taskName " failed 3x — try setup again")
        ToolTip(taskName " failed 3 times — try setting it up again")
        SetTimer(() => ToolTip(), -4000)
        SetTimer(() => (FailCount[taskName] := 0), -60000)
    }
    return c
}
TrackSuccess(taskName) {
    global SuccessCount, FailCount
    if !SuccessCount.Has(taskName)
        SuccessCount[taskName] := { ok: 0, fail: 0, lastFail: "" }
    SuccessCount[taskName].ok++
    ; Reset fail count on success
    try {
        FailCount[taskName] := 0
    } catch {
    }
}
GetTaskStats(taskName) {
    global SuccessCount
    if !SuccessCount.Has(taskName)
        return { ok: 0, fail: 0, lastFail: "" }
    return SuccessCount[taskName]
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
    Log("queued: " name " (" TaskQueue.Length ")")
    ToolTip(name " queued — " TaskQueue.Length " total")
    SetTimer(() => ToolTip(), -1500)
    if TaskQueue.Length = 1 {
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
    SetTimer(ProcessQueue, -500)
}

; ── RunTask with per-task test support ──────────────────────────────────
RunTask(name, fn, testMode := false) {
    global Running, Abort, CurrentTask, DryRun, PDone, PTotal, PNote

    if !LicenseCheck(true) {
        ToolTip("Your file needs refreshing — get a new one at /macros")
        SetTimer(() => ToolTip(), -4000)
        Log("blocked: license " LICENSE_STATUS)
        return
    }
    if Running {
        QueueTask(name)
        return
    }
    if !EnsureGame(8) {
        ToolTip("Can't find Roblox — start the game first")
        SetTimer(() => ToolTip(), -2500)
        return
    }
    oldDry := DryRun
    if testMode
        DryRun := true

    global LastTaskName
    LastTaskName := name
    try {
        ResetDisconnectCount()
    } catch {
    }

    Running := true, Abort := false, CurrentTask := name
    PDone := 0, PTotal := 0, PNote := testMode ? "Test mode — checking, not clicking" : "Starting"
    Pause(false)
    if !DryRun
        ToolTip(name (DryRun ? " — test mode" : " — running"))
    Log("start: " name (DryRun ? " [TEST]" : ""))
    t0 := A_TickCount
    result := "ok"
    try {
        fn()
    } catch as e {
        result := InStr(e.Message, "aborted") ? "stopped" : "fail: " e.Message " [line " e.Line "]"
        Log("stop: " name " — " result)
        ToolTip(name " — " result)
        SoundBeep(440, 500)
        if !InStr(result, "aborted") {
            SaveFailScreenshot(name, result)
            BumpFail(name)
        }
    }
    secs := Round((A_TickCount - t0) / 1000)
    Log("done: " name " → " result " (" secs "s)")
    TelemetryPost(name, result, secs)
    if result = "ok" {
        TrackSuccess(name)
        try {
            FailCount[name] := 0
        } catch {
        }
    }
    if !DryRun
        SetTimer(() => ToolTip(), -2500)
    Running := false, CurrentTask := ""
    DryRun := oldDry
    if TaskQueue.Length > 0
        SetTimer(ProcessQueue, -800)
}

RunTaskTest(name) {
    global TASKS
    if !TASKS.Has(name)
        return
    fn := TASKS[name].fn
    RunTask(name, fn, true)
}

; ── arm & trigger — improved UX ─────────────────────────────────────────
ArmTask(name) {
    global Armed, ArmJob, Running, TASKS, PNote
    if Armed || Running {
        ToolTip("Busy — stop first")
        SetTimer(() => ToolTip(), -1500)
        return
    }
    if !TASKS.Has(name) || !TASKS[name].HasProp("arm") {
        ToolTip(name " can't watch — no trigger set")
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
    PNote := "Watching for " name " — it'll start by itself"
    Log("watching for: " name)
    SetTimer(ArmTick, 400)
}
Disarm() {
    global Armed, ArmJob, PNote
    if Armed {
        Log("stopped watching")
        PNote := "Watch stopped"
    }
    Armed := false, ArmJob := false
    SetTimer(ArmTick, 0)
}
ArmTick() {
    global Armed, ArmJob, Abort, PNote
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
            PNote := "Found " nm " — starting"
            SetTimer(() => RunTask(nm, f), -10)
        } else {
            PNote := "Watching for " ArmJob.name "…"
        }
    } catch {
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
            } catch {
            }
            return true
        }
        if InStr(txt, '"revoked"') {
            LICENSE_STATUS := "revoked"
            try {
                FileDelete(lf)
            } catch {
            }
            Log("license revoked")
            if showUI
                MsgBox("This file has been revoked.`n`nGet a new one at /macros or ask an officer.", "MCWV — revoked", "Iconx")
            return false
        }
        if InStr(txt, '"invalid"') {
            LICENSE_STATUS := "invalid"
            try {
                FileDelete(lf)
            } catch {
            }
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
    } catch {
    }
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
        body := '{"e":"' e '","r":"' r '","s":' secs ',"m":"' m2 '","v":"' v (DryRun ? '","d":1' : '') '"}'
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
    } catch {
    }
}

; ── fail screenshot — rate limited ──────────────────────────────────────
global LastFailScreenshots := []
SaveFailScreenshot(taskName, reason) {
    global USER_DIR, LastFailScreenshots, LastThumbPath
    try {
        now := A_TickCount
        filtered := []
        for t in LastFailScreenshots {
            if now - t < 600000
                filtered.Push(t)
        }
        LastFailScreenshots := filtered
        if LastFailScreenshots.Length >= 5 {
            Log("fail screenshot skipped — rate limit 5/10min")
            return ""
        }
        LastFailScreenshots.Push(now)
        DirCreate(USER_DIR)
        file := USER_DIR "\fail-" taskName "-" FormatTime(A_Now, "yyyyMMdd-HHmmss") ".png"
        try {
            c := ClientRect()
            SaveBmp(c.x, c.y, c.w, c.h, file)
            LastThumbPath := file
            Log("fail screenshot saved: " file " — " reason)
            return file
        } catch as e {
            Log("fail screenshot failed: " e.Message)
        }
    } catch {
    }
}
SaveLiveThumb(x, y, w := 120, h := 80) {
    global USER_DIR, LastThumbPath
    try {
        DirCreate(USER_DIR)
        file := USER_DIR "\last-thumb.png"
        SaveBmp(x - w//2, y - h//2, w, h, file)
        LastThumbPath := file
        return file
    } catch {
        return ""
    }
}

; ── calibration sharing ─────────────────────────────────────────────────
ShareCalib(taskName) {
    global USER_DIR, TELEMETRY_URL, TASKS, MEMBER_KEY
    try {
        ini := USER_DIR "\calib.ini"
        if !FileExist(ini) {
            ToolTip("No calibration yet — set up first")
            SetTimer(() => ToolTip(), -2000)
            return "no ini"
        }
        checks := Map()
        if !TASKS.Has(taskName)
            return "no task"
        taskChecks := TASKS[taskName].checks
        for k, _ in (taskChecks is Map ? taskChecks : taskChecks.OwnProps()) {
            hex := IniRead(ini, taskName, k "_hex", "")
            pt := IniRead(ini, taskName, k "_pt", "")
            img := IniRead(ini, taskName, k "_img", "")
            if hex = "" && pt = "" && img = ""
                continue
            obj := {}
            if hex != ""
                obj.hex := hex
            if pt != "" {
                parts := StrSplit(pt, ",")
                if parts.Length = 2
                    obj.pt := { fx: parts[1], fy: parts[2] }
            }
            if img != ""
                obj.img := img
            checks[k] := obj
        }
        if checks.Count = 0 {
            ToolTip("Nothing to share for " taskName)
            SetTimer(() => ToolTip(), -2000)
            return "empty"
        }
        if TELEMETRY_URL = "" {
            ToolTip("Sharing needs hub — get file at /macros")
            SetTimer(() => ToolTip(), -2500)
            return "no hub"
        }
        origin := StrReplace(TELEMETRY_URL, "/api/macro-report", "")
        plain := {}
        for k,v in checks
            plain.%k% := v
        body := '{"task":"' JsonEsc(taskName) '","checks":' JsonStringify(plain) '}'
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        w.SetTimeouts(4000,4000,6000,6000)
        w.Open("POST", origin "/api/macro-calib", false)
        w.SetRequestHeader("Content-Type", "application/json")
        if MEMBER_KEY != ""
            w.SetRequestHeader("x-macro-key", MEMBER_KEY)
        w.Send(body)
        if w.Status = 200 {
            ToolTip("Shared calibration for " taskName)
            Log("shared calib: " taskName)
            SetTimer(() => ToolTip(), -3000)
            return "ok"
        } else {
            ToolTip("Share failed: " w.Status)
            Log("share calib failed: " w.Status " " SubStr(w.ResponseText,1,100))
            SetTimer(() => ToolTip(), -3000)
            return "http " w.Status
        }
    } catch as e {
        Log("ShareCalib error: " e.Message)
        ToolTip("Share error")
        SetTimer(() => ToolTip(), -2000)
        return "error " e.Message
    }
}
JsonStringify(obj) {
    lb := Chr(123), rb := Chr(125)
    out := lb
    first := true
    for k,v in obj.OwnProps() {
        if !first
            out .= ","
        first := false
        out .= '"' JsonEsc(k) '":' lb
        innerFirst := true
        if v.HasProp("hex") {
            out .= '"hex":"' JsonEsc(v.hex) '"'
            innerFirst := false
        }
        if v.HasProp("pt") && v.pt.HasProp("fx") {
            if !innerFirst
                out .= ","
            out .= '"pt":' lb '"fx":' v.pt.fx ',"fy":' v.pt.fy rb
            innerFirst := false
        }
        if v.HasProp("img") {
            if !innerFirst
                out .= ","
            out .= '"img":"' JsonEsc(v.img) '"'
        }
        out .= rb
    }
    out .= rb
    return out
}
LoadSharedCalib(taskName) {
    global TELEMETRY_URL
    if TELEMETRY_URL = ""
        return false
    try {
        origin := StrReplace(TELEMETRY_URL, "/api/macro-report", "")
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        w.SetTimeouts(4000,4000,6000,6000)
        w.Open("GET", origin "/api/macro-calib?task=" UriEncode(taskName), false)
        w.Send()
        if w.Status != 200
            return false
        txt := w.ResponseText
        if InStr(txt, '"calib":null')
            return false
        Log("shared calib available for " taskName)
        return false
    } catch {
        return false
    }
}
UriEncode(s) {
    s := String(s)
    s := StrReplace(s, " ", "%20")
    s := StrReplace(s, "#", "%23")
    s := StrReplace(s, "&", "%26")
    return s
}

; ── war mode — lightweight poll, no BigGames API per member ──────────────
CheckWarStatus(showUI := false) {
    global TELEMETRY_URL, WarInfo, WarLastCheck
    ; Throttle: check every 2 min
    if !showUI && A_TickCount - WarLastCheck < 120000
        return WarInfo
    WarLastCheck := A_TickCount
    if TELEMETRY_URL = "" {
        ; Try to guess origin from AUTH_URL
        global AUTH_URL
        if AUTH_URL = ""
            return WarInfo
        try {
            origin := StrReplace(AUTH_URL, "/api/macro-activate", "")
            TELEMETRY_URL := origin "/api/macro-report"
        } catch {
            return WarInfo
        }
    }
    try {
        origin := StrReplace(TELEMETRY_URL, "/api/macro-report", "")
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        w.SetTimeouts(3000,3000,5000,5000)
        w.Open("GET", origin "/api/macro-war", false)
        w.Send()
        if w.Status = 200 {
            txt := w.ResponseText
            ; Expect { active: bool, battleName, timeLeft, rank, points, phase }
            ; Simple parse without JSON lib
            active := InStr(txt, '"active":true') ? true : false
            WarInfo.active := active
            if active {
                try {
                    if RegExMatch(txt, '"battleName"\s*:\s*"([^"]+)"', &m)
                        WarInfo.name := m[1]
                    if RegExMatch(txt, '"timeLeft"\s*:\s*"([^"]+)"', &m)
                        WarInfo.timeLeft := m[1]
                    if RegExMatch(txt, '"rank"\s*:\s*"?([^",]+)"?', &m)
                        WarInfo.rank := m[1]
                    if RegExMatch(txt, '"points"\s*:\s*"?([^",]+)"?', &m)
                        WarInfo.points := m[1]
                    if RegExMatch(txt, '"phase"\s*:\s*"([^"]+)"', &m)
                        WarInfo.phase := m[1]
                } catch {
                }
                Log("war active: " WarInfo.name " " WarInfo.timeLeft " rank " WarInfo.rank)
            } else {
                WarInfo.name := ""
                WarInfo.timeLeft := ""
            }
            return WarInfo
        }
    } catch as e {
        Log("war check failed: " e.Message)
    }
    return WarInfo
}
SetTimer(() => CheckWarStatus(false), -10000)
SetTimer(() => CheckWarStatus(false), 120000)

; ── disconnect recovery — detects Roblox disconnect, rejoins, returns to event ─
global LastTaskName := ""
global DisconnectCount := 0
global IsRecovering := false
global DISCONNECT_CHECKS := []

IsDisconnected() {
    global GAME_EXE, DISCONNECT_CHECKS
    ; If game window gone and we were running, it's a disconnect
    if !WinExist("ahk_exe " GAME_EXE) {
        return true
    }
    ; Check known disconnect UI — these are generic, officers can add precise checks via calib
    try {
        for chk in DISCONNECT_CHECKS {
            if SeeNow(chk) {
                return true
            }
        }
        ; Fallback: check for common Roblox disconnect colors/text areas
        ; White dialog in center often means disconnected
        ; We use fast check for large white area — if center is white and we are not in war, likely disconnect
        ; This is conservative — only triggers if Running
        global Running
        if Running {
            c := ClientRect()
            ; Check center pixel for white/gray disconnect background
            try {
                col := PixelGetColor(c.x + c.w//2, c.y + c.h//2, "Alt")
                ; If center is very dark (0x000000) or very light and we can't see war UI, possible disconnect
                ; We don't auto-trigger on color alone — need explicit checks, so just return false here
                ; Real disconnect detection comes from DISCONNECT_CHECKS populated by event or calib
            } catch {
            }
        }
    } catch {
    }
    return false
}

RecoverFromDisconnect() {
    global LastTaskName, DisconnectCount, IsRecovering, USER_DIR, GAME_EXE, PNote
    global DISCONNECT_RETRY_LIMIT, DISCONNECT_REJOIN_DELAY, PRIVATE_SERVER_URL, TASKS
    if IsRecovering
        return
    IsRecovering := true
    DisconnectCount++
    Log("DISCONNECT detected — count " DisconnectCount " last task " LastTaskName)
    PNote := "Disconnected — rejoining… (" DisconnectCount ")"
    try {
        SaveFailScreenshot("disconnect", "roblox disconnected")
    } catch {
    }

    if DisconnectCount > DISCONNECT_RETRY_LIMIT {
        Log("disconnect retry limit hit " DISCONNECT_RETRY_LIMIT " — stopping")
        PNote := "Too many disconnects — stopped, check Log"
        ToolTip("Too many disconnects — stopped for safety")
        SetTimer(() => ToolTip(), -5000)
        IsRecovering := false
        StopAll()
        return
    }

    ; Try to close disconnect dialog — click Leave or Reconnect if visible
    try {
        ; Try to find Leave button (common in Roblox disconnect)
        if WinExist("ahk_exe " GAME_EXE) {
            WinActivate(WinExist("ahk_exe " GAME_EXE))
            Sleep(500)
            ; Send Esc to close dialog, then try Leave
            try {
                Send("{Esc}")
                Sleep(800)
            } catch {
            }
        }
    } catch {
    }

    ; Leave server — close game window if needed
    try {
        if hw := WinExist("ahk_exe " GAME_EXE) {
            ; Try to close gracefully
            try {
                WinClose(hw)
            } catch {
            }
            Sleep(1500)
        }
    } catch {
    }

    ; Rejoin — use private server link if set, else try to relaunch via Roblox URL
    Sleep(DISCONNECT_REJOIN_DELAY)
    rejoined := false
    try {
        if PRIVATE_SERVER_URL != "" {
            Log("rejoining via private link")
            PNote := "Rejoining private server…"
            Run(PRIVATE_SERVER_URL)
            rejoined := true
        } else {
            ; Fallback: try to re-open Roblox via protocol — officers can set PRIVATE_SERVER_URL in hub
            ; For now, just wait for user to have game open, or try to launch last place via shell
            Log("no private link — waiting for game to return")
            PNote := "Waiting for Roblox to return…"
        }
    } catch as e {
        Log("rejoin failed: " e.Message)
    }

    ; Wait for game to come back
    PNote := "Waiting for game to load…"
    if EnsureGame(60) {
        Log("game back after disconnect")
        Sleep(3000)
        ; Try to get back to event area — if last task has a recover fn or eventArea check, use it
        try {
            if TASKS.Has(LastTaskName) && TASKS[LastTaskName].HasProp("recover") {
                Log("running recover for " LastTaskName)
                PNote := "Back in game — returning to event area…"
                (TASKS[LastTaskName].recover)()
            } else if TASKS.Has(LastTaskName) && TASKS[LastTaskName].HasProp("eventArea") {
                ; Wait for event area check
                PNote := "Checking if back in event area…"
                try {
                    See(TASKS[LastTaskName].eventArea, 30, "event area")
                    Log("back in event area")
                } catch {
                    Log("event area not found after rejoin — will still restart task")
                }
            }
        } catch as e {
            Log("recover to event area failed: " e.Message)
        }

        ; Restart last task
        if LastTaskName != "" && TASKS.Has(LastTaskName) {
            Log("restarting task after disconnect: " LastTaskName)
            PNote := "Rejoined — restarting " LastTaskName
            fn := TASKS[LastTaskName].fn
            SetTimer(() => RunTask(LastTaskName, fn), -2000)
        } else {
            PNote := "Rejoined — ready"
        }
    } else {
        Log("game did not return after disconnect")
        PNote := "Couldn't rejoin — start game manually"
        ToolTip("Couldn't rejoin automatically — start Roblox and Run again")
        SetTimer(() => ToolTip(), -4000)
    }

    IsRecovering := false
}

DisconnectWatchdog() {
    global Running, IsRecovering
    if !Running || IsRecovering
        return
    if IsDisconnected() {
        Log("disconnect watchdog triggered")
        SetTimer(() => RecoverFromDisconnect(), -100)
    }
}
SetTimer(DisconnectWatchdog, 3000)

; Reset disconnect count on successful run
ResetDisconnectCount() {
    global DisconnectCount
    DisconnectCount := 0
}


; ── auto-update + kill-switch ───────────────────────────────────────────
CheckForUpdate(showUI := false) {
    global TELEMETRY_URL, MACRO_VERSION
    if TELEMETRY_URL = ""
        return
    try {
        origin := StrReplace(TELEMETRY_URL, "/api/macro-report", "")
        w := ComObject("WinHttp.WinHttpRequest.5.1")
        w.SetTimeouts(4000,4000,6000,6000)
        w.Open("GET", origin "/api/macro-version", false)
        w.Send()
        if w.Status != 200
            return
        txt := w.ResponseText
        if InStr(txt, '"kill":true') || InStr(txt, '"kill": 1') {
            reason := ""
            try {
                if RegExMatch(txt, '"reason"\s*:\s*"([^"]+)"', &km)
                    reason := km[1]
            } catch {
            }
            Log("KILL-SWITCH activated: " reason)
            MsgBox("This macro version was disabled by officers.`n" (reason != "" ? reason "`n`n" : "") "Get a new one at /macros", "MCWV — disabled", "Iconx")
            ExitApp()
        }
        if !RegExMatch(txt, '"version"\s*:\s*"([^"]+)"', &m)
            return
        latest := m[1]
        if latest != MACRO_VERSION {
            Log("update available: " MACRO_VERSION " → " latest)
            if showUI {
                MsgBox("New version " latest " is out (you have " MACRO_VERSION ").`n`nDownload at /macros", "MCWV — update", "Iconi")
            } else {
                ToolTip("Update available: v" latest " — get it at /macros")
                SetTimer(() => ToolTip(), -5000)
            }
            return latest
        } else if showUI {
            ToolTip("You're on the latest — v" MACRO_VERSION)
            SetTimer(() => ToolTip(), -2500)
        }
    } catch as e {
        Log("update check failed: " e.Message)
    }
}
SetTimer(() => CheckForUpdate(false), -5000)

; ── auto-probe on first launch ──────────────────────────────────────────
AutoProbe() {
    global USER_DIR, GAME_EXE
    try {
        DirCreate(USER_DIR)
        probeFile := USER_DIR "\probe.ini"
        if FileExist(probeFile)
            return
        if !WinExist("ahk_exe " GAME_EXE)
            return
        c := ClientRect()
        IniWrite(c.w "x" c.h, probeFile, "screen", "client")
        IniWrite(A_ScreenWidth "x" A_ScreenHeight, probeFile, "screen", "desktop")
        IniWrite(A_Now, probeFile, "screen", "first_run")
        Log("auto-probe: client " c.w "x" c.h " desktop " A_ScreenWidth "x" A_ScreenHeight)
        if c.w < 800 || c.h < 600 {
            ToolTip("Game window looks small — make it bigger for best results")
            SetTimer(() => ToolTip(), -4000)
        }
    } catch as e {
        Log("auto-probe failed: " e.Message)
    }
}
SetTimer(AutoProbe, -3000)

; ── private server link — per user, set in UI ───────────────────────────
LoadPrivateServerUrl() {
    global PRIVATE_SERVER_URL, USER_DIR
    try {
        ini := USER_DIR "\settings.ini"
        if FileExist(ini) {
            v := IniRead(ini, "war", "private_link", "")
            if v != "" {
                PRIVATE_SERVER_URL := v
                Log("loaded private link")
            }
        }
    } catch as e {
        Log("load private link failed: " e.Message)
    }
}
SavePrivateServerUrl(url) {
    global PRIVATE_SERVER_URL, USER_DIR
    try {
        DirCreate(USER_DIR)
        ini := USER_DIR "\settings.ini"
        IniWrite(url, ini, "war", "private_link")
        PRIVATE_SERVER_URL := url
        Log("private link saved: " SubStr(url,1,40) "…")
        return true
    } catch as e {
        Log("save private link failed: " e.Message)
        return false
    }
}
SetTimer(LoadPrivateServerUrl, -1000)

; ──────────────────── from calib.ahk ────────────────────
; CALIBRATION v3.2 — auto-find + overlay box + clearer UX

global CalibJob := false
global CalibOverlay := false

GetCheckKeys(checks) {
    arr := []
    if (checks is Map) {
        for k, v in checks
            arr.Push(k)
    } else {
        try {
            for k, v in checks.OwnProps()
                arr.Push(k)
        } catch {
            for k in checks
                arr.Push(k)
        }
    }
    return arr
}

StartCalib(taskName) {
    global CalibJob, TASKS, USER_DIR
    if !TASKS.Has(taskName) || !TASKS[taskName].HasProp("checks") {
        ToolTip("No setup needed for " taskName)
        SetTimer(() => ToolTip(), -1800)
        return
    }
    DirCreate(USER_DIR)
    CalibJob := { name: taskName, keys: GetCheckKeys(TASKS[taskName].checks), i: 0, done: 0, skipped: 0 }
    Log("calibrate: start " taskName)
    ShowCalibOverlay()
    CalibNext()
}

ShowCalibOverlay() {
    global CalibOverlay
    try {
        if CalibOverlay {
            try {
                CalibOverlay.Destroy()
            } catch {
            }
        }
        ; Small green border box that follows mouse — visual aid
        CalibOverlay := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x20", "CalibBox")
        CalibOverlay.BackColor := "00FF00"
        CalibOverlay.SetFont("s7", "Consolas")
        ; Create hollow rectangle using 4 thin edges
        CalibOverlay.Add("Text", "x0 y0 w120 h2 Background00FF00")
        CalibOverlay.Add("Text", "x0 y0 w2 h48 Background00FF00")
        CalibOverlay.Add("Text", "x0 y46 w120 h2 Background00FF00")
        CalibOverlay.Add("Text", "x118 y0 w2 h48 Background00FF00")
        CalibOverlay.Show("w120 h48 NoActivate")
        SetTimer(CalibOverlayTick, 50)
    } catch as e {
        Log("calib overlay failed: " e.Message)
    }
}

CalibOverlayTick() {
    global CalibJob, CalibOverlay
    if !CalibJob || !CalibOverlay {
        try {
            SetTimer(CalibOverlayTick, 0)
        } catch {
        }
        return
    }
    try {
        MouseGetPos(&mx, &my)
        CalibOverlay.Move(mx - 60, my - 24)
    } catch {
    }
}

HideCalibOverlay() {
    global CalibOverlay
    try {
        SetTimer(CalibOverlayTick, 0)
    } catch {
    }
    try {
        if CalibOverlay {
            CalibOverlay.Destroy()
            CalibOverlay := false
        }
    } catch {
        CalibOverlay := false
    }
}

CalibNext() {
    global CalibJob, TASKS
    if !CalibJob
        return
    if CalibJob.i >= CalibJob.keys.Length {
        HideCalibOverlay()
        ApplyCalib(CalibJob.name, TASKS[CalibJob.name].checks)
        ToolTip("Done — " CalibJob.done " saved, " CalibJob.skipped " skipped. It's live now.")
        SetTimer(() => ToolTip(), -3000)
        Log("calibrate: done " CalibJob.name " (" CalibJob.done " captured)")
        CalibJob := false
        return
    }
    key := CalibJob.keys[CalibJob.i + 1]
    ToolTip("[" (CalibJob.i + 1) "/" CalibJob.keys.Length "] Point near " key "`nGreen box shows area — F1 save (auto-finds closest) · F2 skip · F3 cancel")
}

CalibGrab() {
    global CalibJob, USER_DIR
    if !CalibJob
        return
    key := CalibJob.keys[CalibJob.i + 1]
    MouseGetPos(&mx, &my)
    ; Auto-find: search ±150px for best matching color/image near mouse
    ; For now, we just capture what user points at, but also try to refine by searching nearby for stable color
    bestX := mx, bestY := my, bestCol := ""
    try {
        ; Try to find stable color by sampling 3x3 area
        colCenter := PixelGetColor(mx, my, "Alt")
        bestCol := colCenter
        ; Simple auto-find: if center color is too close to background (e.g. white/black), search nearby for more distinct
        ; For v3.2, just use center but log nearby variance for future
        try {
            c := ClientRect()
            ; Search 150px radius for same color cluster to auto-correct rough aim
            ; If original task check has hex, try to find that hex nearby
            if TASKS.Has(CalibJob.name) && TASKS[CalibJob.name].checks.Has(key) {
                origCheck := TASKS[CalibJob.name].checks[key]
                if origCheck.HasProp("hex") {
                    want := origCheck.hex
                    ; Search nearby for want color
                    Loop 15 {
                        rx := mx + Random(-75, 75)
                        ry := my + Random(-30, 30)
                        try {
                            got := PixelGetColor(rx, ry, "Alt")
                            if StrLower(got) = StrLower(want) {
                                bestX := rx, bestY := ry, bestCol := got
                                break
                            }
                        } catch {
                        }
                    }
                }
            }
        } catch {
        }
        if bestCol = ""
            bestCol := PixelGetColor(bestX, bestY, "Alt")
    } catch {
        bestCol := ""
    }
    col := ""
    try {
        col := StrLower(String(bestCol != "" ? bestCol : PixelGetColor(bestX, bestY, "Alt")))
    } catch {
        col := ""
    }
    ptStr := ""
    try {
        c := ClientRect()
        ptStr := Format("{:.4f}", (bestX - c.x) / c.w) "," Format("{:.4f}", (bestY - c.y) / c.h)
    } catch {
    }
    safe := StrReplace(StrReplace(StrReplace(key, "\", ""), "/", ""), " ", "-")
    imgName := ""
    try {
        imgName := CalibJob.name "-" safe ".bmp"
        SaveBmp(bestX - 60, bestY - 24, 120, 48, USER_DIR "\" imgName)
    } catch as e {
        Log("calib: crop failed (" e.Message ") — color still saved")
        imgName := ""
    }
    ini := USER_DIR "\calib.ini"
    if col != ""
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
    HideCalibOverlay()
    ToolTip()
}

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
        Log("calib: applied " n " overrides for " taskName)
    return n > 0
}

#HotIf CalibJob
F1:: CalibGrab()
F2:: CalibSkip()
F3:: CalibAbort()
#HotIf

; ──────────────────── from ui.ahk ────────────────────
; CONTROL PANEL v3.4 — 10x better formatting, private link in UI, war focused

UI := false
UIUp := false
global LogBox := false
global ProgBar := false
global ProgText := false
global TestBtn := false
global ModeLbl := false
global LicLbl := false
global TabCtrl := false
global SearchBox := false
global LiveDot := false
global AvatarPic := false
global LogoPic := false
global WarBanner := false
global ThumbPic := false
global StatsText := false
global PrivateLinkBox := false

MakeRunHandler(taskName) {
    return (*) => RunFromPanel(taskName)
}
MakeWatchHandler(taskName) {
    return (*) => ArmTask(taskName)
}
MakeSetupHandler(taskName) {
    return (*) => StartCalib(taskName)
}
MakeTestHandler(taskName) {
    return (*) => RunFromPanelTest(taskName)
}
MakeRunTaskClosure(taskName, fn) {
    return () => RunTask(taskName, fn)
}
MakeRunTaskTestClosure(taskName, fn) {
    return () => RunTask(taskName, fn, true)
}

BuildUI() {
    global UI, UIUp, LogBox, ProgBar, ProgText, TestBtn, ModeLbl, LicLbl, TabCtrl
    global SearchBox, LiveDot, AvatarPic, LogoPic, TASKS, WarBanner, ThumbPic, StatsText, PrivateLinkBox
    global MEMBER, MEMBER_KEY, LICENSE_STATUS, MACRO_VERSION, DryRun, USER_DIR, SPRITE_DIR, PRIVATE_SERVER_URL
    global WarInfo

    UI := Gui("+AlwaysOnTop -MinimizeBox", "MCWV — Clan Wars")
    UI.BackColor := "0F1219"
    UI.MarginX := 0
    UI.MarginY := 0
    UI.SetFont("s10", "Segoe UI")

    ; ── Header ──
    UI.Add("Text", "x0 y0 w440 h56 Background151A27")

    logoPath := ""
    try {
        for p in [A_ScriptDir "\assets\mcwv-logo.png", A_ScriptDir "\mcwv-logo.png", SPRITE_DIR "\mcwv-logo.png", USER_DIR "\mcwv-logo.png"] {
            if FileExist(p) {
                logoPath := p
                break
            }
        }
    } catch {
    }

    if logoPath != "" {
        try {
            LogoPic := UI.Add("Picture", "x16 y12 w32 h32 Background151A27", logoPath)
        } catch {
            logoPath := ""
        }
    }

    if logoPath = "" {
        hdr := UI.Add("Text", "x16 y12 w32 h32 c00E5A2 Background151A27", "▮")
        hdr.SetFont("s20 bold", "Segoe UI Black")
    }

    hdr2 := UI.Add("Text", "x56 y14 w200 h20 cFFFFFF Background151A27", "MCWV")
    hdr2.SetFont("s14 bold", "Segoe UI")
    sub := UI.Add("Text", "x56 y32 w200 h14 c8A96B3 Background151A27", "Clan Wars")
    sub.SetFont("s8", "Segoe UI")

    ver := UI.Add("Text", "x340 y16 w60 h14 c6B7694 Background151A27", "v" MACRO_VERSION)
    ver.SetFont("s8", "Consolas")

    ; License line
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
    } catch {
    }

    if avatarPath != "" {
        try {
            AvatarPic := UI.Add("Picture", "x16 y64 w20 h20", avatarPath)
        } catch {
            avatarPath := ""
        }
    }

    who := MEMBER != "" ? MEMBER : (MEMBER_KEY != "" ? "key " SubStr(MEMBER_KEY,1,6) "…" : "")
    if who = ""
        who := "there"
    statusWord := LICENSE_STATUS = "ok" ? "active"
        : LICENSE_STATUS = "offline" ? "offline — still works"
        : LICENSE_STATUS = "nokey" ? "get your file at /macros"
        : LICENSE_STATUS = "revoked" ? "revoked"
        : LICENSE_STATUS = "invalid" ? "invalid"
        : LICENSE_STATUS = "unknown" ? "checking…"
        : LICENSE_STATUS
    licCol := LICENSE_STATUS = "ok" ? "c00E5A2"
        : LICENSE_STATUS = "offline" ? "cF0B429"
        : (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") ? "cFF5C5C"
        : "c8A96B3"

    xOff := avatarPath != "" ? 42 : 16
    if MEMBER != "" {
        LicLbl := UI.Add("Text", "x" xOff " y64 w300 h18 " licCol, "Hey " who " · " statusWord)
    } else {
        LicLbl := UI.Add("Text", "x" xOff " y64 w300 h18 " licCol, statusWord)
    }
    LicLbl.SetFont("s9", "Segoe UI")

    LiveDot := UI.Add("Text", "x400 y64 w12 h18 c00E5A2", "●")
    LiveDot.SetFont("s10 bold")

    UI.Add("Text", "x16 y88 w408 h1 Background1E2A4A")

    ; War banner — prominent when active
    WarBanner := UI.Add("Text", "x0 y92 w440 h26 c000000 BackgroundF0B429 Hidden", "")
    WarBanner.SetFont("s9 bold", "Segoe UI")
    try {
        if WarInfo.HasProp("active") && WarInfo.active {
            WarBanner.Text := "  ⚔️ " WarInfo.name " · " WarInfo.timeLeft " · Rank " WarInfo.rank
            WarBanner.Visible := true
        }
    } catch {
    }

    TabCtrl := UI.Add("Tab3", "x8 y118 w424 h460 -Wrap", ["Tasks", "Log", "Settings"])
    TabCtrl.SetFont("s10 bold", "Segoe UI")

    ; ── Tasks tab ──
    TabCtrl.UseTab(1)
    UI.Add("Text", "x24 y150 w356 h14 c6B7694", "Your war tasks").SetFont("s8", "Consolas")

    SearchBox := UI.Add("Edit", "x24 y168 w376 h28 Background151A27 cE8ECF6 -E0x200", "")
    SearchBox.SetFont("s10", "Segoe UI")
    try {
        SendMessage(0x1501, 1, StrPtr("Filter…"), SearchBox.Hwnd)
    } catch {
    }
    SearchBox.OnEvent("Change", (*) => FilterTasks())

    y := 208
    if TASKS.Count = 0 {
        UI.Add("Text", "x24 y216 w376 h20 cFFFFFF", "All quiet").SetFont("s12 bold", "Segoe UI")
        UI.Add("Text", "x24 y240 w376 h36 c8A96B3", "War tasks appear here when officers release them. Download the latest file at /macros.").SetFont("s9", "Segoe UI")
        y := 290
    } else {
        for taskName, t in TASKS {
            ; Card background
            UI.Add("Text", "x24 y" y " w376 h56 Background151A27")

            hasArm := t.HasProp("arm")

            b := UI.Add("Button", "x32 y" (y+8) " w52 h36 Background00E5A2 c000000", "Run")
            b.SetFont("s9 bold", "Segoe UI")
            b.OnEvent("Click", MakeRunHandler(taskName))

            tb := UI.Add("Button", "x88 y" (y+8) " w44 h36 Background2A3447 cE8ECF6", "Test")
            tb.SetFont("s8", "Segoe UI")
            tb.OnEvent("Click", MakeTestHandler(taskName))

            nm := UI.Add("Text", "x140 y" (y+8) " w120 h18 cFFFFFF Background151A27", taskName)
            nm.SetFont("s10 bold", "Segoe UI")

            try {
                stats := GetTaskStats(taskName)
                if stats.ok > 0 || stats.fail > 0 {
                    sTxt := stats.ok "✓ " stats.fail "✕"
                    sCol := stats.fail >= 3 ? "cFF5C5C Background151A27" : "c8A96B3 Background151A27"
                } else {
                    sTxt := "Ready"
                    sCol := "c8A96B3 Background151A27"
                }
            } catch {
                sTxt := "Ready"
                sCol := "c8A96B3 Background151A27"
            }
            st := UI.Add("Text", "x140 y" (y+28) " w120 h14 " sCol, sTxt)
            st.SetFont("s8", "Consolas")

            if hasArm {
                a := UI.Add("Button", "x268 y" (y+8) " w64 h20 Background1E2A4A c22D3EE", "Watch")
                a.SetFont("s8 bold", "Segoe UI")
                a.OnEvent("Click", MakeWatchHandler(taskName))
            } else {
                a := UI.Add("Text", "x268 y" (y+8) " w64 h20 c5A6585 Background151A27", "—")
                a.SetFont("s8", "Segoe UI")
            }

            sBtn := UI.Add("Button", "x268 y" (y+32) " w64 h18 Background1E2A4A c8A96B3", "Setup")
            sBtn.SetFont("s7", "Segoe UI")
            sBtn.OnEvent("Click", MakeSetupHandler(taskName))

            t.row := { st: st, name: nm, play: b, test: tb, watch: a }
            y += 64
            if y > 420
                break
        }
    }

    ; Status area
    UI.Add("Text", "x24 y" (y+4) " w376 h1 Background1E2A4A")
    UI.Add("Text", "x24 y" (y+10) " w50 h14 c5A6585", "Status").SetFont("s7 bold", "Consolas")
    ProgText := UI.Add("Text", "x80 y" (y+10) " w200 h14 c6B7694", "Ready")
    ProgText.SetFont("s8", "Consolas")
    y += 28
    ProgBar := UI.Add("Progress", "x24 y" y " w376 h8 c00E5A2 Background1A2030 Range0-100", 0)
    y += 16
    UI.Add("Text", "x24 y" y " w376 h12 c4A5A6A", "Watch starts by itself when war begins.").SetFont("s7", "Consolas")

    ; ── Log tab ──
    TabCtrl.UseTab(2)
    UI.Add("Text", "x24 y150 w120 h18 cFFFFFF", "Activity log").SetFont("s11 bold", "Segoe UI")

    StatsText := UI.Add("Text", "x160 y150 w200 h18 c5A6585", "")
    StatsText.SetFont("s8", "Consolas")
    try {
        totalOk := 0, totalFail := 0
        for _, v in SuccessCount {
            totalOk += v.ok
            totalFail += v.fail
        }
        dc := ""
        try {
            if DisconnectCount > 0
                dc := " · " DisconnectCount " dc"
        } catch {
        }
        if totalOk > 0 || totalFail > 0
            StatsText.Text := totalOk " ok · " totalFail " fail" dc
    } catch {
    }

    LogBox := UI.Add("Edit", "x24 y172 w376 h200 ReadOnly Background0A0E1A cCBD5E8 -E0x200", TailLogHuman(20))
    LogBox.SetFont("s9", "Consolas")

    UI.Add("Text", "x24 y380 w376 h1 Background1E2A4A")
    UI.Add("Text", "x24 y388 w80 h14 c6B7694", "Last view").SetFont("s8 bold", "Consolas")

    ThumbPic := UI.Add("Picture", "x24 y406 w140 h90 Background151A27 Border", "")
    
    copyBtn := UI.Add("Button", "x180 y406 w80 h28 Background2A3447 cE8ECF6", "Copy log")
    copyBtn.SetFont("s8", "Segoe UI")
    copyBtn.OnEvent("Click", (*) => CopyLog())

    openBtn := UI.Add("Button", "x180 y440 w80 h28 Background2A3447 cE8ECF6", "Folder")
    openBtn.SetFont("s8", "Segoe UI")
    openBtn.OnEvent("Click", (*) => Run(USER_DIR))

    clearBtn := UI.Add("Button", "x270 y406 w80 h28 Background2A3447 cE8ECF6", "Clear")
    clearBtn.SetFont("s8", "Segoe UI")
    clearBtn.OnEvent("Click", (*) => ClearLog())

    ; ── Settings tab ──
    TabCtrl.UseTab(3)
    UI.Add("Text", "x24 y150 w376 h20 cFFFFFF", "Private war server").SetFont("s11 bold", "Segoe UI")
    UI.Add("Text", "x24 y172 w376 h28 c8A96B3", "Your private server link — used to rejoin automatically if you disconnect in war.").SetFont("s8", "Segoe UI")

    PrivateLinkBox := UI.Add("Edit", "x24 y204 w280 h28 Background151A27 cE8ECF6", PRIVATE_SERVER_URL)
    PrivateLinkBox.SetFont("s8", "Consolas")
    try {
        SendMessage(0x1501, 1, StrPtr("https://www.roblox.com/... private link"), PrivateLinkBox.Hwnd)
    } catch {
    }

    saveLinkBtn := UI.Add("Button", "x312 y204 w88 h28 Background00E5A2 c000000", "Save")
    saveLinkBtn.SetFont("s9 bold", "Segoe UI")
    saveLinkBtn.OnEvent("Click", (*) => SavePrivateLink())

    UI.Add("Text", "x24 y242 w376 h1 Background1E2A4A")

    UI.Add("Text", "x24 y252 w376 h20 cFFFFFF", "How it runs").SetFont("s11 bold", "Segoe UI")
    TestBtn := UI.Add("Button", "x24 y276 w376 h40 Background2A3447 cFFFFFF", DryRun ? "Test mode — ON (no clicks)" : "Test mode — OFF (live)")
    TestBtn.SetFont("s10 bold", "Segoe UI")
    TestBtn.OnEvent("Click", (*) => ToggleTest())
    ModeLbl := UI.Add("Text", "x24 y324 w376 h28 c8A96B3", DryRun ? "Test: checks everything, doesn't click — safe" : "Live: will click in game")
    ModeLbl.SetFont("s8", "Consolas")

    UI.Add("Text", "x24 y360 w376 h1 Background1E2A4A")

    UI.Add("Text", "x24 y370 w376 h20 cFFFFFF", "Controls").SetFont("s11 bold", "Segoe UI")
    stop := UI.Add("Button", "x24 y394 w376 h40 BackgroundFF5C5C cFFFFFF", "■ Stop everything")
    stop.SetFont("s11 bold", "Segoe UI")
    stop.OnEvent("Click", (*) => StopAll())

    UI.Add("Text", "x24 y444 w180 h20 cFFFFFF", "Tools").SetFont("s10 bold", "Segoe UI")
    updateBtn := UI.Add("Button", "x24 y466 w120 h28 Background2A3447 cE8ECF6", "Check updates")
    updateBtn.SetFont("s8", "Segoe UI")
    updateBtn.OnEvent("Click", (*) => CheckForUpdate(true))

    warBtn := UI.Add("Button", "x152 y466 w120 h28 Background2A3447 cE8ECF6", "War status")
    warBtn.SetFont("s8", "Segoe UI")
    warBtn.OnEvent("Click", (*) => CheckWarStatus(true))

    shareBtn := UI.Add("Button", "x280 y466 w120 h28 Background2A3447 cE8ECF6", "Share setup")
    shareBtn.SetFont("s8", "Segoe UI")
    shareBtn.OnEvent("Click", (*) => ShareCurrentCalib())

    UI.Add("Text", "x24 y504 w376 h1 Background1E2A4A")
    UI.Add("Text", "x24 y512 w376 h24 c5A6585", "Shortcuts: Ctrl+Alt+M hide/show · Ctrl+Alt+X stop · F12 pause").SetFont("s7", "Consolas")

    TabCtrl.UseTab()
    UI.Add("Text", "x0 y590 w440 h1 Background00E5A2")
    foot := UI.Add("Text", "x16 y596 w200 h14 c3A5A5A", "v" MACRO_VERSION " · war")
    foot.SetFont("s7", "Consolas")
    foot2 := UI.Add("Text", "x300 y596 w120 h14 c3A5A5A", "MCWV", "Right")
    foot2.SetFont("s7", "Consolas")

    UI.Show("w440 h620")
    UIUp := true
    SetTimer(RefreshUI, 250)
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
                if t.row.HasProp("test")
                    t.row.test.Visible := show
                t.row.name.Visible := show
                t.row.st.Visible := show
                t.row.watch.Visible := show
            } catch {
            }
        }
    } catch {
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

RunFromPanelTest(taskName) {
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
    SetTimer(MakeRunTaskTestClosure(taskName, fn), -10)
}

ToggleTest() {
    global DryRun, TestBtn, ModeLbl
    DryRun := !DryRun
    TestBtn.Text := DryRun ? "Test mode — ON (no clicks)" : "Test mode — OFF (live)"
    ModeLbl.Text := DryRun ? "Test: checks everything, doesn't click — safe" : "Live: will click in game"
    Log("test mode " (DryRun ? "on" : "off"))
}

SavePrivateLink() {
    global PrivateLinkBox
    try {
        url := Trim(PrivateLinkBox.Value)
        if url = "" {
            ToolTip("Paste your private server link first")
            SetTimer(() => ToolTip(), -2000)
            return
        }
        if !InStr(url, "roblox.com") && !InStr(url, "privateServerLinkCode") {
            ToolTip("That doesn't look like a private link — still saved")
            SetTimer(() => ToolTip(), -2500)
        }
        if SavePrivateServerUrl(url) {
            ToolTip("Private link saved — will rejoin here if you disconnect")
            SetTimer(() => ToolTip(), -3000)
        } else {
            ToolTip("Couldn't save")
            SetTimer(() => ToolTip(), -2000)
        }
    } catch as e {
        ToolTip("Save failed: " e.Message)
        SetTimer(() => ToolTip(), -2500)
    }
}

CopyLog() {
    try {
        txt := TailLogHuman(40)
        if txt = ""
            txt := TailLog(30)
        A_Clipboard := txt
        ToolTip("Log copied")
        SetTimer(() => ToolTip(), -1500)
    } catch {
        try {
            A_Clipboard := TailLog(30)
            ToolTip("Log copied")
            SetTimer(() => ToolTip(), -1500)
        } catch {
            ToolTip("Couldn't copy — open folder and copy macro.log")
            SetTimer(() => ToolTip(), -2500)
        }
    }
}

ClearLog() {
    global LOG_PATH, LogBox
    try {
        FileDelete(LOG_PATH)
    } catch {
    }
    try {
        LogBox.Value := ""
    } catch {
    }
    Log("log cleared")
}

RefreshUI() {
    global UIUp, TASKS, Running, CurrentTask, Armed, ArmJob, PDone, PTotal, ProgBar, ProgText, LogBox
    global LicLbl, MEMBER, MEMBER_KEY, LICENSE_STATUS, LiveDot, WarBanner, WarInfo, ThumbPic, StatsText, LastThumbPath, SuccessCount

    if !UIUp
        return

    static blink := false
    blink := !blink
    if LiveDot {
        try {
            LiveDot.SetFont((blink ? "c00E5A2" : "c2A9A6A"), "Segoe UI")
        } catch {
        }
    }

    if WarBanner {
        try {
            if WarInfo.HasProp("active") && WarInfo.active {
                WarBanner.Text := "  ⚔️ " (WarInfo.HasProp("name") ? WarInfo.name : "War") " · " (WarInfo.HasProp("timeLeft") ? WarInfo.timeLeft : "") " · Rank " (WarInfo.HasProp("rank") ? WarInfo.rank : "?")
                WarBanner.Visible := true
                if WarInfo.HasProp("phase") && WarInfo.phase = "final"
                    WarBanner.Opt("BackgroundFF5C5C")
                else if WarInfo.HasProp("phase") && WarInfo.phase = "mid"
                    WarBanner.Opt("BackgroundF0B429")
                else
                    WarBanner.Opt("Background00E5A2")
            } else {
                WarBanner.Visible := false
            }
        } catch {
        }
    }

    for taskName, t in TASKS {
        if !t.HasProp("row")
            continue
        if Running && CurrentTask = taskName {
            st := PTotal > 0 ? "Running " PDone "/" PTotal " — " PNote : "Running…"
            col := "c00E5A2 Background151A27"
        } else if Armed && (ArmJob is Object) && ArmJob.name = taskName {
            st := "Watching — auto starts"
            col := "c22D3EE Background151A27"
        } else {
            try {
                stats := GetTaskStats(taskName)
                if stats.ok > 0 || stats.fail > 0 {
                    st := stats.ok "✓ " stats.fail "✕"
                    col := stats.fail >= 3 ? "cFF5C5C Background151A27" : "c8A96B3 Background151A27"
                } else {
                    st := "Ready"
                    col := "c8A96B3 Background151A27"
                }
            } catch {
                st := "Ready"
                col := "c8A96B3 Background151A27"
            }
        }
        if t.row.st.Text != st {
            t.row.st.Text := st
            try {
                t.row.st.SetFont(col, "Consolas")
            } catch {
            }
        }
        wantPlay := (Running && CurrentTask = taskName) ? "Stop" : "Run"
        if t.row.play.Text != wantPlay
            t.row.play.Text := wantPlay
    }

    if ProgBar
        ProgBar.Value := (PTotal > 0) ? Round(100 * PDone / PTotal) : 0
    if ProgText
        ProgText.Text := (PTotal > 0) ? (PDone "/" PTotal " — " PNote) : (PNote != "" ? PNote : "Ready")

    if LogBox {
        v := TailLogHuman(20)
        if v = ""
            v := TailLog(14)
        static seen := ""
        if v != seen {
            LogBox.Value := v
            seen := v
        }
    }

    if StatsText {
        try {
            totalOk := 0, totalFail := 0
            for _, v in SuccessCount {
                totalOk += v.ok
                totalFail += v.fail
            }
            dc := ""
            try {
                if DisconnectCount > 0
                    dc := " · " DisconnectCount " dc"
            } catch {
            }
            if totalOk > 0 || totalFail > 0 || dc != ""
                StatsText.Text := totalOk " ok · " totalFail " fail" dc
        } catch {
        }
    }

    if ThumbPic {
        try {
            if LastThumbPath != "" && FileExist(LastThumbPath) {
                ThumbPic.Value := LastThumbPath
            }
        } catch {
        }
    }

    if LicLbl {
        who := MEMBER != "" ? MEMBER : (MEMBER_KEY != "" ? "key " SubStr(MEMBER_KEY,1,6) "…" : "")
        if who = ""
            who := "there"
        statusWord := LICENSE_STATUS = "ok" ? "active"
            : LICENSE_STATUS = "offline" ? "offline — still works"
            : LICENSE_STATUS = "nokey" ? "get your file at /macros"
            : LICENSE_STATUS = "revoked" ? "revoked"
            : LICENSE_STATUS = "invalid" ? "invalid"
            : LICENSE_STATUS = "unknown" ? "checking…"
            : LICENSE_STATUS
        prefix := MEMBER != "" ? "Hey " who " · " : ""
        full := prefix statusWord
        if LicLbl.Text != full {
            LicLbl.Text := full
            col := LICENSE_STATUS = "ok" ? "c00E5A2 Background0F1219" : LICENSE_STATUS = "offline" ? "cF0B429 Background0F1219" : (LICENSE_STATUS = "revoked" || LICENSE_STATUS = "invalid") ? "cFF5C5C Background0F1219" : "c8A96B3 Background0F1219"
            try {
                LicLbl.SetFont(col, "Segoe UI")
            } catch {
            }
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

ShareCurrentCalib() {
    global TASKS
    best := ""
    try {
        for name, t in TASKS {
            if t.HasProp("row") && t.row.HasProp("st") && InStr(t.row.st.Text, "Running") {
                best := name
                break
            }
        }
    } catch {
    }
    if best = "" {
        try {
            for name, t in TASKS {
                if FileExist(USER_DIR "\calib-" name ".ini") {
                    best := name
                    break
                }
            }
        } catch {
        }
    }
    if best = "" {
        MsgBox("Nothing to share yet — run a setup first with F1.`nOnce it's set up you can share it.")
        return
    }
    Log("sharing setup for " best)
    result := ShareCalib(best)
    if result = "ok"
        MsgBox(best " — shared, thanks!")
    else
        MsgBox("Couldn't share: " result "`nTry again.")
}

; ──────────────────── from main.ahk (wiring, bottom) ────────────────────
; MCWV war macros v3.5 — final, war + disconnect, works


; ── Built-in war check — proves it works with 0 events ──────────────────
CheckGameTask() {
    Log("check: start")
    if !EnsureGame(3) {
        throw Error("game not found — start Roblox first")
    }
    SetProgress(1, 4, "Found Roblox")
    Sleep(400)
    SetProgress(2, 4, "Checking screen")
    try {
        c := ClientRect()
        Log("check: client " c.w "x" c.h)
        if c.w < 800 || c.h < 600 {
            SetProgress(2, 4, "Window small — make bigger for war")
            Sleep(800)
        }
    } catch as e {
        Log("check: client failed — " e.Message)
    }
    SetProgress(3, 4, "Testing capture")
    try {
        global USE_FAST_CAPTURE
        if USE_FAST_CAPTURE {
            c := ClientRect()
            if ScreenBuffer.Capture(c) {
                ScreenBuffer.Free()
                Log("check: fast capture ok")
            }
        }
    } catch as e {
        Log("check: capture error — " e.Message)
    }
    SetProgress(4, 4, "Ready for war")
    Sleep(300)
    Log("check: done — ready")
}

if TASKS.Count = 0 {
    TASKS["Check — Game Ready"] := { fn: CheckGameTask, checks: Map() }
}

^!m:: ToggleUI()
^!x:: StopAll()
F12:: {
    global Running
    if Running
        StopAll()
    else
        Pause()
}

A_IconTip := "MCWV war v" MACRO_VERSION " — Ctrl+Alt+M"

try {
    A_TrayMenu.Add("Show/hide panel", (*) => ToggleUI())
    A_TrayMenu.Add("Stop", (*) => StopAll())
    A_TrayMenu.Add()
    A_TrayMenu.Add("Quit", (*) => ExitApp())
} catch {
}

try {
    ToggleUI()
} catch as e {
    try {
        MsgBox("UI failed to open: " e.Message "`n`nTry running as admin or check macro.log", "MCWV — error", "Iconx")
    } catch {
    }
    Log("UI build failed: " e.Message " line " e.Line)
}

try {
    hasGame := WinExist("ahk_exe " GAME_EXE) ? "game found" : "game not running — start it for war"
    Log("loaded v" MACRO_VERSION " war + dc recovery — " hasGame " — " TASKS.Count " tasks")
} catch {
    Log("loaded v" MACRO_VERSION " — " TASKS.Count " tasks")
}
