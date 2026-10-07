import { expect } from '@wdio/globals';

import CanvasPage from '../pageobjects/canvas.page.js';

describe('Canvas player', () => {
    it('clicks the play button drawn on the canvas (tier 3 LLM vision)', async () => {
        await CanvasPage.open();
        await CanvasPage.play();
        await expect(CanvasPage.result).toHaveText('Now playing!');
    });
});
