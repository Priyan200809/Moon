// Windows foreground-window detector. Reads ONLY: which process owns the focused window, its executable file name,
// and the window class (to skip the desktop/taskbar). It never reads window titles, contents, screenshots or input.
// Uses `koffi` (prebuilt N-API FFI, no compiler needed) to call user32/kernel32 directly. Polling is cheap: three
// tiny API calls per tick, and the executable lookup is cached per process id.
const path = require('path');
const { friendlyName } = require('./displayName');

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const IGNORED_CLASSES = new Set([
  'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd',          // desktop and taskbar
  'MultitaskingViewFrame', 'XamlExplorerHostIslandWindow', 'TaskSwitcherWnd', // Alt-Tab / Task View
  'ForegroundStaging',
]);
const CACHE_MS = 60_000;

const unavailable = (reason) => ({ available: false, reason, getForeground() { throw new Error(reason); } });

function createWindowsDetector() {
  if (process.platform !== 'win32') return unavailable('Foreground tracking only works on Windows.');
  let koffi;
  try { koffi = require('koffi'); } catch { return unavailable('The "koffi" package is missing. Run "npm install".'); }

  let fns;
  try {
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    fns = {
      GetForegroundWindow: user32.func('void *GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32_t GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)'),
      GetClassNameW: user32.func('int GetClassNameW(void *hWnd, _Out_ uint16_t *lpClassName, int nMaxCount)'),
      OpenProcess: kernel32.func('void *OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)'),
      CloseHandle: kernel32.func('bool CloseHandle(void *hObject)'),
      QueryFullProcessImageNameW: kernel32.func('bool QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'),
    };
  } catch (err) {
    return unavailable(`Could not load the Windows APIs: ${err.message}`);
  }

  const utf16 = (arr, len) => Buffer.from(arr.buffer, arr.byteOffset, len * 2).toString('utf16le');
  const cache = new Map(); // pid -> { exeName, until }

  function exeNameFor(pid) {
    const hit = cache.get(pid);
    const now = Date.now();
    if (hit && hit.until > now) return hit.exeName;
    let exeName = null; // stays null when Windows refuses (protected or system processes)
    const h = fns.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (h) {
      try {
        const buf = new Uint16Array(1024);
        const size = [buf.length];
        if (fns.QueryFullProcessImageNameW(h, 0, buf, size)) exeName = path.win32.basename(utf16(buf, size[0])).toLowerCase();
      } finally { fns.CloseHandle(h); }
    }
    if (cache.size > 200) cache.clear();
    cache.set(pid, { exeName, until: now + CACHE_MS });
    return exeName;
  }

  return {
    available: true,
    reason: '',
    // -> null (no window), or { pid, exeName, displayName, ignored }. Throws only on an unexpected API failure.
    getForeground() {
      const hwnd = fns.GetForegroundWindow();
      if (!hwnd) return null;
      const pidOut = [0];
      fns.GetWindowThreadProcessId(hwnd, pidOut);
      const pid = pidOut[0];
      if (!pid) return null;

      const cls = new Uint16Array(256);
      const n = fns.GetClassNameW(hwnd, cls, cls.length);
      const ignored = n > 0 && IGNORED_CLASSES.has(utf16(cls, n));

      const exeName = exeNameFor(pid) || 'unknown'; // one shared bucket when the process cannot be inspected
      return { pid, exeName, displayName: exeName === 'unknown' ? 'Unknown application' : friendlyName(exeName), ignored };
    },
  };
}

module.exports = { createWindowsDetector, IGNORED_CLASSES };
