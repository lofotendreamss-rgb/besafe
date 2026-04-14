class ServiceRegistry {
  constructor() {
    this.services = new Map();
  }

  validateName(name) {
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error(
        "[Registry] Nepavyko užregistruoti serviso: neteisingas pavadinimas."
      );
    }

    return name.trim();
  }

  register(name, instance) {
    const safeName = this.validateName(name);

    if (typeof instance === "undefined") {
      throw new Error(
        `[Registry] Nepavyko užregistruoti serviso "${safeName}": instance nenurodytas.`
      );
    }

    if (this.services.has(safeName)) {
      throw new Error(`[Registry] Servisas jau užregistruotas: ${safeName}`);
    }

    this.services.set(safeName, instance);
    return instance;
  }

  registerOrReplace(name, instance) {
    const safeName = this.validateName(name);

    if (typeof instance === "undefined") {
      throw new Error(
        `[Registry] Nepavyko užregistruoti serviso "${safeName}": instance nenurodytas.`
      );
    }

    this.services.set(safeName, instance);
    return instance;
  }

  get(name) {
    const safeName = this.validateName(name);

    if (!this.services.has(safeName)) {
      throw new Error(`[Registry] Servisas nerastas: ${safeName}`);
    }

    return this.services.get(safeName);
  }

  getOptional(name) {
    const safeName = this.validateName(name);

    if (!this.services.has(safeName)) {
      return null;
    }

    return this.services.get(safeName);
  }

  has(name) {
    const safeName = this.validateName(name);
    return this.services.has(safeName);
  }

  pick(names = []) {
    if (!Array.isArray(names)) {
      throw new Error(
        "[Registry] pick tikisi masyvo su servisų pavadinimais."
      );
    }

    return names.reduce((result, name) => {
      const safeName = this.validateName(name);
      result[safeName] = this.getOptional(safeName);
      return result;
    }, {});
  }

  list() {
    return Array.from(this.services.keys());
  }

  debugSnapshot() {
    return this.list().map((name) => {
      const instance = this.services.get(name);
      const type =
        instance === null
          ? "null"
          : Array.isArray(instance)
          ? "array"
          : typeof instance;

      const constructorName =
        instance && instance.constructor && instance.constructor.name
          ? instance.constructor.name
          : null;

      return {
        name,
        type,
        constructorName,
      };
    });
  }

  clear() {
    this.services.clear();
  }
}

export const registry = new ServiceRegistry();