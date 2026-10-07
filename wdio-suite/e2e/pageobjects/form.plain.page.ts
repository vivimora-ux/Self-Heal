class FormPlainPage {
    public open(drift?: string) {
        const url = new URL('../../../demo-app/form.html', import.meta.url);
        if (drift) url.searchParams.set('drift', drift);
        return browser.url(url.href);
    }

    public async setEmail(value: string) {
        await $('[data-testid="email-input"]').setValue(value);
    }

    public async setPromoCode(value: string) {
        await $('[data-testid="promo-code-input"]').setValue(value);
    }

    public async submit() {
        await $('[data-testid="submit-order-btn"]').click();
    }

    public get result() {
        return $('[data-testid="form-result"]');
    }
}

export default new FormPlainPage();
