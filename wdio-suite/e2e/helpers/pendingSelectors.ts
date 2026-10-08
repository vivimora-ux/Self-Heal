import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PENDING_PATH = fileURLToPath(new URL('../../pendingSelectors.md', import.meta.url));

export interface PendingEntry {
    id: string;
    tier: number;
    oldSelector: string;
    proposed: string;
    confidence: number;
    reasoning: string;
    screenshot?: string; // relative to wdio-suite/reports/
    defect?: boolean; // tier 2 refused to heal: likely a real bug, not drift
}

/** Appends a tier 2/3 proposal for a human to review. Never touches locatorStore.json. */
export function appendPending(entry: PendingEntry) {
    if (!existsSync(PENDING_PATH)) {
        writeFileSync(PENDING_PATH, '# Pending selectors\n\nProposed by LLM tiers — review and update the page object / store by hand.\n');
    }
    appendFileSync(PENDING_PATH, `
## ${entry.defect ? `⚠ ${entry.id} — suspected defect, not healed` : entry.id}

- **Tier:** ${entry.tier}
- **Old selector:** \`${entry.oldSelector}\`
- **Proposed:** \`${entry.proposed}\`
- **Confidence:** ${entry.confidence}
- **Reasoning:** ${entry.reasoning}
- **Timestamp:** ${new Date().toISOString()}
${entry.screenshot ? `- **Screenshot:** ![${entry.id}](reports/${entry.screenshot})\n` : ''}`);
}
