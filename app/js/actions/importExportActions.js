/* @flow */

import type { Dispatch, GetState } from '../Types';
import {
  setSavedTabs,
  setTotalTabsRemoved,
  setTotalTabsUnwrangled,
  setTotalTabsWrangled,
} from './localStorageActions';
import FileSaver from 'file-saver';

/**
 * Import the backup of saved tabs and the accounting information.
 * If any of the required keys in the backup object is missing, the backup will abort without
 * importing the data.
 *
 * @param event contains the path of the backup file
 */
function importData(event: SyntheticInputEvent<HTMLInputElement>) {
  return function(dispatch: Dispatch): Promise<void> {
    const files = event.target.files;
    if (files[0]) {
      return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          try {
            const json = JSON.parse(String(fileReader.result));
            if (Object.keys(json).length < 4) {
              reject(new Error('Invalid backup'));
            } else {
              const savedTabs = json.savedTabs;
              const totalTabsRemoved = json.totalTabsRemoved;
              const totalTabsUnwrangled = json.totalTabsUnwrangled;
              const totalTabsWrangled = json.totalTabsWrangled;

              dispatch(setTotalTabsRemoved(totalTabsRemoved));
              dispatch(setTotalTabsUnwrangled(totalTabsUnwrangled));
              dispatch(setTotalTabsWrangled(totalTabsWrangled));
              dispatch(setSavedTabs(savedTabs));
              resolve();
            }
          } catch (e) {
            reject(e);
          }
        };

        fileReader.onerror = arg => {
          reject(arg);
        };
        fileReader.readAsText(files[0], 'utf-8');
      });
    } else {
      return Promise.reject('Nothing to import');
    }
  };
}

/**
 * Export all saved tabs and some accounting information in one object. The object has 4 keys:
 *
 * - savedTabs
 * - totalTabsRemoved
 * - totalTabsUnwrangled
 * - totalTabsWrangled
 *
 * `savedTabs` is acquired by reading it directly from the Store.
 */
function exportData() {
  return function(dispatch: Dispatch, getState: GetState) {
    const { localStorage } = getState();
    const exportObject = {
      savedTabs: localStorage.savedTabs,
      totalTabsRemoved: localStorage.totalTabsRemoved,
      totalTabsUnwrangled: localStorage.totalTabsUnwrangled,
      totalTabsWrangled: localStorage.totalTabsWrangled,
    };
    const exportData = JSON.stringify(exportObject);
    const blob = new Blob([exportData], {
      type: 'application/json;charset=utf-8',
    });
    FileSaver.saveAs(blob, exportFileName(new Date(Date.now())));
  };
}

const exportFileName = (date: Date) => {
  const localeDateString = date.toLocaleDateString('en-US').replace(/\//g, '-');
  return `TabWranglerExport-${localeDateString}.json`;
};

export { importData, exportData, exportFileName };
