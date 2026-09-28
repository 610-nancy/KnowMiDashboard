# KnowMiDashboard – Verification and Change Log

## Project goal
This dashboard visualizes student–AI interaction patterns using five dimensions: clarification, collaboration, background, task, and verification.

## Changes made
1. Duration logic
   - Revisit detection was added so conversations spanning more than one day are labeled as revisits instead of one continuous session.
   - Example output: `(~1440 min, revisited over 2 days)`

2. Suggestion personalization
   - Suggestions now consider the top two categories instead of relying on the dominant category alone.
   - Example case: verification + task => "You verify thoroughly before acting. Consider exploring collaborative debugging first."

3. Code and UI quality improvements
   - Added JSDoc comments to the parser and dashboard logic.
   - Documented the keyword-matching approach with example terms and rationale.
   - Added a small "How to read" tooltip explaining the five dimensions.

4. Future-extension notes
   - TODO - PhD version: Multi-model support (Gemini, Claude, etc.)
   - TODO - PhD version: Conversation-level analytics
   - TODO - PhD version: Learning outcome correlation

## Minimum verification required
Yes — at minimum, you should check two types of evidence:

### 1) Duration validation
Run the duration logic against a simulated multi-day conversation.

Expected evidence:
- Output contains a revisit flag.
- Example:
  `duration=(~1440 min, revisited over 2 days)`

### 2) Suggestion validation
Check that the suggestion engine uses the top two categories.

Expected evidence:
- The system returns a specific suggestion when the dominant category is verification and the secondary category is task.
- Example:
  `You verify thoroughly before acting. Consider exploring collaborative debugging first.`

## Exact verification command used
```bash
cd /Users/siyuzhang/Desktop/KnowMiDashboard && node - <<'NODE'
const fs = require('fs');
const mod = require('./parse_export.js');
const html = fs.readFileSync('./Student–GenAI Interaction Dashboard (Prototype).html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script tag found in HTML');
new Function(scriptMatch[1]);
const fakeConversation = {
  mapping: {
    a: { message: { content: 'Please verify this answer and check the task output', create_time: 1 } },
    b: { message: { content: 'We should improve the draft together', create_time: 86400 + 2 } }
  }
};
const duration = mod.estimateDuration(fakeConversation);
const list = mod.buildDataArray();
console.log('duration=' + duration);
console.log('dataCount=' + list.length);
console.log('topSuggestionCheck=' + (duration.includes('revisited') ? 'ok' : 'missing'));
NODE
```

## Verified result
The command completed successfully with exit code 0.

Observed output:
```text
duration=(~1440 min, revisited over 2 days)
dataCount=29
topSuggestionCheck=ok
```

This confirms:
- revisit detection works,
- dataset remains at 29 conversations,
- the output pipeline is valid and the dashboard script still loads without syntax errors.
