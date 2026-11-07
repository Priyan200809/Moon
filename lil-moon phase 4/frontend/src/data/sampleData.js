// Placeholder numbers until real tracking exists. limitMin: null means "use the default daily limit setting".
export const SAMPLE_LABEL = 'Sample data';
export const sampleApps = [
  { name: 'Code editor', usedMin: 96, limitMin: 240 },
  { name: 'Web browser', usedMin: 74, limitMin: 150 },
  { name: 'Video player', usedMin: 48, limitMin: 45 },
  { name: 'Chat app', usedMin: 31, limitMin: null },
  { name: 'Notes', usedMin: 14, limitMin: null },
];
export const sampleSites = [
  { name: 'docs.example.com', usedMin: 58, limitMin: 120 },
  { name: 'video.example.com', usedMin: 52, limitMin: 45 },
  { name: 'news.example.com', usedMin: 26, limitMin: null },
  { name: 'mail.example.com', usedMin: 17, limitMin: null },
];
export const exampleCommands = [
  'Open Notepad',
  'How long have I used my browser today?',
  'Set my daily limit to 4 hours',
  'Hide the moon for 10 minutes',
];
