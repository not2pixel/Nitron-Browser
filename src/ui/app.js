// ─── Nitron v3 — Multi-Webview Tab Engine ────────────────────────────────
// Architecture: One <webview> per tab (show/hide). True state isolation.
// Each tab keeps its own DOM, JS state, scroll pos, session.

// ─── Tab Store ────────────────────────────────────────────────────────────
const TabStore = (() => {
  const tabs = new Map()
  let activeId = null
  let counter = 0
  const listeners = []

  function notify() { listeners.forEach(fn => fn()) }

  return {
    create(url = null) {
      const id = ++counter
      tabs.set(id, { id, url: url || '', title: 'New Tab', favicon: '', loading: false })
      activeId = id
      notify()
      return id
    },
    close(id) {
      tabs.delete(id)
      if (activeId === id) {
        const keys = [...tabs.keys()]
        activeId = keys[keys.length - 1] ?? null
        if (!activeId && tabs.size === 0) this.create()
      }
      notify()
      return activeId
    },
    switch(id) {
      if (tabs.has(id)) { activeId = id; notify() }
      return tabs.get(id)
    },
    get active() { return tabs.get(activeId) },
    get activeId() { return activeId },
    get all() { return [...tabs.values()] },
    update(id, patch) { if (tabs.has(id)) { Object.assign(tabs.get(id), patch); notify() } },
    onChange(fn) { listeners.push(fn) },
  }
})()

// ─── Webview Pool ─────────────────────────────────────────────────────────
// Each tab ID → its own <webview> element. True isolation.
const WebviewPool = (() => {
  const pool = new Map()
  const container = document.getElementById('webview-container')

  function create(tabId) {
    const wv = document.createElement('webview')
    wv.setAttribute('partition', `persist:tab_${tabId}`)
    wv.setAttribute('allowpopups', '')
    wv.setAttribute('webpreferences', 'allowRunningInsecureContent=yes, javascript=yes, backgroundThrottling=no')
    wv.style.cssText = 'display:none;width:100%;height:100%;flex:1;border:none;'
    wv.dataset.tabId = tabId
    container.appendChild(wv)
    _attachEvents(wv, tabId)
    pool.set(tabId, wv)
    return wv
  }

  function get(tabId) { return pool.get(tabId) }

  function show(tabId) {
    pool.forEach((wv, id) => {
      wv.style.display = id === tabId ? 'flex' : 'none'
    })
  }

  function destroy(tabId) {
    const wv = pool.get(tabId)
    if (wv) {
      try { wv.src = 'about:blank' } catch {}
      setTimeout(() => { wv.remove(); pool.delete(tabId) }, 100)
    }
  }

  function getActive() { return pool.get(TabStore.activeId) }

  function _attachEvents(wv, tabId) {
    wv.addEventListener('did-start-loading', () => {
      TabStore.update(tabId, { loading: true })
      if (tabId === TabStore.activeId) showLoadingBar()
    })

    wv.addEventListener('did-finish-load', () => {
      try {
        const url = wv.getURL()
        const title = wv.getTitle() || url
        TabStore.update(tabId, { url, title, loading: false })
        if (tabId === TabStore.activeId) {
          hideLoadingBar()
          urlbar.value = url
          updateSecureIcon(url)
          document.title = title + ' — Nitron'
        }
      } catch {}
    })

    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return
      TabStore.update(tabId, { loading: false })
      if (tabId === TabStore.activeId) {
        hideLoadingBar()
        showError(e.errorDescription || 'Cannot reach this page')
      }
    })

    wv.addEventListener('page-favicon-updated', (e) => {
      if (e.favicons?.[0]) TabStore.update(tabId, { favicon: e.favicons[0] })
    })

    wv.addEventListener('page-title-updated', (e) => {
      TabStore.update(tabId, { title: e.title })
      if (tabId === TabStore.activeId) document.title = e.title + ' — Nitron'
    })

    wv.addEventListener('did-navigate', (e) => {
      if (e.url && e.url !== 'about:blank') {
        TabStore.update(tabId, { url: e.url })
        if (tabId === TabStore.activeId) {
          urlbar.value = e.url
          updateSecureIcon(e.url)
        }
        const hist = getHist(tabId)
        const last = hist.back[hist.back.length - 1]
        if (last !== e.url) { hist.back.push(e.url); hist.forward = [] }
      }
    })

    wv.addEventListener('did-navigate-in-page', (e) => {
      if (!e.isMainFrame) return
      TabStore.update(tabId, { url: e.url })
      if (tabId === TabStore.activeId) {
        urlbar.value = e.url
        updateSecureIcon(e.url)
      }
      const hist = getHist(tabId)
      const last = hist.back[hist.back.length - 1]
      if (last !== e.url) { hist.back.push(e.url); hist.forward = [] }
    })

    wv.addEventListener('new-window', (e) => {
      e.preventDefault()
      if (e.url && e.url !== 'about:blank') newTab(e.url)
    })
  }

  return { create, get, show, destroy, getActive }
})()

