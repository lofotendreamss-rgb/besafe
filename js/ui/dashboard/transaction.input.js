import transactionService from "../../services/finance/transaction.service.js";

const expenseCategories = ["food","transport","shopping","bills","other"];
const incomeCategories = ["salary","bonus","gift","other"];

let isSubmitting = false;

export function renderTransactionInput(container){

  if(document.getElementById("transaction-input")) return;

  container.innerHTML += `
    <div id="transaction-input">
      <h3>Add Transaction</h3>

      <input type="number" id="tx-amount" placeholder="Amount" />

      <select id="tx-type">
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>

      <select id="tx-category"></select>

      <button id="tx-submit">Add</button>

      <small id="tx-feedback" style="display:block; margin-top:6px;"></small>
    </div>
  `;

  const amountEl = document.getElementById("tx-amount");
  const typeEl = document.getElementById("tx-type");
  const categoryEl = document.getElementById("tx-category");
  const button = document.getElementById("tx-submit");
  const feedbackEl = document.getElementById("tx-feedback");

  function setFeedback(msg, color="#888"){
    if(!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.style.color = color;
  }

  function renderCategories(type){
    const list = type === "income" ? incomeCategories : expenseCategories;
    categoryEl.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join("");
  }

  renderCategories(typeEl.value);

  typeEl.addEventListener("change", () => {
    renderCategories(typeEl.value);
  });

  if(!button) return;

  async function handleSubmit(){

    if(isSubmitting) return;

    const amount = Number(amountEl.value);
    const type = typeEl.value;
    const category = categoryEl.value;

    if(!amount || amount <= 0){
      setFeedback("Enter valid amount", "#e74c3c");
      return;
    }

    isSubmitting = true;
    button.disabled = true;
    setFeedback("Saving...");

    if(type === "expense"){
      await transactionService.addExpense(amount, category);
    } else {
      await transactionService.addIncome(amount, category);
    }

    amountEl.value = "";
    setFeedback("Saved ✔", "#27ae60");

    isSubmitting = false;
    button.disabled = false;

    if(window.loadHomeDashboard){
      await window.loadHomeDashboard();
    }
  }

  button.addEventListener("click", handleSubmit);

  amountEl.addEventListener("keypress", (e) => {
    if(e.key === "Enter"){
      handleSubmit();
    }
  });

}