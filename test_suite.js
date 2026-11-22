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
    assert(fs.existsSync('restore_photos.js'), 'restore_photos.js must exist');
    assert(fs.existsSync('README.md'), 'README.md must exist');

    const bm1 = fs.readFileSync('delete_photos.bookmarklet.js', 'utf8').trim();
    const bm2 = fs.readFileSync('bookmarklet.js', 'utf8').trim();

    assert(bm1.startsWith('javascript:(function(){'), 'delete_photos.bookmarklet.js must start with javascript:(function(){');
    assert(bm2.startsWith('javascript:(function(){'), 'bookmarklet.js must start with javascript:(function(){');
    assert(!bm1.startsWith('javascript:!function'), 'Bookmarklet must NOT start with javascript:!function to prevent returning true');
    assert.strictEqual(bm1, bm2, 'bookmarklet.js and delete_photos.bookmarklet.js must be identical');

    console.log('✓ TEST 1 PASSED: Bookmarklet files exist and are perfectly synchronized.\n');

    // -----------------------------------------------------------------------------
    // Test 2: Code Syntax & Evaluation Check
    // -----------------------------------------------------------------------------
    console.log('TEST 2: Syntax and Evaluation Check...');

    const photoScript = fs.readFileSync('delete_photos.js', 'utf8');
    const albumScript = fs.readFileSync('delete_albums.js', 'utf8');
    const restoreScript = fs.readFileSync('restore_photos.js', 'utf8');
    const bookmarkletCode = bm1.slice('javascript:'.length);

    assert.doesNotThrow(() => new Function(photoScript), 'delete_photos.js must compile as valid JS Function');
    assert.doesNotThrow(() => new Function(albumScript), 'delete_albums.js must compile as valid JS Function');
    assert.doesNotThrow(() => new Function(restoreScript), 'restore_photos.js must compile as valid JS Function');
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
            <div id="dialog-wrapper"></div>
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

        const deleteBtn = doc.querySelector('div[role="toolbar"] button');
        deleteBtn.addEventListener('click', () => {
            firstDialogOpened = true;
            const noticeDialog = doc.createElement('div');
            noticeDialog.setAttribute('role', 'alertdialog');
            noticeDialog.setAttribute('aria-modal', 'true');
            noticeDialog.innerHTML = `
                <div class="notice-body">
                    <p>Las fotos se moverán a la papelera durante 60 días.</p>
                    <button type="button">Cancelar</button>
                    <button type="button" class="confirm-notice">Entendido</button>
                </div>
            `;
            doc.getElementById('dialog-wrapper').appendChild(noticeDialog);

            const noticeBtn = noticeDialog.querySelector('.confirm-notice');
            noticeBtn.addEventListener('click', () => {
                noticeDialog.remove();
                secondDialogOpened = true;

                const confirmDialog = doc.createElement('div');
                confirmDialog.setAttribute('role', 'dialog');
                confirmDialog.setAttribute('aria-modal', 'true');
                confirmDialog.innerHTML = `
                    <div class="modal-body">
                        <h2>¿Mover a la papelera?</h2>
                        <button type="button">Cancelar</button>
                        <button type="button">Mover a la papelera</button>
                    </div>
                `;
                doc.getElementById('dialog-wrapper').appendChild(confirmDialog);

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
                <!-- System album: must be skipped -->
                <div role="listitem" class="album-item system-album">
                    <a href="./favorites">Favorites</a>
                    <button aria-label="More options" class="menu-btn" style="display:block; width:10px; height:10px;">...</button>
                </div>
                <!-- User album: should be deleted -->
                <div role="listitem" class="album-item user-album">
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

        const userMenuBtn = doc.querySelector('.user-album .menu-btn');
        userMenuBtn.addEventListener('click', () => {
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
                    doc.querySelector('.user-album').remove();
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

        assert(menuOpened, 'User album options menu must be triggered (system album skipped)');
        assert(albumDeleted, 'User album must be deleted after confirmation');
        assert.strictEqual(win.__googlePhotosAlbumDeleteState.albumCount, 1, 'albumCount should be 1');

        win.stopGooglePhotosAlbumDelete();
        console.log('✓ TEST 5 PASSED: delete_albums.js successfully skipped system albums, detected user album, confirmed deletion, and updated count.\n');
    }

    // -----------------------------------------------------------------------------
    // Test 6: Safe Selection & maxImageCount Bounding Test
    // -----------------------------------------------------------------------------
    console.log('TEST 6: Testing maxImageCount safety bounding (Never over-delete)...');

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
                <div class="photo-item"><div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div></div>
                <div class="photo-item"><div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div></div>
                <div class="photo-item"><div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div></div>
                <div class="photo-item"><div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div></div>
                <div class="photo-item"><div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div></div>
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
        win.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];

        // Custom script with maxImageCount = 2
        const boundedScript = photoScript.replace('const maxImageCount = "ALL_PHOTOS";', 'const maxImageCount = 2;');

        let checkedCount = 0;
        doc.querySelectorAll('.ckGgle').forEach(cb => {
            cb.addEventListener('click', () => {
                cb.setAttribute('aria-checked', 'true');
                checkedCount++;
            });
        });

        const deleteBtn = doc.querySelector('div[data-delete-origin] button');
        deleteBtn.addEventListener('click', () => {
            const dialog = doc.createElement('div');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.innerHTML = `<button type="button" data-mdc-dialog-button-default="true">Move to trash</button>`;
            doc.getElementById('modal-container').appendChild(dialog);

            const confirmBtn = dialog.querySelector('[data-mdc-dialog-button-default]');
            confirmBtn.addEventListener('click', () => {
                dialog.remove();
                doc.querySelectorAll('.ckGgle[aria-checked="true"]').forEach(el => el.remove());
            });
        });

        win.eval(boundedScript);

        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && win.__googlePhotosDeleteState.isRunning) {
            await new Promise(r => setTimeout(r, 200));
        }

        assert.strictEqual(checkedCount, 2, 'Must select exactly 2 photos when maxImageCount=2 (not all 5)');
        assert.strictEqual(win.__googlePhotosDeleteState.imageCount, 2, 'imageCount must be 2');
        assert.strictEqual(win.__googlePhotosDeleteState.isRunning, false, 'Tool must halt once maxImageCount is reached');

        console.log('✓ TEST 6 PASSED: maxImageCount strictly respected, preventing over-deletion.\n');
    }

    // -----------------------------------------------------------------------------
    // Test 7: Simulated DOM Lifecycle Test for restore_photos.js
    // -----------------------------------------------------------------------------
    console.log('TEST 7: Simulated DOM Lifecycle Test for restore_photos.js...');

    {
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head><title>Trash - Google Photos</title></head>
        <body>
            <header>
                <div role="toolbar">
                    <button aria-label="Restore" style="display:block; width:20px; height:20px;">Restore Icon</button>
                </div>
            </header>
            <main>
                <div class="trash-item">
                    <div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div>
                </div>
                <div class="trash-item">
                    <div class="ckGgle" aria-checked="false" style="display:block; width:10px; height:10px;"></div>
                </div>
            </main>
            <div id="modal-container"></div>
        </body>
        </html>
        `;

        const dom = new JSDOM(html, {
            url: 'https://photos.google.com/trash?hl=en',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        });

        const win = dom.window;
        const doc = win.document;
        win.scrollBy = () => {};
        win.scrollTo = () => {};
        win.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];

        let restoreClicked = false;
        const restoreBtn = doc.querySelector('button[aria-label="Restore"]');
        restoreBtn.addEventListener('click', () => {
            restoreClicked = true;
            doc.querySelectorAll('.trash-item').forEach(el => el.remove());
        });

        win.eval(restoreScript);

        assert(win.__googlePhotosRestoreState, '__googlePhotosRestoreState must exist');
        assert.strictEqual(typeof win.stopGooglePhotosRestore, 'function', 'stopGooglePhotosRestore must be a function');

        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && win.__googlePhotosRestoreState.imageCount === 0) {
            await new Promise(r => setTimeout(r, 200));
        }

        assert(restoreClicked, 'Restore button must be triggered');
        assert.strictEqual(win.__googlePhotosRestoreState.imageCount, 2, 'Restored count should be 2');

        win.stopGooglePhotosRestore();
        console.log('✓ TEST 7 PASSED: restore_photos.js successfully selected photos from Trash and triggered restore.\n');
    }

    // -----------------------------------------------------------------------------
    // Test 8: Edge Cases - Empty Grid & Clean Re-execution
    // -----------------------------------------------------------------------------
    console.log('TEST 8: Edge Cases (Empty library exit & Re-execution cleanup)...');

    {
        // 8A: Empty library
        const emptyDom = new JSDOM(`<!DOCTYPE html><html><body><header></header><main></main></body></html>`, {
            url: 'https://photos.google.com/?hl=en',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        });
        const win = emptyDom.window;
        win.scrollBy = () => {};
        win.scrollTo = () => {};
        win.Element.prototype.getClientRects = () => [];

        const fastScript = photoScript.replace('const MAX_CHECKBOX_RETRIES = 10;', 'const MAX_CHECKBOX_RETRIES = 1;');
        win.eval(fastScript);

        await new Promise(r => setTimeout(r, 1500));
        assert.strictEqual(win.__googlePhotosDeleteState.isRunning, false, 'Script should cleanly exit when no photos are found');
        assert.strictEqual(win.__googlePhotosDeleteState.imageCount, 0, 'No photos deleted in empty library');

        // 8B: Re-execution cleanup
        win.eval(fastScript);
        assert(win.__googlePhotosDeleteState, 'State successfully reinitialized on re-execution');
        win.stopGooglePhotosDelete();

        console.log('✓ TEST 8 PASSED: Edge cases (empty library termination, state recreation) handled cleanly.\n');
    }

    console.log('====================================================');
    console.log(' ALL 8 TEST SUITES PASSED COMPLETELY!');
    console.log('====================================================');
}

runAllTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
