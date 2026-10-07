const fs = require('fs');
let code = fs.readFileSync('src/services/aknLoader.ts', 'utf8');
code = code.replace(
  /return text\n\s*\.replace\(\/\\ufffd\/g, ' '\)\n\s*\.replace\(\/\\s\+\/g, ' '\)\n\s*\.replace\(\/\\\[\\\*\\\*\\\*\\\*\\\*\[\\\.,\]\?\\\]\/g, '\[Omitted\]'\)\n\s*\.trim\(\);/,
  `return text\n    .replace(/\\ufffd/g, ' ')\n    .replace(/[\\u00AD\\u200B\\u200C\\u200D\\uFEFF]/g, '')\n    .replace(/\\s+/g, ' ')\n    .replace(/\\[\\*\\*\\*\\*\\*[\\.,]?\\]/g, '[Omitted]')\n    .trim();`
);
fs.writeFileSync('src/services/aknLoader.ts', code);
