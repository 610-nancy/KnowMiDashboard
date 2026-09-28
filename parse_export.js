const fs = require('fs');
const path = require('path');

// Use only the latest ChatGPT export folder, so newly added files are shown
// while older exports remain excluded until explicitly re-enabled.
const EXPORT_DIR = path.join(__dirname, 'chatgpt-export', 'json');
const HTML_PATH = path.join(__dirname, 'Student–GenAI Interaction Dashboard (Prototype).html');
const DATA_FILE_PATH = path.join(__dirname, 'dashboard_data.js');
const EXCLUDED_TITLES = new Set([
  '导出数据方法',
  '申请科研志愿者写信'
]);

// Easy-to-edit keyword sets for each conversation type.
// Each entry is { term: 'keyword phrase', weight: number }.
// Higher weight means stronger evidence for that type.
// Keyword matching logic is intentionally explicit and transparent: each term is scored
// with a numeric weight, and the total for a conversation is the sum of all weighted hits.
// Example: "what is" and "define" strongly push a conversation toward clarification,
// while "fact check" and "verify" push it toward verification.
// TODO - PhD version: Multi-model support (Gemini, Claude, etc.)
const TYPE_KEYWORDS = {
  clarification: {
    description: 'Questions seeking definitions, explanations, or concept disambiguation.',
    terms: [
      { term: 'what is', weight: 4 },
      { term: 'what are', weight: 4 },
      { term: 'why', weight: 3 },
      { term: 'how does', weight: 3 },
      { term: 'how do', weight: 3 },
      { term: 'explain', weight: 4 },
      { term: 'define', weight: 3 },
      { term: 'definition', weight: 3 },
      { term: 'difference between', weight: 4 },
      { term: 'mean vs', weight: 4 },
      { term: 'concept', weight: 2 },
      { term: 'clarify', weight: 3 },
      { term: 'example', weight: 2 },
      { term: 'understand', weight: 2 },
      { term: 'confused', weight: 2 }
    ]
  },
  collaboration: {
    description: 'Co-creative work such as drafting, brainstorming, and iterative refinement.',
    terms: [
      { term: 'brainstorm', weight: 4 },
      { term: 'brainstorming', weight: 4 },
      { term: 'collaborate', weight: 4 },
      { term: 'co-create', weight: 4 },
      { term: 'co create', weight: 4 },
      { term: 'draft', weight: 3 },
      { term: 'rewrite', weight: 3 },
      { term: 'revise', weight: 3 },
      { term: 'refine', weight: 3 },
      { term: 'improve', weight: 3 },
      { term: 'feedback', weight: 2 },
      { term: 'together', weight: 2 },
      { term: 'let us', weight: 2 },
      { term: 'let’s', weight: 2 },
      { term: 'we can', weight: 2 },
      { term: 'essay', weight: 2 },
      { term: 'thesis', weight: 2 },
      { term: 'proposal', weight: 2 },
      { term: 'outline', weight: 2 }
    ]
  },
  background: {
    description: 'Context-setting conversations about goals, background knowledge, or task framing.',
    terms: [
      { term: 'background', weight: 4 },
      { term: 'context', weight: 4 },
      { term: 'brief', weight: 3 },
      { term: 'project brief', weight: 5 },
      { term: 'research background', weight: 5 },
      { term: 'problem', weight: 3 },
      { term: 'goal', weight: 2 },
      { term: 'objective', weight: 2 },
      { term: 'purpose', weight: 2 },
      { term: 'requirements', weight: 3 },
      { term: 'domain', weight: 2 },
      { term: 'industry', weight: 2 },
      { term: 'summary', weight: 2 },
      { term: 'paper', weight: 2 },
      { term: 'topic', weight: 2 },
      { term: 'motivation', weight: 2 }
    ]
  },
  task: {
    description: 'Direct task execution such as generating reports, prompts, lists, or artifacts.',
    terms: [
      { term: 'generate', weight: 4 },
      { term: 'create', weight: 3 },
      { term: 'write', weight: 3 },
      { term: 'draft', weight: 3 },
      { term: 'produce', weight: 3 },
      { term: 'make', weight: 2 },
      { term: 'prompt', weight: 4 },
      { term: 'template', weight: 3 },
      { term: 'report', weight: 3 },
      { term: 'summary', weight: 2 },
      { term: 'list', weight: 2 },
      { term: 'table', weight: 2 },
      { term: 'code', weight: 3 },
      { term: 'document', weight: 3 },
      { term: 'questions', weight: 2 },
      { term: 'assignment', weight: 3 },
      { term: 'task', weight: 2 },
      { term: 'outline', weight: 2 }
    ]
  },
  verification: {
    description: 'Validation, fact-checking, and correctness checks against sources or requirements.',
    terms: [
      { term: 'verify', weight: 4 },
      { term: 'validation', weight: 4 },
      { term: 'validate', weight: 4 },
      { term: 'check', weight: 3 },
      { term: 'fact check', weight: 5 },
      { term: 'fact-check', weight: 5 },
      { term: 'proof', weight: 4 },
      { term: 'accuracy', weight: 4 },
      { term: 'correct', weight: 3 },
      { term: 'error', weight: 3 },
      { term: 'ensure', weight: 3 },
      { term: 'review', weight: 3 },
      { term: 'compare', weight: 2 },
      { term: 'cross check', weight: 4 },
      { term: 'cross-check', weight: 4 },
      { term: 'source', weight: 2 },
      { term: 'citation', weight: 2 },
      { term: 'turnitin', weight: 2 },
      { term: 'is this correct', weight: 5 },
      { term: 'is this right', weight: 5 }
    ]
  }
};

