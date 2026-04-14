export class MemoryService {
  constructor() {
    this.memory = {
      userName: null,
      goals: [],
      preferences: {},
      lastTopics: []
    };

    this.load();
  }

  /* =====================
     💾 STORAGE
  ===================== */

  save() {
    localStorage.setItem("besafe_memory", JSON.stringify(this.memory));
  }

  load() {
    const data = localStorage.getItem("besafe_memory");
    if (data) {
      try {
        this.memory = JSON.parse(data);
      } catch (e) {
        console.warn("[Memory] failed to load");
      }
    }
  }

  /* =====================
     👤 USER
  ===================== */

  setUserName(name) {
    this.memory.userName = name;
    this.save();
  }

  getUserName() {
    return this.memory.userName;
  }

  /* =====================
     🎯 GOALS
  ===================== */

  addGoal(goal) {
    if (!this.memory.goals.includes(goal)) {
      this.memory.goals.push(goal);
      this.save();
    }
  }

  getGoals() {
    return this.memory.goals;
  }

  /* =====================
     🧠 CONTEXT
  ===================== */

  addTopic(topic) {
    this.memory.lastTopics.push(topic);

    if (this.memory.lastTopics.length > 5) {
      this.memory.lastTopics.shift();
    }

    this.save();
  }

  getLastTopics() {
    return this.memory.lastTopics;
  }

  /* =====================
     ⚙️ RESET
  ===================== */

  clear() {
    localStorage.removeItem("besafe_memory");
    this.memory = {
      userName: null,
      goals: [],
      preferences: {},
      lastTopics: []
    };
  }
}