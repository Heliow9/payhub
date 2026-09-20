const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const explore = path.join(root, 'src', 'app', 'explore.tsx');
const safeExplore = `import { Redirect } from 'expo-router';\n\n/**\n * Compatibility route kept only to neutralize the default Expo starter route\n * in repositories updated by overlay. The PayHub app does not use /explore.\n */\nexport default function LegacyExploreRoute() {\n  return <Redirect href="/" />;\n}\n`;

if (fs.existsSync(explore)) {
  const current = fs.readFileSync(explore, 'utf8');
  const looksLikeExpoStarter =
    current.includes("from 'expo-image'") ||
    current.includes('from "expo-image"') ||
    current.includes("from 'expo-symbols'") ||
    current.includes('from "expo-symbols"') ||
    current.includes('This starter app includes example');

  if (looksLikeExpoStarter) {
    fs.writeFileSync(explore, safeExplore, 'utf8');
    console.log('[PayHub preflight] Old Expo starter explore.tsx replaced with compatibility redirect.');
  }
}

const required = [
  'src/app/_layout.tsx',
  'src/app/index.tsx',
  'src/app/login.tsx',
  'src/app/(employee)/index.tsx',
  'src/app/(employee)/payroll/[id].tsx',
  'src/app/(employee)/sign/[id].tsx',
  'src/app/(employee)/profile.tsx',
  'src/auth/AuthProvider.tsx',
  'src/lib/api.ts',
  'app.json',
  'eas.json',
  'package.json',
];

const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  console.error('[PayHub preflight] Required files are missing:');
  for (const rel of missing) console.error(` - ${rel}`);
  process.exit(1);
}

const routeRoot = path.join(root, 'src', 'app');
const forbiddenImports = ['expo-image', 'expo-symbols', '@expo/ui', 'expo-glass-effect'];
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const src = fs.readFileSync(full, 'utf8');
      for (const mod of forbiddenImports) {
        if (src.includes(`'${mod}'`) || src.includes(`"${mod}"`)) {
          offenders.push(`${path.relative(root, full)} -> ${mod}`);
        }
      }
    }
  }
}

walk(routeRoot);
if (offenders.length) {
  console.error('[PayHub preflight] Legacy Expo starter imports are still present in routes:');
  for (const item of offenders) console.error(` - ${item}`);
  process.exit(1);
}

console.log('[PayHub preflight] Mobile project structure OK.');
