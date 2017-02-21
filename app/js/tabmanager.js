'use strict';

/* global chrome, TW */
/* @flow */

import _ from 'underscore';

/**
 * Stores the tabs in a separate variable to log Last Accessed time.
 * @type {Object}
 */
const TabManager = {
  tabTimes: {}, // An array of tabId => timestamp

  closedTabs: {
    tabs: [],

    init() {
      const self = this;
      chrome.storage.local.get('savedTabs', function(items) {
        if (typeof items['savedTabs'] != 'undefined') {
          self.tabs = items['savedTabs'];
        }
      });
    },

    clear() {
      this.tabs = [];
      chrome.storage.local.remove('savedTabs');
    },

    // @todo: move to filter system for consistency
    findPositionById(id: number): ?number {
      for (let i = 0; i < this.tabs.length; i++) {
        if (this.tabs[i].id === id) {
          return i;
        }
      }
    },

    removeTab(tabId: number) {
      const tabIndex = TabManager.closedTabs.findPositionById(tabId);
      if (tabIndex == null) return;

      const output = TabManager.closedTabs.tabs.splice(tabIndex, 1);
      TabManager.closedTabs.save();
      return output;
    },

    save() {
      // persists this.tabs to local storage
      chrome.storage.local.set({savedTabs: this.tabs});
    },

    unwrangleTabs(tabs: Array<Object>) {
      const installDate = TW.settings.get('installDate');
      let countableTabsUnwrangled = 0;
      tabs.forEach(tab => {
        chrome.tabs.create({active: false, url: tab.url});
        this.removeTab(tab.id);

        // Count only those tabs closed after install date because users who upgrade will not have
        // an accurate count of all tabs closed. The updaters' install dates will be the date of
        // the upgrade, after which point TW will keep an accurate count of closed tabs.
        if (tab.closedAt >= installDate) countableTabsUnwrangled++;
      });

      const totalTabsUnwrangled = TW.settings.get('totalTabsUnwrangled');
      TW.settings.set('totalTabsUnwrangled', totalTabsUnwrangled + countableTabsUnwrangled);
    },

    wrangleTabs(tabs: Array<Object>) {
      const maxTabs = TW.settings.get('maxTabs');
      let totalTabsWrangled = TW.settings.get('totalTabsWrangled');
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i] === null) {
          console.log('Weird bug, backtrace this...');
        }

        tabs[i].closedAt = new Date().getTime();
        this.tabs.unshift(tabs[i]);
        totalTabsWrangled += 1;

        // Close it in Chrome.
        chrome.tabs.remove(tabs[i].id);
      }

      if ((this.tabs.length - maxTabs) > 0) {
        this.tabs = this.tabs.splice(0, maxTabs);
      }

      TW.settings.set('totalTabsWrangled', totalTabsWrangled);
      TabManager.closedTabs.save();
    },
  },

  filters: {
    // Matches when the URL is exactly matching
    exactUrl(url: string) {
      return function(tab: chrome$Tab) {
        return tab.url === url;
      };
    },

    // Matches either the title or URL containing "keyword"
    keyword(keyword: string) {
      return function(tab: chrome$Tab) {
        const test = new RegExp(keyword, 'i');
        return (tab.title != null && test.exec(tab.title)) ||
          (tab.url != null && test.exec(tab.url));
      };
    },
  },

  initTabs(tabs: Array<chrome$Tab>) {
    for (let i = 0; i < tabs.length; i++) {
      TabManager.updateLastAccessed(tabs[i]);
    }
  },

  /**
   * Wrapper function to get all tab times regardless of time inactive
   * @return {Array}
   */
  getAll() {
    return TabManager.getOlderThen();
  },

  /**
   * Returns tab times (hash of tabId : lastAccess)
   * @param time
   *  If null, returns all.
   * @return {Array}
   */
  getOlderThen(time?: number) {
    const ret = [];
    for (const i in this.tabTimes) {
      if (this.tabTimes.hasOwnProperty(i)) {
        if (!time || this.tabTimes[i] < time) {
          ret.push(parseInt(i, 10));
        }
      }
    }
    return ret;
  },

  getWhitelistMatch(url: string) {
    const whitelist = TW.settings.get('whitelist');
    for (let i = 0; i < whitelist.length; i++) {
      if (url.indexOf(whitelist[i]) !== -1) {
        return whitelist[i];
      }
    }
    return false;
  },

  isLocked(tabId: number) {
    const lockedIds = TW.settings.get('lockedIds');
    if (lockedIds.indexOf(tabId) !== -1) {
      return true;
    }
    return false;
  },

  isWhitelisted(url: string) {
    return this.getWhitelistMatch(url) !== false;
  },

  lockTab(tabId: number) {
    const lockedIds = TW.settings.get('lockedIds');

    if (tabId > 0 && lockedIds.indexOf(tabId) === -1) {
      lockedIds.push(tabId);
    }
    TW.settings.set('lockedIds', lockedIds);
  },

  /**
   * Kinda frivolous.  Abstracterbation FTW!
   * @param tabId
   */
  removeTab(tabId: number) {
    const totalTabsRemoved = TW.settings.get('totalTabsRemoved');
    TW.settings.set('totalTabsRemoved', totalTabsRemoved + 1);
    delete TabManager.tabTimes[tabId];
  },

  searchTabs(
    cb: (tabs: Array<chrome$Tab>) => void,
    filters: Array<(url: string) => ((tab: chrome$Tab) => boolean)>
  ) {
    let tabs = TabManager.closedTabs.tabs;
    if (filters) {
      for (let i = 0; i < filters.length; i++) {
        tabs = _.filter(tabs, filters[i]);
      }
    }
    cb(tabs);
  },

  unlockTab(tabId: number) {
    const lockedIds = TW.settings.get('lockedIds');
    if (lockedIds.indexOf(tabId) > -1) {
      lockedIds.splice(lockedIds.indexOf(tabId), 1);
    }
    TW.settings.set('lockedIds', lockedIds);
  },

  updateClosedCount() {
    if (TW.settings.get('showBadgeCount') === false) {
      return;
    }
    let storedTabs = TabManager.closedTabs.tabs.length;
    if (storedTabs === 0) {
      storedTabs = '';
    }
    chrome.browserAction.setBadgeText({text: storedTabs.toString()});
  },

  /**
   * Takes a tabId or a tab object
   * @param {mixed} tabId
   *  Tab ID or Tab object.
   */
  updateLastAccessed(tabOrTabId: chrome$Tab | number) {
    let tabId;
    if (typeof tabOrTabId === 'number') {
      tabId = tabOrTabId;
    } else {
      tabId = tabOrTabId.id;
    }

    if (typeof tabId !== 'number') {
      console.log('Error: `tabId` is not an number', tabId);
      return;
    }

    TabManager.tabTimes[tabId] = new Date().getTime();
  },
};

export default TabManager;