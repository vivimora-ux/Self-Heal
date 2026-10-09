// Finds raw $('...') calls in page objects. Used by seedStore.ts (build the store) and qaImpact.ts (PR check).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RawSelector {
    file: string;       // e.g. form.page.ts
    line: number;
    page: string;       // e.g. form
    member: string;     // method/getter the call is in, e.g. result
    id: string;         // e.g. form.result
    selector?: string;  // undefined when the selector isn't a plain string (template literal, variable)
    code: string;       // the source line, for reporting dynamic selectors
}

const MEMBER = /^\s*public\s+(?:async\s+|get\s+)?(\w+)\s*\(/;
const SELECTOR = /(?<!\$)\$\(\s*(['"])(.+?)\1\s*\)/;
const ANY_DOLLAR = /(?<!\$)\$\(/;

/** Treats "..." and '...' the same when comparing selectors. */
export const sameQuotes = (s: string) => s.replace(/"/g, "'");

const elementName = (member: string) =>
    member.replace(/^(set|click|get|fill|tap|press)(?=[A-Z])/, '')
        .replace(/^[A-Z]/, (c) => c.toLowerCase())
        .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export function scanPageObjects(dir: string): RawSelector[] {
    const found: RawSelector[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.page.ts'))) {
        const page = file.split('.')[0];
        let member = '';
        readFileSync(join(dir, file), 'utf-8').split('\n').forEach((text, i) => {
            member = text.match(MEMBER)?.[1] ?? member;
            if (!ANY_DOLLAR.test(text)) return;
            found.push({ file, line: i + 1, page, member, id: `${page}.${elementName(member)}`, selector: text.match(SELECTOR)?.[2], code: text.trim() });
        });
    }
    return found;
}
