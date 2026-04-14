export const database = {
  ready: Promise.resolve(),

  async getTransactions() {
    return [];
  },

  async saveTransactions() {
    return true;
  },

  async reset() {
    return true;
  },
};