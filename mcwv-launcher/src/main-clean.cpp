// MCWV Launcher v1.0.2 CLEAN — NO WMI, NO HWID — Fixes homepage redirect bug
// v1.0.1 bug: opened /login?from=launcher -> login page ignored from= param -> after login went to "/" homepage
// v1.0.2 fix: opens /macros?from=launcher -> middleware redirects to /login?next=/macros?from=launcher -> after login goes to /macros (where download button is)
// Only uses: DPAPI CryptProtectData + WinHTTP + ShellExecute + MessageBoxW
// Saves to %USERPROFILE%\MCWV\mcwv-macros-personal.ahk and runs it
// ASCII only, 0 non-ASCII, no Wbemidl.h, no wbemuuid, no QueryWMI
// Company: MCWV Clan — Product: MCWV Launcher — Version 1.0.2

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <winhttp.h>
#include <shellapi.h>
#include <string>
#include <vector>
#include <fstream>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "user32.lib")

#define VER L"1.0.2"
#define HUB L"https://mcwv-hub.vercel.app"
#define DIR_ENV L"%USERPROFILE%\\MCWV"
#define TOKEN_FILE L"\\launcher_token.dpapi"
#define MACRO_FILE L"\\mcwv-macros-personal.ahk"

std::wstring UserDir() {
    wchar_t b[MAX_PATH]; ExpandEnvironmentStringsW(DIR_ENV, b, MAX_PATH); return b;
}
bool SaveToken(const std::string& t) {
    std::wstring d = UserDir(); CreateDirectoryW(d.c_str(), NULL);
    std::wstring p = d + TOKEN_FILE;
    DATA_BLOB i,o; i.pbData=(BYTE*)t.c_str(); i.cbData=(DWORD)t.size()+1;
    if(!CryptProtectData(&i,L"MCWV",NULL,NULL,NULL,CRYPTPROTECT_UI_FORBIDDEN,&o)) return false;
    std::ofstream f(p,std::ios::binary); if(!f){LocalFree(o.pbData); return false;}
    f.write((char*)o.pbData,o.cbData); LocalFree(o.pbData); return true;
}
std::string LoadToken() {
    std::wstring p = UserDir() + TOKEN_FILE;
    std::ifstream f(p,std::ios::binary|std::ios::ate); if(!f) return "";
    size_t s=(size_t)f.tellg(); f.seekg(0); std::vector<BYTE> b(s); f.read((char*)b.data(),s);
    DATA_BLOB i,o; i.pbData=b.data(); i.cbData=(DWORD)s;
    if(!CryptUnprotectData(&i,NULL,NULL,NULL,NULL,CRYPTPROTECT_UI_FORBIDDEN,&o)) return "";
    std::string r((char*)o.pbData); LocalFree(o.pbData); return r;
}
std::string GetUrl(const std::wstring& url, const std::string& auth="") {
    URL_COMPONENTS uc={}; uc.dwStructSize=sizeof(uc);
    wchar_t h[256], pa[1024]; uc.lpszHostName=h; uc.dwHostNameLength=256; uc.lpszUrlPath=pa; uc.dwUrlPathLength=1024;
    if(!WinHttpCrackUrl(url.c_str(),(DWORD)url.size(),0,&uc)) return "";
    HINTERNET ses=WinHttpOpen(L"MCWV-Launcher/1.0.2",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(!ses) return "";
    HINTERNET con=WinHttpConnect(ses,h,uc.nPort,0); if(!con){WinHttpCloseHandle(ses); return "";}
    HINTERNET req=WinHttpOpenRequest(con,L"GET",pa,NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,uc.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);
    if(!req){WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return "";}
    if(!auth.empty()){ std::wstring wa(auth.begin(),auth.end()); WinHttpAddRequestHeaders(req,wa.c_str(),(DWORD)-1,WINHTTP_ADDREQ_FLAG_ADD); }
    BOOL b=WinHttpSendRequest(req,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,0);
    if(b) b=WinHttpReceiveResponse(req,NULL);
    std::string r; if(b){ DWORD sz=0; do{ sz=0; if(!WinHttpQueryDataAvailable(req,&sz)) break; if(sz==0) break; std::vector<char> buf(sz); DWORD dl=0; if(!WinHttpReadData(req,buf.data(),sz,&dl)) break; r.append(buf.data(),dl);}while(sz>0); }
    WinHttpCloseHandle(req); WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return r;
}
int WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int){
    HANDLE m=CreateMutexW(NULL,TRUE,L"MCWV-Launcher-1.0.2"); if(GetLastError()==ERROR_ALREADY_EXISTS){ MessageBoxW(NULL,L"MCWV Launcher already running",L"MCWV",MB_OK|MB_ICONINFORMATION); return 0; }
    std::string tok=LoadToken();
    if(tok.empty()){
        if(MessageBoxW(NULL,L"Welcome to MCWV Launcher v1.0.2\n\nClick OK to open hub and login\nOpens https://mcwv-hub.vercel.app/macros?from=launcher\n\nAfter login you will land on Macros page where you can download.",L"MCWV Launcher",MB_OKCANCEL|MB_ICONINFORMATION)!=IDOK) return 0;
        ShellExecuteW(NULL,L"open",L"https://mcwv-hub.vercel.app/macros?from=launcher",NULL,NULL,SW_SHOWNORMAL);
        MessageBoxW(NULL,L"Browser opened to Macros page.\n\n1. Login if needed (it will redirect back to /macros)\n2. Click Download Personal Macros\n3. Double-click the downloaded .ahk file to run\n\nIncludes double hatch + hatch wars 12-step pumpkin event.",L"MCWV",MB_OK);
        return 0;
    }
    std::wstring u=L"https://mcwv-hub.vercel.app/api/macro-download";
    std::string d=GetUrl(u,tok.empty()?"":"Authorization: Bearer "+tok);
    if(d.empty()) d=GetUrl(u,"");
    if(d.empty()||d.find("#Requires AutoHotkey")==std::string::npos){
        // Fallback: open macros page directly — user can download via browser (cookie auth works)
        ShellExecuteW(NULL,L"open",L"https://mcwv-hub.vercel.app/macros?from=launcher",NULL,NULL,SW_SHOWNORMAL);
        MessageBoxW(NULL,L"Auto-download failed (needs browser login).\n\nOpened https://mcwv-hub.vercel.app/macros?from=launcher\n\nClick Download Personal Macros there.\nFile saves to Downloads, then double-click to run.",L"MCWV",MB_OK|MB_ICONINFORMATION);
        return 0;
    }
    std::wstring dir=UserDir(); CreateDirectoryW(dir.c_str(),NULL);
    std::wstring mp=dir+MACRO_FILE;
    std::ofstream o(mp,std::ios::binary); o.write(d.c_str(),d.size()); o.close();
    ShellExecuteW(NULL,L"open",mp.c_str(),NULL,NULL,SW_SHOWNORMAL);
    MessageBoxW(NULL,L"Macros downloaded to Documents\\MCWV\\mcwv-macros-personal.ahk\n\nIn game: Ctrl+Alt+M panel, Ctrl+Alt+X stop\nIncludes double hatch + hatch wars 12-step",L"MCWV v1.0.2 Running",MB_OK|MB_ICONINFORMATION);
    if(m) ReleaseMutex(m); return 0;
}
