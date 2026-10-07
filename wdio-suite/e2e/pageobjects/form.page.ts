import { locator } from '../helpers/locator.js';

class FormPage {
    public open(drift?: string) {
        const url = new URL('../../../demo-app/form.html', import.meta.url);
        if (drift) url.searchParams.set('drift', drift);
        return browser.url(url.href);
    }

    public async setEmail(value: string) {
        await (await locator('form.email_input')).setValue(value);
    }

    public async setPromoCode(value: string) {
        await (await locator('form.promo_code_input')).setValue(value);
    }

    public async submit() {
        await (await locator('form.submit_button')).click();
    }

    public get result() {
        return $('[data-testid="form-result"]');
    }
}

export default new FormPage();
