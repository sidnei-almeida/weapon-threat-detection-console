const fs = require('fs');
const path = require('path');

const FALLBACK_CLASS_NAMES = ['class_0', 'class_1', 'class_2'];

const DATA_YAML_PATH = path.resolve(__dirname, '../../dataset/data.yaml');

/**
 * Parse Ultralytics-style class names from dataset/data.yaml.
 * Supports list format and indexed map format under `names:`.
 *
 * @param {string} yamlText
 * @returns {string[] | null}
 */
function parseClassNamesFromYaml(yamlText) {
  const inlineNamesMatch = yamlText.match(/^\s*names\s*:\s*\[(.*)\]\s*$/m);
  if (inlineNamesMatch) {
    const inlineNames = inlineNamesMatch[1]
      .split(',')
      .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    if (inlineNames.length > 0) {
      return inlineNames;
    }
  }

  const lines = yamlText.split(/\r?\n/);
  const namesStart = lines.findIndex((line) => /^names\s*:/.test(line));

  if (namesStart === -1) {
    return null;
  }

  const names = [];
  const indexedNames = new Map();

  for (let i = namesStart + 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^\S/.test(line) && !/^\s/.test(line)) {
      break;
    }

    const listMatch = line.match(/^\s*-\s*(.+?)\s*$/);
    if (listMatch) {
      names.push(listMatch[1].replace(/^['"]|['"]$/g, ''));
      continue;
    }

    const mapMatch = line.match(/^\s*(\d+)\s*:\s*(.+?)\s*$/);
    if (mapMatch) {
      indexedNames.set(Number(mapMatch[1]), mapMatch[2].replace(/^['"]|['"]$/g, ''));
    }
  }

  if (indexedNames.size > 0) {
    const maxIndex = Math.max(...indexedNames.keys());
    const ordered = [];

    for (let index = 0; index <= maxIndex; index += 1) {
      ordered.push(indexedNames.get(index) ?? `class_${index}`);
    }

    return ordered;
  }

  return names.length > 0 ? names : null;
}

/**
 * Load class names from dataset/data.yaml when available.
 * Falls back to placeholder names when the dataset file is missing.
 *
 * @returns {string[]}
 */
function getClassNames() {
  if (!fs.existsSync(DATA_YAML_PATH)) {
    return [...FALLBACK_CLASS_NAMES];
  }

  const yamlText = fs.readFileSync(DATA_YAML_PATH, 'utf8');
  const parsed = parseClassNamesFromYaml(yamlText);

  return parsed && parsed.length > 0 ? parsed : [...FALLBACK_CLASS_NAMES];
}

/**
 * Resolve a class label for a numeric class id.
 *
 * @param {number} classId
 * @returns {string}
 */
function getClassName(classId) {
  const classNames = getClassNames();
  return classNames[classId] ?? `class_${classId}`;
}

module.exports = {
  FALLBACK_CLASS_NAMES,
  DATA_YAML_PATH,
  getClassNames,
  getClassName,
};
