import { expect } from '@wdio/globals';

import FormPlainPage from '../pageobjects/form.plain.page.js';

describe('Checkout form — plain WebdriverIO, no self-healing', () => {
    it('submits with all selectors intact', async () => {
        await FormPlainPage.open();
        await FormPlainPage.setEmail('demo@example.com');
        await FormPlainPage.setPromoCode('SAVE10');
        await FormPlainPage.submit();
        await expect(FormPlainPage.result).toHaveText('Order submitted!');
    });

    it('fails when the submit button drifts structurally', async () => {
        await FormPlainPage.open('submit-structural');
        await FormPlainPage.setEmail('demo@example.com');
        await FormPlainPage.setPromoCode('SAVE10');
        await FormPlainPage.submit();
        await expect(FormPlainPage.result).toHaveText('Order submitted!');
    });
});
