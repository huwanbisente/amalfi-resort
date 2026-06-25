import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const repoRoot = path.resolve(process.cwd(), '..');
const defaultInputPath = path.join(repoRoot, 'knowledge-base.yaml');
const defaultOutputPath = path.join(repoRoot, 'exports', 'knowledge-base-meta.csv');

function parseArgs(argv) {
  const args = {
    input: defaultInputPath,
    output: defaultOutputPath,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = path.resolve(argv[i + 1] || args.input);
      i += 1;
    } else if (arg === '--output') {
      args.output = path.resolve(argv[i + 1] || args.output);
      i += 1;
    }
  }

  return args;
}

function isPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function toCsvCell(value) {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function toLabel(key) {
  return String(key)
    .replace(/\[(\d+)\]/g, ' $1 ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(word) {
  if (!word) return '';
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function getIdentity(value, fallbackKey, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      itemName: index >= 0 ? `${toLabel(fallbackKey)} ${index + 1}` : toLabel(fallbackKey),
      itemCategory: singularize(toLabel(fallbackKey)),
    };
  }

  const identityKey = ['name', 'marketing_name', 'code', 'condition', 'freebie', 'pax_range', 'duration', 'bank'];
  for (const key of identityKey) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return {
        itemName: value[key].trim(),
        itemCategory: singularize(toLabel(fallbackKey)),
      };
    }
  }

  return {
    itemName: index >= 0 ? `${toLabel(fallbackKey)} ${index + 1}` : toLabel(fallbackKey),
    itemCategory: singularize(toLabel(fallbackKey)),
  };
}

function makeText(section, itemName, fieldPath, value) {
  const parts = [toLabel(section)];
  if (itemName) parts.push(itemName);
  parts.push(`${toLabel(fieldPath)}: ${value}`);
  return parts.join(' | ');
}

function flattenNode(node, context, rows, pathSegments = []) {
  if (isPrimitive(node)) {
    const fieldPath = pathSegments.join('.') || context.section;
    rows.push({
      section: context.section,
      record_name: context.recordName,
      subrecord_name: context.subrecordName,
      field_path: fieldPath,
      value_type: node === null ? 'null' : typeof node,
      value: node == null ? '' : String(node),
      text: makeText(
        context.section,
        [context.recordName, context.subrecordName].filter(Boolean).join(' | '),
        fieldPath,
        node == null ? '' : String(node),
      ),
    });
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      const segmentBase = pathSegments[pathSegments.length - 1] || context.section;
      const segment = `${segmentBase}[${index + 1}]`;
      if (isPrimitive(item)) {
        flattenNode(item, context, rows, [...pathSegments.slice(0, -1), segment]);
        return;
      }

      const identity = getIdentity(item, segmentBase, index);
      flattenNode(item, {
        ...context,
        subrecordName: identity.itemName || context.subrecordName,
      }, rows, [...pathSegments.slice(0, -1), segment]);
    });
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    const nextPath = [...pathSegments, key];
    flattenNode(value, context, rows, nextPath);
  });
}

function buildRows(data) {
  const rows = [];

  Object.entries(data).forEach(([section, value]) => {
    const baseContext = {
      section,
      recordName: '',
      subrecordName: '',
    };

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const identity = getIdentity(item, section, index);
        flattenNode(item, {
          section,
          recordName: identity.itemName,
          subrecordName: '',
        }, rows, [section]);
      });
      return;
    }

    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, childValue]) => {
        const childContext = {
          ...baseContext,
          recordName: toLabel(childKey),
        };
        flattenNode(childValue, childContext, rows, [section, childKey]);
      });
      return;
    }

    flattenNode(value, baseContext, rows, [section]);
  });

  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const yamlText = fs.readFileSync(args.input, 'utf8');
  const data = yaml.load(yamlText);
  const rows = buildRows(data);
  const headers = ['section', 'record_name', 'subrecord_name', 'field_path', 'value_type', 'value', 'text'];
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvCell(row[header])).join(',')),
  ].join('\n');

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, csv, 'utf8');

  console.log(`Exported ${rows.length} knowledge-base rows to ${args.output}`);
}

main();
