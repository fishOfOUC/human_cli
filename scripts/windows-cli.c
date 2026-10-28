// Native console entry. Reuse the packaged Electron runtime in Node mode;
// never search PATH for node.exe or launch a shell to interpolate arguments.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

#define CAPACITY 32768
static wchar_t command[CAPACITY];
static size_t length = 0;

static void put(wchar_t c) {
  if (length >= CAPACITY - 1) {
    fputs("E_ARGUMENTS: Command line is too long.\n", stderr); exit(2);
  }
  command[length++] = c; command[length] = 0;
}

// Windows CRT quoting, including embedded quotes and trailing backslashes.
static void argument(const wchar_t *value) {
  if (length) put(L' ');
  put(L'"');
  while (*value) {
    size_t slashes = 0;
    while (*value == L'\\') { ++slashes; ++value; }
    if (*value == L'"' || !*value) slashes *= 2;
    while (slashes--) put(L'\\');
    if (!*value) break;
    if (*value == L'"') put(L'\\');
    put(*value++);
  }
  put(L'"');
}

static BOOL WINAPI interrupt(DWORD event) {
  // The Node child also receives Ctrl+C and closes its waiting HTTP connection.
  // Keep the launcher alive long enough to return the child's exit status.
  return event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT;
}

int wmain(int argc, wchar_t **argv) {
  wchar_t executable[CAPACITY], script[CAPACITY];
  DWORD count = GetModuleFileNameW(NULL, executable, CAPACITY);
  if (!count || count >= CAPACITY - 100) { fputs("E_PATH: Cannot locate human_cli.exe.\n", stderr); return 2; }
  wchar_t *separator = wcsrchr(executable, L'\\');
  if (!separator) return 2;
  separator[1] = 0;
  wcscpy(script, executable);
  wcscat(executable, L"human_cli-desktop.exe");
  const BOOL mcp = argc > 1 && wcscmp(argv[1], L"mcp") == 0;
  wcscat(script, mcp ? L"resources\\app\\adapters\\mcp.mjs" : L"resources\\app\\adapters\\cli.mjs");
  if (GetFileAttributesW(executable) == INVALID_FILE_ATTRIBUTES || GetFileAttributesW(script) == INVALID_FILE_ATTRIBUTES) {
    fputs("E_INSTALL: Keep human_cli.exe beside human_cli-desktop.exe and the resources directory.\n", stderr); return 2;
  }
  if (!SetEnvironmentVariableW(L"ELECTRON_RUN_AS_NODE", L"1")) return 2;
  if (!GetEnvironmentVariableW(L"HUMAN_CLI_DESKTOP_EXE", NULL, 0)) SetEnvironmentVariableW(L"HUMAN_CLI_DESKTOP_EXE", executable);
  argument(executable); argument(script);
  for (int i = mcp ? 2 : 1; i < argc; ++i) argument(argv[i]);
  STARTUPINFOW startup = {0}; PROCESS_INFORMATION child = {0};
  startup.cb = sizeof(startup); startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  SetConsoleCtrlHandler(interrupt, TRUE);
  if (!CreateProcessW(executable, command, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &child)) {
    fprintf(stderr, "E_START: Cannot start bundled runtime (Windows error %lu).\n", GetLastError()); return 2;
  }
  CloseHandle(child.hThread);
  WaitForSingleObject(child.hProcess, INFINITE);
  DWORD exitCode = 1; GetExitCodeProcess(child.hProcess, &exitCode); CloseHandle(child.hProcess);
  return (int)exitCode;
}
