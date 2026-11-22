const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');

console.log('====================================================');
console.log(' RUNNING GOOGLE PHOTOS TOOL SUITE VERIFICATION');
console.log('====================================================\n');

async function runAllTests() {
    // -----------------------------------------------------------------------------
    // Test 1: File Existence & Bookmarklet Synchronization
    // -----------------------------------------------------------------------------
    console.log('TEST 1: Checking files existence and bookmarklet synchronization...');

    assert(fs.existsSync('delete_photos.js'), 'delete_photos.js must exist');
    assert(fs.existsSync('delete_photos.bookmarklet.js'), 'delete_photos.bookmarklet.js must exist');
    assert(fs.existsSync('bookmarklet.js'), 'bookmarklet.js must exist');
    assert(fs.existsSync('delete_albums.js'), 'delete_albums.js must exist');
    assert(fs.existsSync('README.md'), 'README.md must exist');

    const bm1 = fs.readFileSync('delete_photos.bookmarklet.js', 'utf8').trim();
    const bm2 = fs.readFileSync('bookmarklet.js', 'utf8').trim();

    assert(bm1.startsWith('javascript:'), 'delete_photos.bookmarklet.js must start with javascript:');
    assert(bm2.startsWith('javascript:'), 'bookmarklet.js must start with javascript:');
    assert.strictEqual(bm1, bm2, 'bookmarklet.js and delete_photos.bookmarklet.js must be identical');

    console.log('✓ TEST 1 PASSED: Bookmarklet files exist and are perfectly synchronized.\n');

    // -----------------------------------------------------------------------------
    // Test 2: Code Syntax & Evaluation Check
    // -----------------------------------------------------------------------------
    console.log('TEST 2: Syntax and Evaluation Check...');

    const photoScript = fs.readFileSync('delete_photos.js', 'utf8');
    const albumScript = fs.readFileSync('delete_albums.js', 'utf8');
    const bookmarkletCode = bm1.slice('javascript:'.length);

    assert.doesNotThrow(() => new Function(photoScript), 'delete_photos.js must compile as valid JS Function');
    assert.doesNotThrow(() => new Function(albumScript), 'delete_albums.js must compile as valid JS Function');
    assert.doesNotThrow(() => new Function(bookmarkletCode), 'Bookmarklet code must compile as valid JS Function');

    console.log('✓ TEST 2 PASSED: All scripts pass syntax and function compilation.\n');

    // -----------------------------------------------------------------------------
    // Test 3: Simulated DOM Environment for delete_photos.js
    // -----------------------------------------------------------------------------
    console.log('TEST 3: Simulated DOM Lifecycle Test for delete_photos.js...');

    {
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head><title>Google Photos</title></head>
        <body>
            <header>
                <div data-delete-origin="photos">
                    <button aria-label="Delete" style="display:block; width:20px; height:20px;">Trash Icon</button>
                </div>
            </header>
            <main id="grid">
                <div class="photo-item">
                    <div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div>
                </div>
                <div class="photo-item">
                    <div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div>
                </div>
            </main>
            <div id="modal-container"></div>
        </body>
        </html>
        `;

        const dom = new JSDOM(html, {
            url: 'https://photos.google.com/?hl=en',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        });

        const win = dom.window;
        const doc = win.document;
        win.scrollBy = () => {};
        win.scrollTo = () => {};

        win.Element.prototype.getClientRects = function () {
            return [{ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }];
        };

        let dialogOpened = false;

        const deleteBtn = doc.querySelector('div[data-delete-origin] button');
        deleteBtn.addEventListener('click', () => {
            dialogOpened = true;
            const dialog = doc.createElement('div');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.innerHTML = `
                <div class="dialog-content">
                    <h2>Move to trash?</h2>
                    <button type="button">Cancel</button>
                    <button type="button" data-mdc-dialog-button-default="true">Move to trash</button>
                </div>
            `;
            doc.getElementById('modal-container').appendChild(dialog);

            const confirmBtn = dialog.querySelector('[data-mdc-dialog-button-default]');
            confirmBtn.addEventListener('click', () => {
                dialog.remove();
                doc.querySelectorAll('.photo-item').forEach(p => p.remove());
            });
        });

        win.eval(photoScript);

        assert(win.__googlePhotosDeleteState, 'State object __googlePhotosDeleteState must be exposed on window');
        assert.strictEqual(win.__googlePhotosDeleteState.isRunning, true, 'isRunning must be true on start');
        assert.strictEqual(typeof win.stopGooglePhotosDelete, 'function', 'stopGooglePhotosDelete must be a function');
        assert.strictEqual(doc.body.style.zoom, '0.25', 'autoZoom should set document.body.style.zoom to 0.25');

        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && win.__googlePhotosDeleteState.imageCount === 0) {
            await new Promise(r => setTimeout(r, 200));
        }

        assert(dialogOpened, 'Delete button should have been clicked and dialog opened');
        assert.strictEqual(win.__googlePhotosDeleteState.imageCount, 2, 'imageCount should record 2 deleted photos');

        win.stopGooglePhotosDelete();
        assert.strictEqual(win.__googlePhotosDeleteState.isRunning, false, 'isRunning must be false after stop');

        console.log('✓ TEST 3 PASSED: delete_photos.js successfully selected photos, triggered dialog, confirmed, updated count, and halted.\n');
    }

    // -----------------------------------------------------------------------------
    // Test 4: Multilingual & Multi-Dialog Handling in delete_photos.js
    // -----------------------------------------------------------------------------
    console.log('TEST 4: Multilingual & Multi-Dialog Handling Test...');

    {
        const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head><title>Google Fotos</title></head>
        <body>
            <div role="toolbar">
                <button aria-label="Mover a la papelera" style="display:block; width:20px; height:20px;">Papelera</button>
            </div>
            <main>
                <div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div>
            </main>
            <div id="modal-container"></div>
        </body>
        </html>
        `;

        const dom = new JSDOM(html, {
            url: 'https://photos.google.com/?hl=es',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        });

        const win = dom.window;
        const doc = win.document;
        win.scrollBy = () => {};
        win.scrollTo = () => {};
        win.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];

        let firstDialogOpened = false;
        let secondDialogOpened = false;

        const deleteBtn = doc.querySelector('button[aria-label="Mover a la papelera"]');
        deleteBtn.addEventListener('click', () => {
            firstDialogOpened = true;
            // Dialog 1: Notice
            const noticeDialog = doc.createElement('div');
            noticeDialog.setAttribute('role', 'dialog');
            noticeDialog.setAttribute('aria-modal', 'true');
            noticeDialog.innerHTML = `
                <h2>Información sobre la papelera</h2>
                <button type="button">Cancelar</button>
                <button type="button">Entendido</button>
            `;
            doc.getElementById('modal-container').appendChild(noticeDialog);

            const okBtn = noticeDialog.querySelectorAll('button')[1];
            okBtn.addEventListener('click', () => {
                noticeDialog.remove();
                // Dialog 2: Real confirmation
                secondDialogOpened = true;
                const confirmDialog = doc.createElement('div');
                confirmDialog.setAttribute('role', 'dialog');
                confirmDialog.setAttribute('aria-modal', 'true');
                confirmDialog.innerHTML = `
                    <h2>¿Mover a la papelera?</h2>
                    <button type="button">Cancelar</button>
                    <button type="button">Mover a la papelera</button>
                `;
                doc.getElementById('modal-container').appendChild(confirmDialog);

                const finalBtn = confirmDialog.querySelectorAll('button')[1];
                finalBtn.addEventListener('click', () => {
                    confirmDialog.remove();
                    doc.querySelectorAll('.ckGgle').forEach(el => el.remove());
                });
            });
        });

        win.eval(photoScript);

        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && win.__googlePhotosDeleteState.imageCount === 0) {
            await new Promise(r => setTimeout(r, 200));
        }

        assert(firstDialogOpened, 'First dialog must open');
        assert(secondDialogOpened, 'Second dialog must chain-open');
        assert.strictEqual(win.__googlePhotosDeleteState.imageCount, 1, 'Batch count must be 1 after chained confirmation');

        win.stopGooglePhotosDelete();
        console.log('✓ TEST 4 PASSED: Multilingual button detection and chained multi-dialog confirmation succeeded.\n');
    }

    // -----------------------------------------------------------------------------
    // Test 5: Simulated DOM Environment for delete_albums.js
    // -----------------------------------------------------------------------------
    console.log('TEST 5: Simulated DOM Lifecycle Test for delete_albums.js...');

    {
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head><title>Google Photos Albums</title></head>
        <body>
            <div id="albums">
                <div role="listitem" class="album-item">
                    <a href="./album/AF1QipN123">Vacation</a>
                    <button aria-label="More options" class="menu-btn" style="display:block; width:10px; height:10px;">...</button>
                </div>
            </div>
            <div id="menu-container"></div>
            <div id="dialog-container"></div>
        </body>
        </html>
        `;

        const dom = new JSDOM(html, {
            url: 'https://photos.google.com/albums?hl=en',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        });

        const win = dom.window;
        const doc = win.document;
        win.scrollBy = () => {};
        win.scrollTo = () => {};
        win.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];

        let menuOpened = false;
        let albumDeleted = false;

        const menuBtn = doc.querySelector('.menu-btn');
        menuBtn.addEventListener('click', () => {
            menuOpened = true;
            const menu = doc.createElement('div');
            menu.innerHTML = `
                <div role="menuitem" class="delete-action">Delete album</div>
            `;
            doc.getElementById('menu-container').appendChild(menu);

            const deleteAction = menu.querySelector('.delete-action');
            deleteAction.addEventListener('click', () => {
                menu.remove();
                const dialog = doc.createElement('div');
                dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-modal', 'true');
                dialog.innerHTML = `
                    <h2>Delete album?</h2>
                    <button type="button">Cancel</button>
                    <button type="button" data-mdc-dialog-button-default="true">Delete</button>
                `;
                doc.getElementById('dialog-container').appendChild(dialog);

                const confirmBtn = dialog.querySelector('[data-mdc-dialog-button-default]');
                confirmBtn.addEventListener('click', () => {
                    dialog.remove();
                    doc.querySelector('.album-item').remove();
                    albumDeleted = true;
                });
            });
        });

        win.eval(albumScript);

        assert(win.__googlePhotosAlbumDeleteState, '__googlePhotosAlbumDeleteState must exist');
        assert.strictEqual(typeof win.stopGooglePhotosAlbumDelete, 'function', 'stopGooglePhotosAlbumDelete must be a function');

        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && win.__googlePhotosAlbumDeleteState.albumCount === 0) {
            await new Promise(r => setTimeout(r, 200));
        }

        assert(menuOpened, 'Album options menu must be triggered');
        assert(albumDeleted, 'Album must be deleted after confirmation');
        assert.strictEqual(win.__googlePhotosAlbumDeleteState.albumCount, 1, 'albumCount should be 1');

        win.stopGooglePhotosAlbumDelete();
        console.log('✓ TEST 5 PASSED: delete_albums.js successfully detected album, triggered menu, confirmed deletion, and updated count.\n');
    }

    // -----------------------------------------------------------------------------
    // Test 6: Edge Cases - Empty Grid, Already-Selected Photos, Clean Re-execution
    // -----------------------------------------------------------------------------
    console.log('TEST 6: Edge Cases (Empty library exit & Re-execution cleanup)...');

    {
        // 6A: Empty library
        const emptyDom = new JSDOM(`<!DOCTYPE html><html><body><header></header><main></main></body></html>`, {
            url: 'https://photos.google.com/?hl=en',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        });
        const win = emptyDom.window;
        win.scrollBy = () => {};
        win.scrollTo = () => {};
        win.Element.prototype.getClientRects = () => [];

        // Modify retries count dynamically for fast test
        const fastScript = photoScript.replace('const MAX_CHECKBOX_RETRIES = 10;', 'const MAX_CHECKBOX_RETRIES = 1;');
        win.eval(fastScript);

        await new Promise(r => setTimeout(r, 1500));
        assert.strictEqual(win.__googlePhotosDeleteState.isRunning, false, 'Script should cleanly exit when no photos are found');
        assert.strictEqual(win.__googlePhotosDeleteState.imageCount, 0, 'No photos deleted in empty library');

        // 6B: Re-execution cleanup
        win.eval(fastScript);
        assert(win.__googlePhotosDeleteState, 'State successfully reinitialized on re-execution');
        win.stopGooglePhotosDelete();

        console.log('✓ TEST 6 PASSED: Edge cases (empty library termination, state recreation) handled cleanly.\n');
    }

    console.log('====================================================');
    console.log(' ALL 6 TEST SUITES PASSED COMPLETELY!');
    console.log('====================================================');
}

runAllTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
