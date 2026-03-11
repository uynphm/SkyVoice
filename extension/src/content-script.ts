/// <reference types="chrome"/>

interface UIAction {
    intent: string
    data?: {
        seat_id?: string
        seat_ids?: string[]
        page_summary?: string
    }
    speech?: string
}

// Xoá tất cả highlight cũ
function clearHighlights() {
    document.querySelectorAll<HTMLElement>('[data-sv]').forEach(el => {
        el.style.outline = ''
        el.style.outlineOffset = ''
        el.removeAttribute('data-sv')
    })
    document.getElementById('sv-banner')?.remove()
}

// Tìm element theo seatId
function findSeatEls(seatId: string): HTMLElement[] {
    const direct = Array.from(document.querySelectorAll<HTMLElement>(
        `[aria-label*="${seatId}"], [data-seat-id="${seatId}"], [data-id="${seatId}"]`
    ))
    if (direct.length) return direct
    return Array.from(document.querySelectorAll<HTMLElement>('button,td,div,span'))
        .filter(el => el.textContent?.trim() === seatId && !el.children.length)
}

// Highlight vàng — AI đề xuất
function highlightSeats(ids: string[]) {
    clearHighlights()
    ids.forEach(id => {
        findSeatEls(id).forEach(el => {
            el.style.outline = '3px solid #FFD700'
            el.style.outlineOffset = '2px'
            el.setAttribute('data-sv', 'recommended')
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
    })
}

// Highlight xanh + click — AI đã chọn
function selectSeat(id: string) {
    findSeatEls(id).forEach(el => {
        el.style.outline = '3px solid #00E676'
        el.style.outlineOffset = '2px'
        el.setAttribute('data-sv', 'selected')
        el.click()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
}

// Banner tóm tắt trang
function showBanner(text: string) {
    document.getElementById('sv-banner')?.remove()
    const el = document.createElement('div')
    el.id = 'sv-banner'
    Object.assign(el.style, {
        position: 'fixed', bottom: '20px', left: '50%',
        transform: 'translateX(-50%)', zIndex: '2147483647',
        background: '#121216', color: '#fff',
        border: '2px solid #FFD700', borderRadius: '12px',
        padding: '12px 18px', maxWidth: '460px',
        fontSize: '14px', lineHeight: '1.5',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        fontFamily: 'Inter, system-ui, sans-serif',
    })
    el.textContent = `🎙️ SkyVoice: ${text}`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 9000)
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'SKYVOICE_UI_ACTION') return
    const action: UIAction = msg.payload || msg

    switch (action.intent) {
        case 'select_seat':
            if (action.data?.seat_id) selectSeat(action.data.seat_id)
            break
        case 'ask_preference':
            if (action.data?.seat_ids?.length) highlightSeats(action.data.seat_ids)
            break
        case 'confirm_selection':
        case 'navigate':
            clearHighlights()
            break
        case 'summarize':
            if (action.data?.page_summary) showBanner(action.data.page_summary)
            else if (action.speech) showBanner(action.speech)
            break
    }

    sendResponse({ ok: true })
})

console.log('[SkyVoice] Content script ready on', location.hostname)