/**
 * Escapes special characters so keyword matching remains literal instead of regex-meaningful.
 *
 * @param {string} value - Raw keyword string to escape.
 * @returns {string} A regex-safe representation of the keyword.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Flattens nested message content into a readable string so the keyword parser can inspect it.
 *
 * @param {*} value - Structured message or nested object produced by the export.
 * @returns {string} A single string of message text.
 */
function safeText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(safeText).join(' ');
  if (typeof value === 'object') {
    if (Array.isArray(value.parts)) return value.parts.map(safeText).join(' ');
    return Object.values(value).map(safeText).join(' ');
  }
  return String(value);
}

/**
 * Extracts all visible message text from a conversation object to classify the interaction type.
 *
 * @param {object} mapping - Mapping tree from the ChatGPT export JSON.
 * @returns {string} Concatenated message text used in classification.
 */
function extractConversationText(mapping) {
  if (!mapping || typeof mapping !== 'object') return '';

  const texts = [];
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (node.message) {
      const msg = node.message;
      const text = safeText(msg.content);
      if (text && text.trim()) {
        texts.push(text.trim());
      }
    }

    Object.values(node).forEach((child) => {
      if (child && typeof child === 'object') {
        walk(child);
      }
    });
  }

  walk(mapping);
  return texts.join(' ');
}

/**
 * Extracts each message as a standalone string for weighted scoring across the conversation.
 *
 * @param {object} mapping - Mapping tree from the ChatGPT export JSON.
 * @returns {string[]} Individual message texts used for per-message scoring.
 */
function extractMessageTexts(mapping) {
  if (!mapping || typeof mapping !== 'object') return [];

  const messages = [];
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (node.message) {
      const text = safeText(node.message.content);
      if (text && text.trim()) {
        messages.push(text.trim());
      }
    }

    Object.values(node).forEach((child) => {
      if (child && typeof child === 'object') walk(child);
    });
  }

  walk(mapping);
  return messages;
}

/**
 * Converts an export timestamp into an ISO date string for the dashboard.
 *
 * @param {number|string} epochSeconds - UNIX timestamp in seconds or milliseconds.
 * @returns {string|null} ISO date string formatted as YYYY-MM-DD, or null if invalid.
 */
function createDateString(epochSeconds) {
  const numericMs = Number(epochSeconds);
  if (!Number.isFinite(numericMs)) return null;

  const timestamp = numericMs > 1e12 ? numericMs : numericMs * 1000;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Normalizes model names to the dashboard's simplified labels.
 *
 * @param {string} slug - Raw model name from the export metadata.
 * @returns {string} A normalized label such as ChatGPT or Claude.
 */
function normalizeModelSlug(slug) {
  if (!slug) return 'ChatGPT';
  const value = String(slug).toLowerCase();
  if (value.includes('claude')) return 'Claude';
  if (value.includes('gemini')) return 'Gemini';
  if (value.includes('deepseek')) return 'DeepSeek';
  if (value.includes('llama')) return 'Llama';
  if (value.includes('gpt') || value.includes('chatgpt')) return 'ChatGPT';
  return 'ChatGPT';
}

/**
 * Infers the model label by scanning metadata across the conversation mapping.
 *
 * @param {object} conversation - Exported conversation JSON.
 * @returns {string} Best-effort model label.
 */
function inferModelFromConversation(conversation) {
  const detected = new Set();

  const mapping = conversation && conversation.mapping;
  if (mapping && typeof mapping === 'object') {
    const seen = new Set();
    function walk(node) {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);

      const msg = node.message;
      if (msg && msg.metadata) {
        const modelFromMetadata = msg.metadata.model_slug || msg.metadata.resolved_model_slug || msg.metadata.default_model_slug;
        if (modelFromMetadata) detected.add(normalizeModelSlug(modelFromMetadata));
      }

      Object.values(node).forEach((child) => {
        if (child && typeof child === 'object') walk(child);
      });
    }
    walk(mapping);
  }

  if (detected.size) {
    return Array.from(detected).sort()[0];
  }

  const fallback = conversation && (conversation.default_model_slug || conversation.model_slug);
  return normalizeModelSlug(fallback);
}

