import { expect } from '@wdio/globals';
import FormPage from '../pageobjects/form.page.js';

describe('Checkout form', () => {
    it('submits with all selectors intact (tier 0)', async () => {
        await FormPage.open();
        await FormPage.setEmail('demo@example.com');
        await FormPage.setPromoCode('SAVE10');
        await FormPage.submit();
        await expect(FormPage.result).toHaveText('Order submitted!');
    });

    it('submits when the submit button drifts structurally (tier 1 fallback)', async () => {
        await FormPage.open('submit-structural');
        await FormPage.setEmail('demo@example.com');
        await FormPage.setPromoCode('SAVE10');
        await FormPage.submit();
        await expect(FormPage.result).toHaveText('Order submitted!');
    });
});
