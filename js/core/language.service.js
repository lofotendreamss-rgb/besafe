// language.service.js
// BeSafe Language System (v1)

class LanguageService {
  constructor() {
    this.current = "en";

    this.dict = {
      en: {
        advisor: {
          labels: {
            danger: "Let’s look at this together",
            warning: "Something to review",
            good: "You’re doing well",
            info: "Overview"
          },
          forecastTitle: "Looking ahead",
          forecastChart: "Balance trend (7 days)"
        },

        ai: {
          fallback: {
            explanation: "I’m here with you. Let’s look at your situation step by step."
          }
        }
      },

      lt: {
        advisor: {
          labels: {
            danger: "Pažiūrėkime kartu",
            warning: "Verta atkreipti dėmesį",
            good: "Viskas gerai",
            info: "Apžvalga"
          },
          forecastTitle: "Žvilgsnis į priekį",
          forecastChart: "Balanso pokytis (7 dienos)"
        },

        ai: {
          fallback: {
            explanation: "Esu čia su tavimi — pažiūrėkime situaciją žingsnis po žingsnio."
          }
        }
      }
    };
  }

  set(lang) {
    if (this.dict[lang]) {
      this.current = lang;
    }
  }

  get(path) {
    const keys = path.split(".");
    let value = this.dict[this.current];

    for (const key of keys) {
      value = value?.[key];
      if (!value) return path;
    }

    return value;
  }
}

/* INSTANCE */

const language = new LanguageService();

/* EXPORT */

export { language };

/* GLOBAL */

window.language = language;