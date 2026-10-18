import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { parse, parseFragment } from 'parse5';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HUGO_VERSION = '0.168.0';
export const AUTHOR = 'Farzad Sunavala';
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertNode() {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node 24 is required; use .node-version.');
}

export async function files(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${name}`);
    if (entry.isDirectory()) result.push(...await files(name));
    else result.push(name);
  }
  return result;
}

export async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function readConfig(root = ROOT) {
  const config = parseDocument(await fs.readFile(path.join(root, 'config', '_default', 'hugo.yaml'), 'utf8'));
  if (config.errors.length) throw new Error(config.errors.map(e => e.message).join('\n'));
  return config.toJS();
}

export function normalizeBase(value) {
  const base = new URL(value);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error(`Invalid base URL: ${value}`);
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  return base;
}

export function londonDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'longOffset'
  }).formatToParts(date).map(part => [part.type, part.value]));
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

export function validateLondonDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+(?:00|01):00$/.test(value)) {
    throw new Error(`${label}: use an explicit Europe/London ISO timestamp (+00:00 winter, +01:00 summer).`);
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.valueOf()) || londonDate(instant) !== value) {
    throw new Error(`${label}: invalid date or mismatched Europe/London offset.`);
  }
  return instant;
}

export function textContent(node) {
  return (node.value ?? '') + (node.childNodes ?? []).map(textContent).join('');
}

export function nodes(document, tag) {
  const result = [];
  function visit(node) {
    if (!tag || node.tagName === tag) result.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(document);
  return result;
}
export const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
export function articleData(node, label) {
  if (attr(node, 'type') !== 'application/ld+json' || node.attrs.some(item => item.name !== 'type')) {
    throw new Error(`${label}: executable or external scripts are not supported.`);
  }
  const data = JSON.parse(textContent(node));
  if (!data || data['@context'] !== 'https://schema.org' || data['@type'] !== 'BlogPosting'
    || data.author?.['@type'] !== 'Person' || data.author.name !== AUTHOR
    || typeof data.headline !== 'string' || !data.headline.trim()
    || typeof data.description !== 'string' || !data.description.trim()
    || typeof data.url !== 'string' || data.mainEntityOfPage?.['@type'] !== 'WebPage'
    || data.mainEntityOfPage['@id'] !== data.url) {
    throw new Error(`${label}: invalid BlogPosting structured data.`);
  }
  const published = validateLondonDate(data.datePublished, `${label} datePublished`);
  const modified = validateLondonDate(data.dateModified, `${label} dateModified`);
  if (modified < published) throw new Error(`${label}: dateModified predates publication.`);
  return data;
}
export const decode = text => textContent(parseFragment(text));
export const xmlValues = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(match => decode(match[1]));
export { parse, parseFragment };

export function rejectPlaceholder(text, label) {
  if (/\b(?:example\.(?:com|org|net)|(?:your|my)[- ]?domain\.(?:com|org|net)|localhost(?=[:/])|placeholder\.(?:com|org|net))\b/i.test(text)) {
    throw new Error(`${label}: placeholder domain is not publishable.`);
  }
}

export function validateMarkdown(text, label) {
  // HTML in fenced/inline code is text, not author-supplied HTML markup.
  const withoutCode = text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, '').replace(/(`+)[\s\S]*?\1/g, '');
  if (/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^>]*|\/?)>|<!--|<!doctype/i.test(withoutCode)) throw new Error(`${label}: raw HTML is not supported; use safe Markdown.`);
  if (/\{\{[<%]/.test(withoutCode)) throw new Error(`${label}: shortcodes are not supported; use safe Markdown.`);
  if (/!\[\s*\]\s*(?:\(|\[)/.test(withoutCode)) throw new Error(`${label}: image alt text is required.`);
  if (/\]\(\s*(?:javascript|data|vbscript):/i.test(withoutCode)) throw new Error(`${label}: unsafe Markdown URL.`);
  rejectPlaceholder(text, label);
}
