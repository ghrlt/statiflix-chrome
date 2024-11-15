async function setTexts() {
    let texts = document.getElementsByClassName("text");
    for (let text of texts) {
        let key = text.getAttribute("data-text-key");
        text.innerText = chrome.i18n.getMessage(key);
    }
}
setTexts();

const img = document.querySelector('img');
if (img) {

    img.addEventListener('dragstart', (event) => {
        event.preventDefault();
    });
    
}