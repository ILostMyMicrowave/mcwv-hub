// MCWV Launcher - Simple version - NO WMI/HWID - avoids antivirus false positive
// Safe, single .exe, 1-click, downloads personal macros from mcwv-hub.vercel.app
// This version does NOT do hardware ID - just token + download, so Windows Defender won't flag it as virus

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <winhttp.h>
#include <shellapi.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "shell32.lib")

#define MCWV_VERSION L"1.0.1"
#define MCWV_HUB L"https://mcwv-hub.vercel.app"
#define MCWV_USER_DIR L"%USERPROFILE%\\MCWV"
#define MCWV_TOKEN_FILE L"\\launcher_token.dpapi"
#define MCWV_MACRO_FILE L"\\mcwv-macros-personal.ahk"

std::wstring GetUserDir() {
    wchar_t buf[MAX_PATH];
    ExpandEnvironmentStringsW(MCWV_USER_DIR, buf, MAX_PATH);
    return std::wstring(buf);
}

// DPAPI token storage (secure, not flagged)
bool StoreTokenSecure(const std::string& token) {
    std::wstring dir = GetUserDir();
    CreateDirectoryW(dir.c_str(), NULL);
    std::wstring path = dir + MCWV_TOKEN_FILE;
    DATA_BLOB in, out;
    in.pbData = (BYTE*)token.c_str();
    in.cbData = (DWORD)token.size()+1;
    if (!CryptProtectData(&in, L"MCWV Launcher Token", NULL, NULL, NULL, CRYPTPROTECT_UI_FORBIDDEN, &out)) return false;
    std::ofstream f(path, std::ios::binary);
    if (!f) { LocalFree(out.pbData); return false; }
    f.write((char*)out.pbData, out.cbData);
    LocalFree(out.pbData);
    return true;
}

std::string LoadTokenSecure() {
    std::wstring path = GetUserDir() + MCWV_TOKEN_FILE;
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f) return "";
    size_t size = (size_t)f.tellg();
    f.seekg(0);
    std::vector<BYTE> buf(size);
    f.read((char*)buf.data(), size);
    DATA_BLOB in, out;
    in.pbData = buf.data();
    in.cbData = (DWORD)size;
    if (!CryptUnprotectData(&in, NULL, NULL, NULL, NULL, CRYPTPROTECT_UI_FORBIDDEN, &out)) return "";
    std::string token((char*)out.pbData);
    LocalFree(out.pbData);
    return token;
}

// Simple WinHTTP GET
std::string HttpGet(const std::wstring& url, const std::string& authHeader = "") {
    URL_COMPONENTS uc = {};
    uc.dwStructSize = sizeof(uc);
    wchar_t host[256], path[1024];
    uc.lpszHostName = host; uc.dwHostNameLength = 256;
    uc.lpszUrlPath = path; uc.dwUrlPathLength = 1024;
    if (!WinHttpCrackUrl(url.c_str(), (DWORD)url.size(), 0, &uc)) return "";
    HINTERNET hSession = WinHttpOpen(L"MCWV-Launcher/1.0.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return "";
    HINTERNET hConnect = WinHttpConnect(hSession, host, uc.nPort, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return ""; }
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, uc.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return ""; }
    if (!authHeader.empty()) {
        std::wstring wAuth(authHeader.begin(), authHeader.end());
        WinHttpAddRequestHeaders(hRequest, wAuth.c_str(), (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD);
    }
    BOOL b = WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
    if (b) b = WinHttpReceiveResponse(hRequest, NULL);
    std::string response;
    if (b) {
        DWORD dwSize = 0;
        do {
            dwSize = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &dwSize)) break;
            if (dwSize == 0) break;
            std::vector<char> buf(dwSize);
            DWORD dwDownloaded = 0;
            if (!WinHttpReadData(hRequest, buf.data(), dwSize, &dwDownloaded)) break;
            response.append(buf.data(), dwDownloaded);
        } while (dwSize > 0);
    }
    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return response;
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int nCmdShow) {
    HANDLE hMutex = CreateMutexW(NULL, TRUE, L"MCWV-Launcher-Simple-Mutex");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        MessageBoxW(NULL, L"MCWV Launcher already running - check tray", L"MCWV", MB_OK | MB_ICONINFORMATION);
        return 0;
    }

    std::string token = LoadTokenSecure();
    if (token.empty()) {
        int res = MessageBoxW(NULL, L"Welcome to MCWV Launcher\n\nClick OK to login via browser\n\nThis will open mcwv-hub.vercel.app/login", L"MCWV Launcher v1.0.1", MB_OKCANCEL | MB_ICONINFORMATION);
        if (res != IDOK) return 0;
        ShellExecuteW(NULL, L"open", L"https://mcwv-hub.vercel.app/login?from=launcher", NULL, NULL, SW_SHOWNORMAL);
        MessageBoxW(NULL, L"After login in browser, click OK to continue.\n\nLauncher will download your personal macros.", L"MCWV", MB_OK);
    }

    // No HWID - simple download, avoids antivirus false positive
    std::wstring macroUrl = L"https://mcwv-hub.vercel.app/api/macro-download";
    std::string macroData = HttpGet(macroUrl, token.empty() ? "" : "Authorization: Bearer " + token);
    
    // Fallback: try without auth (will get temp build if DB down, still works)
    if (macroData.empty()) {
        macroData = HttpGet(macroUrl, "");
    }
    
    if (macroData.empty() || macroData.find("#Requires AutoHotkey") == std::string::npos) {
        MessageBoxW(NULL, L"Failed to download macros - check internet or contact officer\n\nTry downloading .ahk directly from https://mcwv-hub.vercel.app/macros", L"MCWV - Error", MB_OK | MB_ICONERROR);
        return 0;
    }

    std::wstring dir = GetUserDir();
    CreateDirectoryW(dir.c_str(), NULL);
    std::wstring macroPath = dir + MCWV_MACRO_FILE;
    std::ofstream outFile(macroPath, std::ios::binary);
    outFile.write(macroData.c_str(), macroData.size());
    outFile.close();

    ShellExecuteW(NULL, L"open", macroPath.c_str(), NULL, NULL, SW_SHOWNORMAL);
    MessageBoxW(NULL, L"Macros downloaded and launched!\n\nFile saved to Documents\\MCWV\\mcwv-macros-personal.ahk\n\nIn game: Ctrl+Alt+M to show panel\nCtrl+Alt+X to stop\n\nIncludes: double hatch + hatch wars", L"MCWV - Running v1.0.1", MB_OK | MB_ICONINFORMATION);

    if (hMutex) ReleaseMutex(hMutex);
    return 0;
}
