// Selector for Images and buttons
const ELEMENT_SELECTORS = {
    optionClass: '.IMQfZ .U26fgb',
    deleteButton: '.JPdR6b.s2VtY.qjTEB .z80M1:last-child',
    confirmationButton: '#yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.V639qd.bvQPzd.Up8vH.J9Nfi.iWO5td > div.XfpsVe.J9fJmf button:last-child'
}

// Time Configuration (in milliseconds)
const TIME_CONFIG = {
    delete_cycle: 2000,
    press_button_delay: 500
};

let albumCount = 0;

let options;
let buttons = {
    deleteButton: null,
    confirmationButton: null
}

function triggerMouseEvent (node, eventType) {
    var clickEvent = document.createEvent ('MouseEvents');
    clickEvent.initEvent (eventType, true, true);
    node.dispatchEvent (clickEvent);
}

function fakeClick(el)
{
	triggerMouseEvent (el, "mouseover");
    triggerMouseEvent (el, "mousedown");
    triggerMouseEvent (el, "mouseup");
    triggerMouseEvent (el, "click");
}

let deleteTask = setInterval(() => {

    options = document.querySelectorAll(ELEMENT_SELECTORS['optionClass']);

    if (options.length <= 0) {
        console.log("[INFO] No more albums to delete.");
        clearInterval(deleteTask);
        console.log("[SUCCESS] Tool exited.");
        return;
    }

    console.log("Remaining album(s) : ", options.length );

    //options.forEach((option) => { option.click() });
	options[0].click();

    setTimeout(() => {

        buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['deleteButton']);
        fakeClick(buttons.deleteButton);

        setTimeout(() => {
            buttons.confirmation_button = document.querySelector(ELEMENT_SELECTORS['confirmationButton']);
			fakeClick(buttons.confirmation_button);
			
        }, TIME_CONFIG['press_button_delay']);
    }, TIME_CONFIG['press_button_delay']);
}, TIME_CONFIG['delete_cycle']);