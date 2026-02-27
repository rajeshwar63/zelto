import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();

export async function initNativeFeatures(): Promise<void> {
  if (!isNative) return;

  try {
    await StatusBar.setStyle({ style: Style.Default });
    await StatusBar.setBackgroundColor({ color: '#ffffff' });
  } catch (e) {
    console.warn('StatusBar init failed:', e);
  }

  try {
    await SplashScreen.hide();
  } catch (e) {
    console.warn('SplashScreen hide failed:', e);
  }

  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch (e) {
    // Not supported on all platforms
  }
}

export function setupBackButtonHandler(onBack: () => void): () => void {
  if (!isNative) return () => {};

  const listenerPromise = App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      onBack();
    } else {
      App.exitApp();
    }
  });

  return () => {
    listenerPromise.then(h => h.remove());
  };
}

export async function hapticLight(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    console.warn('Haptics failed:', e);
  }
}

export async function hapticMedium(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (e) {
    console.warn('Haptics failed:', e);
  }
}
