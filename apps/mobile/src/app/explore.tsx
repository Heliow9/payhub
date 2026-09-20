import { Redirect } from 'expo-router';

/**
 * Compatibility route kept only to neutralize the default Expo starter route
 * in repositories that were updated by overlay instead of replacing the old
 * mobile folder. The PayHub app does not use /explore.
 */
export default function LegacyExploreRoute() {
  return <Redirect href="/" />;
}
