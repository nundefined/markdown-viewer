
md.contextmenu = ({storage: {state, set}}) => {

  var items = {
    toc: 'Table of Contents',
    raw: 'Markdown Source',
  }

  var create = () => {
    // the items survive service worker restarts, keep the existing ones
    Object.keys(items).forEach((id) => {
      chrome.contextMenus.create({
        id,
        title: items[id],
        type: 'checkbox',
        checked: false,
        contexts: ['page', 'selection', 'link', 'image'],
        visible: false,
      }, () => chrome.runtime.lastError)
    })
  }

  // the viewer sets a global when it mounts, read back what this tab is showing
  // other tabs can still show what the settings were when they rendered
  var probe = (id, done) => {
    chrome.scripting.executeScript({
      target: {tabId: id},
      func: () => window.state ? {toc: state.content.toc, raw: state.raw} : null
    }, (res) => {
      done(!chrome.runtime.lastError && res && res[0].result || null)
    })
  }

  var pending = 0

  var update = (id) => {
    var token = ++pending
    probe(id, (view) => {
      // the probes are async, only the latest one gets to decide
      if (token !== pending) {
        return
      }
      Object.keys(items).forEach((item) => {
        chrome.contextMenus.update(item, {
          visible: !!view,
          checked: !!(view && view[item]),
        }, () => chrome.runtime.lastError)
      })
    })
  }

  var active = ({tabId}) => {
    update(tabId)
  }

  // this is what hides the item again, it can fire before the viewer mounts
  var tab = (id, info, tab) => {
    if (info.status === 'complete' && tab.active) {
      update(id)
    }
  }

  // the viewer reporting it is live, this is what shows the item
  var mounted = (tab) => {
    if (tab && tab.active) {
      update(tab.id)
    }
  }

  var click = (info, tab) => {
    if (info.menuItemId === 'toc' && state.content) {
      state.content.toc = info.checked
      set({content: state.content})
      chrome.tabs.sendMessage(tab.id, {message: 'toc', toc: info.checked},
        () => chrome.runtime.lastError)
    }
    // this tab only, the stored setting belongs to the popup button
    else if (info.menuItemId === 'raw') {
      chrome.tabs.sendMessage(tab.id, {message: 'raw', raw: info.checked},
        () => chrome.runtime.lastError)
    }
  }

  // the popup button flips the active tab without reloading it
  var raw = (checked) => {
    chrome.contextMenus.update('raw', {checked}, () => chrome.runtime.lastError)
  }

  return {create, active, tab, mounted, click, raw}
}
