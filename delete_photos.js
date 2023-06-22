/* 
Mass delete google photos
Works best in Chrom(ium); Firefox works but can have loading issues and timing issues with HUGE photo sets. 
https://github.com/mrishab/google-photos-delete-tool/
*/

// How many photos to delete?
// Put a number value, like this
// const maxImageCount = 5896
const maxImageCount = "ALL_PHOTOS";

// Selector for Images and buttons
const ELEMENT_SELECTORS = {
    checkboxClass: '.ckGgle',
    languageAgnosticDeleteButton: 'div[data-delete-origin] button',
    deleteButton: 'button[aria-label="Delete"]',
    confirmationButton: '#yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.V639qd.bvQPzd.oEOLpc.Up8vH.J9Nfi.A9Uzve.iWO5td > div.XfpsVe.J9fJmf > button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.kHssdc.HvOprf'
}

// Time Configuration (in milliseconds)
const TIME_CONFIG = {
    delete_cycle: 10000,
    press_button_delay: 2000,
   	check_sleep_delay: 200
};

const MAX_RETRIES = 10;

// Force sleep a bit
const sleep = ms => new Promise(r => setTimeout(r, ms));

let imageCount = 0;

let checkboxes;
let buttons = {
    deleteButton: null,
    confirmationButton: null
}

let deleteTask = setInterval(() => {
    let attemptCount = 1;

    do {
        checkboxes = document.querySelectorAll(ELEMENT_SELECTORS['checkboxClass']);
		sleep(TIME_CONFIG['check_sleep_delay']); // Give a bit of extra time for the page to load more
    } while (checkboxes.length <= 0 && attemptCount++ < MAX_RETRIES);

    if (checkboxes.length <= 0) {
        console.log("[INFO] No more images to delete.");
        // Comment out the next three lines if you have 10k+ photos and don't want to risk it quitting part way through
        clearInterval(deleteTask);
        console.log("[SUCCESS] Tool exited.");
        return;
    }

    imageCount += checkboxes.length;

    checkboxes.forEach((checkbox) => { checkbox.click() });
    console.log("[INFO] Deleting", checkboxes.length, "images");

    setTimeout(() => {
        try {
            buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['languageAgnosticDeleteButton']);
            buttons.deleteButton.click();
        } catch {
            buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['deleteButton']);
            buttons.deleteButton.click();
        }

        setTimeout(() => {
            buttons.confirmation_button = document.querySelector(ELEMENT_SELECTORS['confirmationButton']);
            buttons.confirmation_button.click();

            console.log(`[INFO] ${imageCount}/${maxImageCount} Deleted`);
            if (maxImageCount !== "ALL_PHOTOS" && imageCount >= parseInt(maxImageCount)) {
                console.log(`${imageCount} photos deleted as requested`);
                clearInterval(deleteTask);
                console.log("[SUCCESS] Tool exited.");
                return;
            }

        }, TIME_CONFIG['press_button_delay']);
    }, TIME_CONFIG['press_button_delay']);
}, TIME_CONFIG['delete_cycle']);
