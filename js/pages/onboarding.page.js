/**
 * BeSafe Onboarding / Splash Screen
 *
 * Animacijos seka:
 *   0.0s — juodas ekranas
 *   0.5s — „BeSafe" lėtai šviečia iš tamsos (1.8s)
 *   2.3s — „Leisk BeSafe dirbti už tave." pasirodo (0.7s fade)
 *   3.3s — kalbos mygtukai + „Pradėti" įsislenka iš apačios (0.6s)
 *   Paspaudus „Pradėti" — sklandus išblukimas ir einama į Home
 */

import { getCurrentLanguage } from "../core/i18n.js";

const ONBOARDING_KEY = "besafe_onboarding_done";

export function initOnboardingPage({ navigation } = {}) {
  return new OnboardingPage({ navigation });
}

export function isOnboardingDone() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}

class OnboardingPage {
  constructor({ navigation }) {
    this.navigation = navigation;
  }

  async onBeforeEnter() {}

  render() {
    return "";
  }

  async onAfterEnter() {}

  async onLeave() {}
}
