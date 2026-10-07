import { locator } from '../helpers/locator.js';

class CanvasPage {
    public open() {
        return browser.url(new URL('../../../demo-app/canvas.html', import.meta.url).href);
    }

    public async play() {
        await (await locator('canvas.play_button')).click();
    }

    public get result() {
        return $('[data-testid="canvas-result"]');
    }
}

export default new CanvasPage();
