#Requires AutoHotkey v2.0

global ClickInterval := 10 ; Default click speed in ms
global KeyInterval := 325   ; Default key send speed in ms
global isRunning := false
global ChosenKey := "e"     ; Default key

; Variables for the color monitoring logic
global TargetColor := 0xFF0C4E
global MonitorX := 85
global MonitorY := 447
global ColorVariation := 15 ; Allows +/- 15 shades of variation for flexibility
global ColorMatchedTime := 0
global IsRecovering := false

CoordMode("Mouse", "Screen")
CoordMode("Pixel", "Screen")
SendMode("Input")

global myGui, statusText, actionBtn, hkControl, clickTimerEdit, keyTimerEdit

CreateGUI()

CreateGUI() {
    global myGui, statusText, actionBtn, hkControl, clickTimerEdit, keyTimerEdit
    
    myGui := Gui("+AlwaysOnTop -MaximizeBox +ToolWindow", "Double Hatcher")
    myGui.BackColor := "0xf8f9fa"
    myGui.OnEvent("Close", (*) => ExitApp())
    myGui.SetFont("s9", "Segoe UI")

    ; -- Header --
    myGui.Add("Text", "x0 y0 w250 h30 Background2c3e50") 
    title := myGui.Add("Text", "x0 y5 w250 h25 Center cWhite BackgroundTrans", "Double hatcher")
    title.SetFont("s10 Bold")

    statusText := myGui.Add("Text", "x0 y40 w250 h20 Center c7f8c8d", "Status: WAITING")

    myGui.Add("Text", "x25 y70 w90 h20 Right", "Press Key:")
    hkControl := myGui.Add("Hotkey", "x125 y67 w100 vUserKey", "e")

    myGui.Add("Text", "x25 y100 w90 h20 Right", "Click Delay (ms):")
    clickTimerEdit := myGui.Add("Edit", "x125 y97 w80 vClickTimeNumber", String(ClickInterval))
    myGui.Add("UpDown", "Range1-10000", String(ClickInterval))

    myGui.Add("Text", "x25 y130 w90 h20 Right", "Key Delay (ms):")
    keyTimerEdit := myGui.Add("Edit", "x125 y127 w80 vKeyTimeNumber", String(KeyInterval))
    myGui.Add("UpDown", "Range1-10000", String(KeyInterval))

    actionBtn := myGui.Add("Button", "x25 y165 w200 h50 cWhite", "START (F1)")
    actionBtn.SetFont("s12 Bold")
    actionBtn.BackColor := "0x27ae60" 
    actionBtn.OnEvent("Click", ToggleMacro)

    myGui.Show("w250 h230")
}

; ==============================================================================
; LOGIC
; ==============================================================================

ToggleMacro(*) {
    global isRunning, ChosenKey, ClickInterval, KeyInterval, ColorMatchedTime
    
    isRunning := !isRunning 

    if isRunning {
        savedObj := myGui.Submit(false) 
        ChosenKey := savedObj.UserKey   
        ClickInterval := Number(savedObj.ClickTimeNumber) 
        KeyInterval := Number(savedObj.KeyTimeNumber)     

        if (ChosenKey = "") {
            MsgBox("Please enter a key in the box first.")
            isRunning := false
            return
        }

        statusText.Text := "Running..."
        statusText.Opt("c27ae60") 
        
        hkControl.Opt("+Disabled") 
        clickTimerEdit.Opt("+Disabled")
        keyTimerEdit.Opt("+Disabled")
        
        actionBtn.Text := "STOP (F1)"
        actionBtn.BackColor := "0xc0392b" 
        
        ColorMatchedTime := 0 
        
        ; Loops + Monitor Loop (Checks every 5ms to catch short windows)
        SetTimer(ClickLoop, ClickInterval)
        SetTimer(KeyLoop, KeyInterval)
        SetTimer(MonitorLoop, 5) 
        
    } else {
        StopMacro()
    }
}

StopMacro() {
    global isRunning
    isRunning := false
    
    statusText.Text := "Status: STOPPED"
    statusText.Opt("c7f8c8d") 
    
    hkControl.Opt("-Disabled") 
    clickTimerEdit.Opt("-Disabled")
    keyTimerEdit.Opt("-Disabled")
    
    actionBtn.Text := "START (F1)"
    actionBtn.BackColor := "0x27ae60" 
    
    SetTimer(ClickLoop, 0) 
    SetTimer(KeyLoop, 0)
    SetTimer(MonitorLoop, 0)
}

ClickLoop() {
    if (isRunning && !IsRecovering) {
        Click() 
    }
}

KeyLoop() {
    if (isRunning && !IsRecovering) {
        Send("{" . ChosenKey . "}") 
    }
}

MonitorLoop() {
    global ColorMatchedTime, IsRecovering
    
    if (!isRunning || IsRecovering)
        return

    ; Search a very tight 2x2 bounding box area around 85, 447
    ; "Variation" allows it to accept colors similar to 0xFF0C4E
    ColorFound := PixelSearch(&OutputX, &OutputY, MonitorX - 1, MonitorY - 1, MonitorX + 1, MonitorY + 1, TargetColor, ColorVariation)
    
    if (ColorFound) {
        if (ColorMatchedTime == 0) {
            ColorMatchedTime := A_TickCount 
        } else if (A_TickCount - ColorMatchedTime >= 20) { 
            IsRecovering := true
            statusText.Text := "Recovering..."
            statusText.Opt("cE67E22") 
            
            RunRecoverySequence()
        }
    } else {
        ColorMatchedTime := 0 
    }
}

RunRecoverySequence() {
    global IsRecovering, ColorMatchedTime, ChosenKey
    
    ; 1. Wait for 2000ms after detection trigger
    Sleep(2000)
    
    ; 2. Smoothly move to 950, 80 and click 5 times (300ms gap per click)
    MouseMove(950, 80, 15)
    Loop 5 {
        Click()
        Sleep(300)
    }
    
    ; 3. Smooth click at 82,457, wait 2000ms
    Sleep(5000)    
    MouseMove(82, 457, 15)
    Click()
    Sleep(2000)
    
    ; 4. Smooth click at 1080,390 - wait 1000ms
    MouseMove(1080, 390, 15)
    Click()
    Sleep(1000)
    
    ; 5. Smooth click at 1283,264 - wait 1000ms
    MouseMove(1283, 264, 15)
    Click()
    Sleep(1000)
    MouseMove(1284, 265, 15)
    Click()
    Sleep(100)
    
    ; 6. Send Chosen Key (E), then smoothclick at 1180,715
    Send("{" . ChosenKey . "}")
    Sleep(100) 
    MouseMove(1180, 740, 15)
    Click()
    MouseMove(1180, 745, 15)
    Click()

    ; 7. Reset status and continue regular loops
    ColorMatchedTime := 0
    IsRecovering := false
    
    statusText.Text := "Running..."
    statusText.Opt("c27ae60")
}

; ==============================================================================
; HOTKEYS
; ==============================================================================

F1::ToggleMacro()
F9::ExitApp()
