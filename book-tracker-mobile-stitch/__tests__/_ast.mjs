// _ast.mjs — shared, NON-test helper (T-22).
//
// Node's built-in test runner (node:test) can load plain ESM .mjs files
// without "type": "module" in package.json. @babel/parser and js-yaml are
// CommonJS, already present in node_modules (used by Metro / other tooling),
// so we reach them with createRequire instead of adding a new dependency.
// This file itself must stay zero-import beyond node: builtins + those two,
// and must never be picked up by "__tests__/*.test.mjs" (it isn't — its name
// doesn't end in .test.mjs).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const parser = require('@babel/parser');
export const yaml = require('js-yaml');

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MOBILE_ROOT = path.resolve(TESTS_DIR, '..');
export const REPO_ROOT = path.resolve(MOBILE_ROOT, '..');

export function readMobile(relPath) {
  return fs.readFileSync(path.join(MOBILE_ROOT, relPath), 'utf8');
}

export function readRepo(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

export function existsInMobile(relPath) {
  return fs.existsSync(path.join(MOBILE_ROOT, relPath));
}

export function existsInRepo(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

// Parses JS/JSX source with the same options every test file needs.
export function parseJS(code) {
  return parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx'],
  });
}

export function parseMobileFile(relPath) {
  return parseJS(readMobile(relPath));
}

export function parseYAML(text) {
  return yaml.load(text);
}

// Generic AST walk: calls visit(node, parent) for every node in the tree.
// Deliberately simple (no scope tracking) — enough for the source-shape
// assertions this sprint's tests need.
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'leadingComments', 'trailingComments', 'innerComments', 'extra']);
export function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit, node);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit, node);
    }
  }
}

export function findAll(ast, predicate) {
  const out = [];
  walk(ast, (node) => { if (predicate(node)) out.push(node); });
  return out;
}

// Recursively lists files under a directory relative to MOBILE_ROOT,
// returning paths also relative to MOBILE_ROOT (so callers can pass them
// straight back into readMobile / parseMobileFile).
export function listMobileFiles(dir, exts = ['.js']) {
  const abs = path.join(MOBILE_ROOT, dir);
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relChild = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMobileFiles(relChild, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      out.push(relChild.split(path.sep).join('/'));
    }
  }
  return out;
}

// String literal / template literal -> a normalized path, with every
// interpolated segment collapsed to "{}" and any query string stripped.
// Returns null when the argument isn't a literal (e.g. a plain Identifier),
// matching the "string or template literal" scope tests.md defines for C01.
export function literalToPath(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value.split('?')[0];
  if (node.type === 'TemplateLiteral') {
    const raw = node.quasis.map((q) => q.value.cooked).join('{}');
    return raw.split('?')[0];
  }
  return null;
}

export function normalizePath(p) {
  return p.replace(/\{[^}]*\}/g, '{}').split('?')[0];
}
