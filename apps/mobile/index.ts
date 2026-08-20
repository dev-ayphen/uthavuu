// Must load before anything touches i18next: Hermes still doesn't implement
// Intl.PluralRules, and i18next v24+ has no fallback for it.
import 'intl-pluralrules';
import '@uthavu/libs-mobile/i18n';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
