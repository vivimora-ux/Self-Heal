import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STORE_PATH = fileURLToPath(new URL('../../locatorStore.json', import.meta.url));

export interface LocatorEntry {
    id: string;
    selector: string;
    fallbacks: string[];
    intent: string;
    last_verified_at: string;
    history: Array<{ at: string; from: string; to: string; tier: number }>;
}

interface LocatorStoreFile {
    version: string;
    locators: Record<string, LocatorEntry>;
}

function readStore(): LocatorStoreFile {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
}

function writeStore(store: LocatorStoreFile) {
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + '\n');
}

export function getLocator(id: string): LocatorEntry {
    const entry = readStore().locators[id];
    if (!entry) throw new Error(`No locator entry for "${id}" in locatorStore.json`);
    return entry;
}

export function touchLocator(id: string) {
    const store = readStore();
    store.locators[id].last_verified_at = new Date().toISOString();
    writeStore(store);
}

export function healLocator(id: string, newSelector: string, tier: number) {
    const store = readStore();
    const entry = store.locators[id];
    entry.history.push({
        at: new Date().toISOString(),
        from: entry.selector,
        to: newSelector,
        tier,
    });
    entry.selector = newSelector;
    entry.last_verified_at = new Date().toISOString();
    writeStore(store);
}
