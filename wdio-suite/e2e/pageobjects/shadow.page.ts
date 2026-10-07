import { locator } from '../helpers/locator.js';

class ShadowPage {
    public open() {
        return browser.url(new URL('../../../demo-app/shadow.html', import.meta.url).href);
    }

    public async activate() {
        await (await locator('shadow.activate_button')).click();
    }

    public get result() {
        return $('[data-testid="shadow-result"]');
    }
}

export default new ShadowPage();
