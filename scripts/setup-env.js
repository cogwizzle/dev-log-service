#!/usr/bin/env node

/**
 * Bootstraps .env by pulling credentials from the jira-inator and
 * confluence-inator plugin .env files. Safe to re-run — existing values
 * in .env are preserved and only missing keys are filled in.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const JIRA_PLUGIN_ENV = path.join(
  os.homedir(),
  '.claude/plugins/cache/twilio/jira-inator/.env'
);
const CONFLUENCE_PLUGIN_ENV = path.join(
  os.homedir(),
  '.claude/plugins/cache/twilio/confluence-inator/.env'
);
const SERVICE_ENV = path.join(process.cwd(), '.env');
const SERVICE_ENV_EXAMPLE = path.join(process.cwd(), '.env.example');

/**
 * Parses a .env file into a key/value map, skipping comments and blank lines.
 *
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseEnv(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && value) map[key] = value;
  }
  return map;
}

/**
 * Serializes a key/value map back to .env file format.
 *
 * @param {Record<string, string>} map
 * @returns {string}
 */
function serializeEnv(map) {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
}

const jira = parseEnv(JIRA_PLUGIN_ENV);
const confluence = parseEnv(CONFLUENCE_PLUGIN_ENV);

// Start from .env if it exists, otherwise seed from .env.example
const existing = fs.existsSync(SERVICE_ENV)
  ? parseEnv(SERVICE_ENV)
  : parseEnv(SERVICE_ENV_EXAMPLE);

let changed = 0;

/**
 * Sets a key in the env map if it is currently empty, logging whether it was filled.
 *
 * @param {string} key
 * @param {string | undefined} value
 */
function fill(key, value) {
  if (!value) return;
  if (!existing[key]) {
    existing[key] = value;
    changed++;
    console.log(`  set ${key}`);
  } else {
    console.log(`  skip ${key} (already set)`);
  }
}

console.log('Filling credentials from jira-inator...');
fill('JIRA_EMAIL', jira.JIRA_EMAIL);
fill('JIRA_API_TOKEN', jira.JIRA_API_TOKEN);
fill('JIRA_URL', jira.JIRA_URL_TWILIO_ENGINEERING);

console.log('Filling credentials from confluence-inator...');
fill('CONFLUENCE_URL', confluence.CONFLUENCE_URL_TWILIO_PRODUCTIVITY);

fs.writeFileSync(SERVICE_ENV, serializeEnv(existing), 'utf-8');
console.log(`\n.env updated (${changed} key(s) filled).`);