/**
 * Formats duration in a more transparent way, flagging conversations that were revisited across days.
 *
 * @param {number} diffSeconds - Time span between the first and last message in seconds.
 * @param {number} revisitDays - Number of calendar days spanned by the conversation.
 * @returns {string} A human-readable duration label.
 */
function formatDurationLabel(diffSeconds, revisitDays) {
  const minutes = Math.max(1, Math.round(diffSeconds / 60));
  if (revisitDays > 1) {
    return `(~${minutes} min, revisited over ${revisitDays} days)`;
  }
  return `${minutes} min`;
}

/**
 * Estimates conversation duration while detecting multi-day revisits, which should not be counted as one continuous session.
 *
 * @param {object} conversation - Exported conversation JSON.
 * @returns {string} Duration label with a revisit flag when appropriate.
 */
function estimateDuration(conversation) {
  const timestamps = [];

  const mapping = conversation && conversation.mapping;
  if (mapping && typeof mapping === 'object') {
    const seen = new Set();
    function walk(node) {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);

      const msg = node.message;
      if (msg && Number.isFinite(Number(msg.create_time))) {
        timestamps.push(Number(msg.create_time));
      }

      Object.values(node).forEach((child) => {
        if (child && typeof child === 'object') walk(child);
      });
    }
    walk(mapping);
  }

  if (timestamps.length >= 2) {
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const diffSeconds = Math.max(0, maxTime - minTime);
    const revisitDays = diffSeconds > 86400 ? Math.max(1, Math.ceil(diffSeconds / 86400)) : 0;
    return formatDurationLabel(diffSeconds, revisitDays);
  }

  const messageCount = conversation && conversation.mapping ? Object.keys(conversation.mapping).length : 0;
  const fallbackMinutes = Math.max(1, Math.ceil(messageCount / 2));
  return `${fallbackMinutes} min`;
}

/**
 * Scores one conversation type using explicit keyword matching, with each matched keyword contributing its weight.
 *
 * @param {string} text - Message text to score.
 * @param {string} typeKey - Dimension key such as clarification or verification.
 * @returns {number} Weighted score for that dimension.
 */
function scoreConversationType(text, typeKey) {
  const cleanText = text.toLowerCase();
  const rules = TYPE_KEYWORDS[typeKey].terms;
  return rules.reduce((total, entry) => {
    const term = entry.term.toLowerCase();
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    const matches = cleanText.match(pattern);
    const count = matches ? matches.length : 0;
    return total + count * entry.weight;
  }, 0);
}

/**
 * Aggregates weighted scores for all message-level patterns across a conversation.
 *
 * @param {object} mapping - Mapping tree from the ChatGPT export JSON.
 * @returns {{totals: Object, dominantType: string}} Score totals and the strongest dimension.
 */
function summarizeMessageScores(mapping) {
  const totals = {};
  Object.keys(TYPE_KEYWORDS).forEach((typeKey) => {
    totals[typeKey] = 0;
  });

  const messageTexts = extractMessageTexts(mapping);
  if (!messageTexts.length) {
    return { totals, dominantType: 'background' };
  }

  messageTexts.forEach((messageText) => {
    Object.keys(TYPE_KEYWORDS).forEach((typeKey) => {
      totals[typeKey] += scoreConversationType(messageText, typeKey);
    });
  });

  const dominantType = Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
  return { totals, dominantType };
}

/**
 * Chooses the dominant dimension for a conversation based on the largest weighted score.
 *
 * @param {string} text - Full conversation text to classify.
 * @returns {string} Dominant dimension label.
 */
function classifyConversation(text) {
  const scores = {};
  Object.keys(TYPE_KEYWORDS).forEach((typeKey) => {
    scores[typeKey] = scoreConversationType(text, typeKey);
  });

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return 'background';
  return sorted[0][0];
}

/**
 * Converts weighted totals into percentages for visualization without changing the underlying score structure.
 *
 * @param {object} totals - Raw weighted totals for each dimension.
 * @returns {object} Percentage distribution across the five dimensions.
 */
