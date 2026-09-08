import { useSyncExternalStore } from 'react';

import { appController, AppController } from './appController';

/**
 * Subscribe a component to the shared `AppController`. Returns the singleton;
 * the component re-renders whenever `notify()` fires (the React analogue of
 * Flutter's `ListenableBuilder` around a `ChangeNotifier`).
 */
export function useAppController(): AppController {
  useSyncExternalStore(
    appController.subscribe,
    appController.getSnapshot,
    appController.getSnapshot,
  );
  return appController;
}
