import { expect } from '@wdio/globals';

import FormPage from '../pageobjects/form.page.js';

describe('Checkout form — semantic drift', () => {
    it('fills the renamed promo field (tier 2 LLM text)', async () => {
        await FormPage.open('promo-rename');
        await FormPage.setEmail('demo@example.com');
        await FormPage.setPromoCode('SAVE10');
        await FormPage.submit();
        await expect(FormPage.result).toHaveText('Order submitted!');
    });
});