function normalizeScoresToPercentages(totals) {
  const keys = Object.keys(TYPE_KEYWORDS);
  const total = keys.reduce((sum, key) => sum + Math.max(0, totals[key] || 0), 0);

  const out = {};
  if (total === 0) {
    keys.forEach((key) => {
      out[key] = key === 'background' ? 100 : 0;
    });
    return out;
  }

  keys.forEach((key) => {
    out[key] = Number(((Math.max(0, totals[key] || 0) / total) * 100).toFixed(1));
  });

  return out;
}

/**
 * Parses a single exported JSON conversation into the dashboard row format.
 *
 * @param {string} filePath - Absolute path to the ChatGPT export JSON file.
 * @returns {object} Dashboard-ready record containing model, date, duration, type, title, and scores.
 */
function parseExportFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse JSON in ${filePath}: ${error.message}`);
  }

  const title = data.title || path.basename(filePath, '.json');
  const date = createDateString(data.create_time) || 'N/A';
  const text = extractConversationText(data.mapping || {});
  const summary = summarizeMessageScores(data.mapping || {});
  const type = classifyConversation(text) || summary.dominantType;
  const model = inferModelFromConversation(data);
  const duration = estimateDuration(data);
  const scores = normalizeScoresToPercentages(summary.totals);

  return {
    model,
    date,
    duration,
    type,
    title,
    scores
  };
}

/**
 * Lists eligible export files while excluding explicitly filtered out titles.
 *
 * @returns {string[]} Absolute paths to valid JSON exports.
 */
function collectExportFiles() {
  if (!fs.existsSync(EXPORT_DIR)) {
    return [];
  }

  return fs.readdirSync(EXPORT_DIR)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => path.join(EXPORT_DIR, file))
    .filter((filePath) => {
      const raw = fs.readFileSync(filePath, 'utf8');
      try {
        const data = JSON.parse(raw);
        const title = data && data.title ? data.title : path.basename(filePath, '.json');
        return !EXCLUDED_TITLES.has(title);
      } catch (error) {
        return true;
      }
    })
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Builds the dataset used by the dashboard by parsing all valid export files.
 *
 * @returns {object[]} Ordered conversation records for rendering.
 */
function buildDataArray() {
  const files = collectExportFiles();

  const rows = files.map((filePath) => parseExportFile(filePath));
  rows.sort((a, b) => {
    const aDate = new Date(`${a.date}T00:00:00Z`).getTime();
    const bDate = new Date(`${b.date}T00:00:00Z`).getTime();
    return bDate - aDate;
  });

  return rows.map((row) => ({
    model: row.model,
    date: row.date,
    duration: row.duration,
    type: row.type,
    title: row.title,
    scores: row.scores
  }));
}

/**
 * Writes the parsed dataset to the dashboard data file used by the browser.
 *
 * @param {object[]} data - Dashboard-ready rows.
 * @returns {string} Output file path.
 */
function writeDataFile(data) {
  const js = `window.DASHBOARD_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(DATA_FILE_PATH, js, 'utf8');
  return DATA_FILE_PATH;
}

/**
 * Injects the current data payload into the HTML fallback block without altering the visualization structure.
 *
 * @param {object[]} data - Dashboard-ready rows.
 * @returns {string} Updated HTML content.
 */
function writeHtmlData(data) {
  const source = fs.readFileSync(HTML_PATH, 'utf8');
  const serialised = JSON.stringify(data, null, 2);

  const pattern = /const DATA = window\.DASHBOARD_DATA \|\| \[[\s\S]*?\];/m;
  const replacement = `const DATA = window.DASHBOARD_DATA || ${serialised};`;

  if (!pattern.test(source)) {
    throw new Error('Could not find the DATA fallback block in the dashboard HTML.');
  }

  const updated = source.replace(pattern, replacement);
  fs.writeFileSync(HTML_PATH, updated, 'utf8');
  return updated;
}

/**
 * Runs the export parser and emits the dashboard data payload.
 */
function main() {
  const args = process.argv.slice(2);
  const data = buildDataArray();

  writeDataFile(data);

  if (args.includes('--write-html')) {
    writeHtmlData(data);
    console.log(`Updated dashboard data in ${path.basename(HTML_PATH)} with ${data.length} conversations.`);
    return;
  }

  const output = `window.DASHBOARD_DATA = ${JSON.stringify(data, null, 2)};\n`;
  process.stdout.write(output);
}

if (require.main === module) {
  main();
}

module.exports = {
  TYPE_KEYWORDS,
  buildDataArray,
  parseExportFile,
  classifyConversation,
  estimateDuration
};
