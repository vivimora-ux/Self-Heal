import { expect } from '@wdio/globals';

import FormPage from '../pageobjects/form.page.js';

// Expected to FAIL: the submit button is really gone, so healing must refuse
// ("suspected defect, not healed") instead of clicking something else.
describe('Checkout form — real defect', () => {
    it('submits the order (submit button removed)', async () => {
        await FormPage.open('submit-removed');
        await FormPage.setEmail('demo@example.com');
        await FormPage.submit();
        await expect(FormPage.result).toHaveText('Order submitted!');
    });
});
