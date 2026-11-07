// Friendly names for common executables. Anything else is derived from the file name ("my-app.exe" -> "My App").
// Window titles are never read, so a name can never leak what the user is looking at.
const KNOWN = {
  'chrome.exe': 'Google Chrome', 'msedge.exe': 'Microsoft Edge', 'firefox.exe': 'Firefox', 'brave.exe': 'Brave',
  'opera.exe': 'Opera', 'vivaldi.exe': 'Vivaldi', 'code.exe': 'Visual Studio Code', 'devenv.exe': 'Visual Studio',
  'explorer.exe': 'File Explorer', 'notepad.exe': 'Notepad', 'notepad++.exe': 'Notepad++', 'calc.exe': 'Calculator',
  'winword.exe': 'Word', 'excel.exe': 'Excel', 'powerpnt.exe': 'PowerPoint', 'outlook.exe': 'Outlook',
  'onenote.exe': 'OneNote', 'teams.exe': 'Microsoft Teams', 'ms-teams.exe': 'Microsoft Teams',
  'slack.exe': 'Slack', 'discord.exe': 'Discord', 'spotify.exe': 'Spotify', 'vlc.exe': 'VLC media player',
  'cmd.exe': 'Command Prompt', 'powershell.exe': 'Windows PowerShell', 'pwsh.exe': 'PowerShell',
  'windowsterminal.exe': 'Windows Terminal', 'steam.exe': 'Steam', 'zoom.exe': 'Zoom', 'telegram.exe': 'Telegram',
  'whatsapp.exe': 'WhatsApp', 'mspaint.exe': 'Paint', 'taskmgr.exe': 'Task Manager', 'obsidian.exe': 'Obsidian',
};

function friendlyName(exeName) {
  const key = String(exeName || '').toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  const base = key.replace(/\.exe$/, '').replace(/[-_.]+/g, ' ').trim();
  if (!base) return 'Unknown application';
  return base.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

module.exports = { friendlyName };
