import { expect } from '@wdio/globals';

import ShadowPage from '../pageobjects/shadow.page.js';

describe('Shadow DOM widget', () => {
    it('activates the button inside the shadow root (tier 3 LLM vision)', async () => {
        await ShadowPage.open();
        await ShadowPage.activate();
        await expect(ShadowPage.result).toHaveText('Shadow widget activated!');
    });
});