// ─── UI refs ──────────────────────────────────────────────────────────────
const urlbar        = document.getElementById('urlbar')
const secureIcon    = document.getElementById('secure-icon')
const loadingBar    = document.getElementById('loading-bar')
const newtabPage    = document.getElementById('newtab-page')
const errorPage     = document.getElementById('error-page')
const errorMsg      = document.getElementById('error-msg')
const dnsPrefetched = new Set()

// ─── Per-tab history ──────────────────────────────────────────────────────
const tabHistory = new Map()
function getHist(id) {
  if (!tabHistory.has(id)) tabHistory.set(id, { back: [], forward: [] })
  return tabHistory.get(id)
}

// ─── DNS Prefetch ─────────────────────────────────────────────────────────
function dnsPrefetch(url) {
  try {
    const host = new URL(url).hostname
    if (dnsPrefetched.has(host)) return
    dnsPrefetched.add(host)
    const link = document.createElement('link')
    link.rel = 'dns-prefetch'
    link.href = '//' + host
    document.head.appendChild(link)
  } catch {}
}

// ─── URL normalization ────────────────────────────────────────────────────
function normalizeUrl(raw) {
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('about:')) return s
  if (s.includes('.') && !s.includes(' ') && !s.startsWith('localhost')) return 'https://' + s
  if (s.startsWith('localhost')) return 'http://' + s
  return 'https://www.google.com/search?q=' + encodeURIComponent(s)
}

// ─── Navigation ───────────────────────────────────────────────────────────
function loadUrl(raw) {
  const url = normalizeUrl(raw)
  if (!url) return
  const tab = TabStore.active
  if (!tab) return
  const wv = WebviewPool.get(tab.id)
  if (!wv) return
  const hist = getHist(tab.id)
  hist.back.push(url)
  hist.forward = []
  TabStore.update(tab.id, { url, loading: true })
  urlbar.value = url
  updateSecureIcon(url)
  dnsPrefetch(url)
  showContent()
  WebviewPool.show(tab.id)
  wv.src = url
}

function handleUrlKey(e)  { if (e.key === 'Enter') loadUrl(urlbar.value) }
function handleNewtabKey(e) { if (e.key === 'Enter') newtabNavigate() }
function newtabNavigate() {
  const val = document.getElementById('newtab-search').value.trim()
  if (val) loadUrl(val)
}

// ─── Tab Management ───────────────────────────────────────────────────────
function newTab(url = null) {
  const id = TabStore.create(url)
  const wv = WebviewPool.create(id)
  if (url) {
    getHist(id).back.push(url)
    dnsPrefetch(url)
    wv.src = url
    TabStore.update(id, { url, loading: true })
    showContent()
    WebviewPool.show(id)
  } else {
    WebviewPool.show(null)
    showNewTabPage()
  }
}

function closeTab(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault() }
  const wasActive = id === TabStore.activeId
  tabHistory.delete(id)
  TabStore.close(id)
  WebviewPool.destroy(id)
  if (wasActive) {
    const active = TabStore.active
    if (active) {
      if (active.url) {
        WebviewPool.show(active.id)
        urlbar.value = active.url
        updateSecureIcon(active.url)
        showContent()
        document.title = (active.title || 'New Tab') + ' — Nitron'
      } else {
        WebviewPool.show(null)
        showNewTabPage()
      }
    }
  }
}

function switchTab(id) {
  const tab = TabStore.switch(id)
  if (!tab) return
  urlbar.value = tab.url || ''
  updateSecureIcon(tab.url || '')
  errorPage.style.display = 'none'
  if (tab.url) {
    WebviewPool.show(id)
    newtabPage.style.display = 'none'
    showContent()
    if (tab.loading) showLoadingBar()
    else hideLoadingBar()
  } else {
    WebviewPool.show(null)
    showNewTabPage()
  }
  document.title = (tab.title || 'New Tab') + ' — Nitron'
}

// ─── Nav buttons ──────────────────────────────────────────────────────────
function goBack() {
  const tab = TabStore.active
  if (!tab) return
  const hist = getHist(tab.id)
  const wv = WebviewPool.get(tab.id)
  if (wv && wv.canGoBack?.()) { wv.goBack(); return }
  if (hist.back.length > 1) {
    hist.forward.push(hist.back.pop())
    const prev = hist.back[hist.back.length - 1]
    TabStore.update(tab.id, { url: prev })
    if (wv) wv.src = prev
    urlbar.value = prev
    updateSecureIcon(prev)
  }
}

function goForward() {
  const tab = TabStore.active
  if (!tab) return
  const hist = getHist(tab.id)
  const wv = WebviewPool.get(tab.id)
  if (wv && wv.canGoForward?.()) { wv.goForward(); return }
  if (hist.forward.length) {
    const next = hist.forward.pop()
    hist.back.push(next)
    if (wv) wv.src = next
    TabStore.update(tab.id, { url: next })
    urlbar.value = next
    updateSecureIcon(next)
  }
}

function refreshPage() {
  const tab = TabStore.active
  if (tab?.url) {
    const wv = WebviewPool.get(tab.id)
    if (wv) { wv.reload(); showLoadingBar() }
  }
}

function goHome() {
  TabStore.update(TabStore.activeId, { url: '', title: 'New Tab' })
  WebviewPool.show(null)
  showNewTabPage()
}

