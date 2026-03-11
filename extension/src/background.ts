/// <reference types="chrome"/>

chrome.runtime.onInstalled.addListener(() => {
    console.log('[SkyVoice] Extension installed ✅')
})

// Relay message từ popup → content-script của tab active
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SKYVOICE_UI_ACTION') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id
            if (tabId) {
                chrome.tabs.sendMessage(tabId, message, (resp) => sendResponse(resp))
            }
        })
        return true // async response
    }
})