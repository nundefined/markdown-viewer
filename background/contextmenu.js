
md.contextmenu = ({storage: {state, set}}) => {

  var item = 'toc'

  var create = () => {
    // the item survives service worker restarts, keep the existing one
    chrome.contextMenus.create({
      id: item,
      title: 'Table of Contents',
      type: 'checkbox',
      checked: false,
      contexts: ['page', 'selection', 'link', 'image'],
      visible: false,
    }, () => chrome.runtime.lastError)
  }

  // the viewer sets a global when it mounts
  var probe = (id, done) => {
    chrome.scripting.executeScript({
      target: {tabId: id},
      func: () => !!window.state
    }, (res) => {
      done(!chrome.runtime.lastError && !!res && res[0].result === true)
    })
  }

  var pending = 0

  var update = (id, retry = 0) => {
    var token = ++pending
    // storage may still be loading, hold on to the request instead of dropping it
    if (!state.content) {
      if (retry < 80) {
        setTimeout(() => token === pending && update(id, retry + 1), 250)
      }
      return
    }
    probe(id, (visible) => {
      // the probes are async, only the latest one gets to decide
      if (token !== pending) {
        return
      }
      chrome.contextMenus.update(item, {
        visible,
        checked: state.content.toc,
      }, () => chrome.runtime.lastError)
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
    if (info.menuItemId !== item || !state.content) {
      return
    }
    state.content.toc = info.checked
    set({content: state.content})
    chrome.tabs.sendMessage(tab.id, {message: 'toc', toc: info.checked},
      () => chrome.runtime.lastError)
  }

  return {create, active, tab, mounted, click}
}
