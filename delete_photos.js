
// Selector for Images and buttons
const ELEMENT_SELECTORS = {
    checkboxClass: '.ckGgle',
    deleteButton: 'button[title="Delete"]',
    confirmationButton: '#yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.V639qd.bvQPzd.oEOLpc.Up8vH.J9Nfi.A9Uzve.iWO5td > div.XfpsVe.J9fJmf > button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.kHssdc.HvOprf'
}

// Time Configuration (in milliseconds)
const TIME_CONFIG = {
    delete_cycle: 7000,
    press_button_delay: 1000
};

let imageCount = 0;
let fail = 0;
let checkboxes;
let buttons = {
    deleteButton: null,
    confirmationButton: null
}

let deleteTask = setInterval(() => {

    checkboxes = document.querySelectorAll(ELEMENT_SELECTORS['checkboxClass']);
    if (checkboxes.length <= 0) {
        if (fail == 0) {
        	console.log("[WARNING] Fail to select checkboxes.");
        	fail = 1;
        	return;
        }
        console.log("[INFO] No more images to delete.");
        clearInterval(deleteTask);
        console.log("[SUCCESS] Tool exited.");
        return;
    }
    fail = 0;

    imageCount += checkboxes.length;

    checkboxes.forEach((checkbox) => { checkbox.click() });
    console.log("[INFO] Deleting", checkboxes.length, "images");

    setTimeout(() => {

        buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['deleteButton']);
        buttons.deleteButton.click();

        setTimeout(() => {
            buttons.confirmation_button = document.querySelector(ELEMENT_SELECTORS['confirmationButton']);
            buttons.confirmation_button.click();
        }, TIME_CONFIG['press_button_delay']);
    }, TIME_CONFIG['press_button_delay']);
}, TIME_CONFIG['delete_cycle']);
