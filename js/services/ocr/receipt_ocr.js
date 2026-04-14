class ReceiptOCR {

  constructor() {
    this.processing = false;
    this.worker = null;
  }

  /* ========================= */
  /* PREPARE IMAGE              */
  /* ========================= */

  prepareImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target.result;
      };

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxWidth = 1200;

        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          const scale = maxWidth / width;
          width = maxWidth;
          height = height * scale;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        // Improve contrast for better OCR
        ctx.filter = "contrast(1.3) grayscale(1)";
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas);
      };

      reader.readAsDataURL(file);
    });
  }

  /* ========================= */
  /* OCR                        */
  /* ========================= */

  async runOCR(image) {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker();
      await this.worker.loadLanguage("lit+eng");
      await this.worker.initialize("lit+eng");
    }

    const { data: { text } } = await this.worker.recognize(image);
    return text;
  }

  /* ========================= */
  /* STORE DETECTION            */
  /* ========================= */

  detectStore(text) {
    const stores = [
      "LIDL", "MAXIMA", "IKI", "RIMI",
      "NORFA", "ALDI", "BARBORA",
      "TESCO", "CARREFOUR", "WALMART",
    ];

    const upper = text.toUpperCase();

    for (const store of stores) {
      if (upper.includes(store)) {
        return store;
      }
    }

    return null;
  }

  /* ========================= */
  /* TOTAL DETECTION            */
  /* ========================= */

  detectTotal(text) {
    const lines = text.split("\n");

    for (const line of lines) {
      const clean = line.replace(",", ".").trim();

      if (
        clean.toUpperCase().includes("TOTAL") ||
        clean.toUpperCase().includes("SUMA") ||
        clean.toUpperCase().includes("MOKĖTI") ||
        clean.toUpperCase().includes("MOKETI") ||
        clean.toUpperCase().includes("VISO") ||
        clean.toUpperCase().includes("IŠ VISO") ||
        clean.toUpperCase().includes("IS VISO")
      ) {
        const match = clean.match(/([0-9]+[.,][0-9]{2})/);
        if (match) {
          return parseFloat(match[1].replace(",", "."));
        }
      }
    }

    return null;
  }

  /* ========================= */
  /* PRODUCT PARSER             */
  /* ========================= */

  extractProducts(text) {
    const lines = text.split("\n");
    const products = [];

    for (const line of lines) {
      const clean = line.replace(",", ".").trim();
      const match = clean.match(/^(.+?)\s+([0-9]+\.[0-9]{2})$/);

      if (match) {
        const name = match[1].trim();
        const price = parseFloat(match[2]);

        if (name.length > 2 && price > 0) {
          products.push({ name, price });
        }
      }
    }

    return products;
  }
}

window.receiptOCR = new ReceiptOCR();