// ─── Tab Rendering (DOM diff) ─────────────────────────────────────────────
let _prevTabHTML = ''
function renderTabs() {
  const all   = TabStore.all
  const actId = TabStore.activeId
  const html  = all.map(tab => {
    const isActive = tab.id === actId
    const favicon = tab.favicon
      ? `<img class="tab-favicon" src="${escHtml(tab.favicon)}" onerror="this.style.display='none'">`
      : `<span class="tab-favicon tab-favicon-default"></span>`
    const loader = tab.loading
      ? `<span class="tab-spinner"></span>`
      : favicon
    const title = escHtml((tab.title || 'New Tab').slice(0, 32))
    return `<div class="tab${isActive ? ' active' : ''}" onclick="switchTab(${tab.id})" data-id="${tab.id}">
      ${loader}
      <span class="tab-title">${title}</span>
      <button class="tab-close" onclick="closeTab(${tab.id},event)" title="Close">
        <svg viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </button>
    </div>`
  }).join('')
  if (html !== _prevTabHTML) {
    _prevTabHTML = html
    document.getElementById('tabs').innerHTML = html
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── UI helpers ───────────────────────────────────────────────────────────
function showContent()  { newtabPage.style.display = 'none'; errorPage.style.display = 'none' }
function showLoadingBar() { loadingBar.classList.add('loading') }
function hideLoadingBar() { loadingBar.classList.remove('loading') }
function showNewTabPage() {
  newtabPage.style.display = 'flex'
  errorPage.style.display = 'none'
  loadingBar.classList.remove('loading')
  document.getElementById('newtab-search').value = ''
  document.title = 'New Tab — Nitron'
}
function showError(msg) {
  hideLoadingBar()
  newtabPage.style.display = 'none'
  errorMsg.textContent = msg
  errorPage.style.display = 'flex'
}
function updateSecureIcon(url) {
  const ok = url.startsWith('https://')
  secureIcon.className = 'secure-icon ' + (ok ? 'secure' : 'insecure')
  secureIcon.title = ok ? 'Connection is secure' : 'Connection is not secure'
}
function toggleBookmark() {
  const tab = TabStore.active
  if (!tab?.url) return
  const btn = document.getElementById('btn-bookmark')
  const saved = btn.dataset.saved === '1'
  btn.dataset.saved = saved ? '0' : '1'
  btn.classList.toggle('bookmarked', !saved)
}
function toggleMenu()  { document.getElementById('menu-dropdown').classList.toggle('open') }
function closeMenu()   { document.getElementById('menu-dropdown').classList.remove('open') }
function toggleDevTools() {
  const wv = WebviewPool.getActive()
  if (wv) wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools()
  closeMenu()
}
function toggleDarkMode() { document.body.classList.toggle('light-mode'); closeMenu() }
function showHistory()    { alert('History not yet persisted — coming soon'); closeMenu() }
function showBookmarks()  { alert('Bookmarks coming soon!'); closeMenu() }
function zoomIn()  { try { const wv = WebviewPool.getActive(); if(wv) wv.setZoomLevel(wv.getZoomLevel()+0.5) } catch{} closeMenu() }
function zoomOut() { try { const wv = WebviewPool.getActive(); if(wv) wv.setZoomLevel(wv.getZoomLevel()-0.5) } catch{} closeMenu() }
function zoomReset(){ try { WebviewPool.getActive()?.setZoomLevel(0) } catch{} closeMenu() }

// ─── Keyboard shortcuts ───────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl && e.key === 't')                  { e.preventDefault(); newTab() }
  if (ctrl && e.key === 'w')                  { e.preventDefault(); closeTab(TabStore.activeId) }
  if (ctrl && e.key === 'l')                  { e.preventDefault(); urlbar.focus(); urlbar.select() }
  if (ctrl && e.key === 'r')                  { e.preventDefault(); refreshPage() }
  if (ctrl && e.shiftKey && e.key === 'R')    { e.preventDefault(); WebviewPool.getActive()?.reloadIgnoringCache?.() }
  if (e.key === 'F5')                         { e.preventDefault(); refreshPage() }
  if (e.altKey && e.key === 'ArrowLeft')      { e.preventDefault(); goBack() }
  if (e.altKey && e.key === 'ArrowRight')     { e.preventDefault(); goForward() }
  if (ctrl && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    const all = TabStore.all
    const idx = all.findIndex(t => t.id === TabStore.activeId)
    const next = all[(idx + 1) % all.length]
    if (next) switchTab(next.id)
  }
  if (ctrl && e.shiftKey && e.key === 'Tab') {
    e.preventDefault()
    const all = TabStore.all
    const idx = all.findIndex(t => t.id === TabStore.activeId)
    const prev = all[(idx - 1 + all.length) % all.length]
    if (prev) switchTab(prev.id)
  }
})

document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-dropdown') && !e.target.closest('#btn-menu')) closeMenu()
})

// ─── Boot ─────────────────────────────────────────────────────────────────
TabStore.onChange(renderTabs)
document.addEventListener('DOMContentLoaded', () => { newTab() })
