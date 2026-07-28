// How many photos to delete?
// Put a number value, like this
// const maxImageCount = 5896
const maxImageCount = "ALL_PHOTOS";

// Selector for Images and buttons
const ELEMENT_SELECTORS = {
    checkboxClass: '.ckGgle',
    languageAgnosticDeleteButton: 'div[data-delete-origin] button',
    deleteButton: 'button[aria-label="Delete"]',
    dialog: '[aria-modal="true"], [role="alertdialog"], [role="dialog"]',
    // Google marks the affirmative button of a dialog with this attribute.
    // It does not depend on the interface language or on generated class names.
    dialogDefaultButton: 'button[data-mdc-dialog-button-default]'
}

// Only used when the structural marker above is missing.
const CONFIRM_TEXTS = ['Move to trash', 'Move to bin', 'Delete', 'OK', 'Got it', 'Continue'];

// Buttons that must never be clicked. "Learn more" only opens a help page,
// so clicking it leaves the deletion unconfirmed.
const CANCEL_TEXTS = ['Cancel', 'Close', 'Learn more'];

// The first time you delete on an account, Google shows an extra notice
// ("Move items to trash") before the usual confirmation, so a single deletion
// can produce more than one dialog.
const MAX_DIALOGS = 3;

// Time Configuration (in milliseconds)
const TIME_CONFIG = {
    delete_cycle: 10000,
    press_button_delay: 2000
};

const MAX_RETRIES = 1000;

let imageCount = 0;

let checkboxes;
let buttons = {
    deleteButton: null,
    confirmationButton: null
}

const isVisible = (element) => !!element && element.offsetParent !== null;

const labelOf = (element) =>
    (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Waits for a dialog to show up. Returns null if none appears in time.
async function waitForDialog(timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const dialog = [...document.querySelectorAll(ELEMENT_SELECTORS['dialog'])].find(isVisible);
        if (dialog) return dialog;
        await wait(250);
    }
    return null;
}

// Picks the button that confirms the action, never a cancel button.
function findConfirmButton(dialog) {
    const candidates = [...dialog.querySelectorAll('button')]
        .filter(isVisible)
        .filter((button) => !CANCEL_TEXTS.some((text) => labelOf(button).includes(text)));

    const marked = candidates.find((button) => button.matches(ELEMENT_SELECTORS['dialogDefaultButton']));
    if (marked) return marked;

    for (const text of CONFIRM_TEXTS) {
        const hit = candidates.find((button) => labelOf(button).includes(text));
        if (hit) return hit;
    }

    // Fall back to the last non-cancel button, which is the affirmative one by convention.
    return candidates[candidates.length - 1] || null;
}

// Confirms the deletion, handling every dialog that shows up in sequence.
async function confirmDeletion() {
    for (let index = 0; index < MAX_DIALOGS; index++) {
        const timeout = index === 0 ? TIME_CONFIG['press_button_delay'] + 3000 : 2000;
        const dialog = await waitForDialog(timeout);

        // No dialog left. On the first pass this simply means none was required.
        if (!dialog) return;

        const confirmButton = findConfirmButton(dialog);
        if (!confirmButton) {
            console.error("[ERROR] Found a dialog but no button to confirm with:", labelOf(dialog));
            return;
        }

        confirmButton.click();
        console.log(`[INFO] Confirmed dialog ${index + 1}: "${labelOf(confirmButton)}"`);

        // Wait for this dialog to go away so the next one is not read twice.
        for (let i = 0; i < 20 && document.contains(dialog) && isVisible(dialog); i++) {
            await wait(250);
        }
    }
}

let deleteTask = setInterval(async () => {
    let attemptCount = 1;

    do {
        checkboxes = document.querySelectorAll(ELEMENT_SELECTORS['checkboxClass']);
        await new Promise(r => setTimeout(r, 1000));
    } while (checkboxes.length <= 0 && attemptCount++ < MAX_RETRIES);


    if (checkboxes.length <= 0) {
        console.log("[INFO] No more images to delete.");
        clearInterval(deleteTask);
        console.log("[SUCCESS] Tool exited.");
        return;
    }

    attemptCount = 1;
    imageCount += checkboxes.length;

    checkboxes.forEach((checkbox) => { checkbox.click() });
    console.log("[INFO] Deleting", checkboxes.length, "images");

    setTimeout(async () => {
        try {
            buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['languageAgnosticDeleteButton']);
            buttons.deleteButton.click();
        } catch {
            buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['deleteButton']);
            buttons.deleteButton.click();
        }

        await confirmDeletion();

        console.log(`[INFO] ${imageCount}/${maxImageCount} Deleted`);
        if (maxImageCount !== "ALL_PHOTOS" && imageCount >= parseInt(maxImageCount)) {
            console.log(`${imageCount} photos deleted as requested`);
            clearInterval(deleteTask);
            console.log("[SUCCESS] Tool exited.");
            return;
        }
    }, TIME_CONFIG['press_button_delay']);
}, TIME_CONFIG['delete_cycle']);
