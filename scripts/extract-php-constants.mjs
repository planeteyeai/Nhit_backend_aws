import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * Extracts user-defined constants + $config arrays from CodeIgniter constants.php
 * using PHP itself (most accurate), then writes JSON to src/config/phpConstants.json.
 *
 * Usage (PowerShell):
 *   node scripts/extract-php-constants.mjs --php "C:\xampp\php\php.exe" --constants "C:\xampp\htdocs\bms\application\config\constants.php"
 *
 * If args are omitted, it tries common XAMPP paths.
 */

function arg(name, fallback) {
  const idx = process.argv.indexOf(name)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const phpExe =
  arg('--php', '') ||
  (fs.existsSync('C:\\xampp\\php\\php.exe') ? 'C:\\xampp\\php\\php.exe' : '') ||
  (fs.existsSync('C:\\xampp\\php\\php') ? 'C:\\xampp\\php\\php' : '')

const constantsPhp =
  arg('--constants', '') ||
  (fs.existsSync('C:\\xampp\\htdocs\\bms\\application\\config\\constants.php')
    ? 'C:\\xampp\\htdocs\\bms\\application\\config\\constants.php'
    : '')

if (!phpExe || !fs.existsSync(phpExe)) {
  console.error('php.exe not found. Pass --php "C:\\xampp\\php\\php.exe"')
  process.exit(1)
}
if (!constantsPhp || !fs.existsSync(constantsPhp)) {
  console.error('constants.php not found. Pass --constants "C:\\xampp\\htdocs\\bms\\application\\config\\constants.php"')
  process.exit(1)
}

const phpCode = String.raw`
// Make CodeIgniter guard happy
if (!defined('BASEPATH')) { define('BASEPATH', __DIR__); }
$config = [];
require $argv[1];

$all = get_defined_constants(true);
$user = isset($all['user']) ? $all['user'] : [];

// Keep only array constants (dropdowns etc.)
$const_arrays = [];
foreach ($user as $k => $v) {
  if (is_array($v)) { $const_arrays[$k] = $v; }
}

// Keep only arrays from $config (many are dropdowns/ratings/maps)
$config_arrays = [];
foreach ($config as $k => $v) {
  if (is_array($v)) { $config_arrays[$k] = $v; }
}

$out = [
  'source' => realpath($argv[1]),
  'generated_at' => date('c'),
  'constants' => $const_arrays,
  'config' => $config_arrays,
];

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
`

let jsonText = ''
try {
  jsonText = execFileSync(phpExe, ['-r', phpCode, constantsPhp], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
} catch (e) {
  console.error('Failed running PHP extractor.')
  console.error(e?.stdout || '')
  console.error(e?.stderr || '')
  process.exit(1)
}

let parsed
try {
  parsed = JSON.parse(jsonText)
} catch {
  console.error('PHP output was not valid JSON. First 500 chars:')
  console.error(String(jsonText || '').slice(0, 500))
  process.exit(1)
}

const outPath = path.resolve('src', 'config', 'phpConstants.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2), 'utf8')

console.log(`Wrote ${outPath}`)
console.log(`constants arrays: ${Object.keys(parsed.constants || {}).length}`)
console.log(`config arrays: ${Object.keys(parsed.config || {}).length}`)

