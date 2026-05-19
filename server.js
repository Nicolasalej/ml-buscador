const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/buscar", async (req, res) => {
  const q = req.query.q;
  const sort = req.query.sort || "";
  const offset = parseInt(req.query.offset) || 0;

  if (!q) return res.status(400).json({ error: "Falta el parámetro q" });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9" });

    const slug = q.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    let url = `https://lista.mercadolivre.com.br/${slug}`;
    if (sort === "price_asc") url += "_OrderId_PRICE";
    if (sort === "price_desc") url += "_OrderId_PRICE_DESC";
    if (offset > 0) url += `_Desde_${offset + 1}`;

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Esperar que carguen los productos
    await page.waitForSelector(".ui-search-layout__item", { timeout: 10000 }).catch(() => {});

    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll(".ui-search-layout__item");
      const results = [];

      cards.forEach(card => {
        try {
          const titleEl = card.querySelector(".poly-component__title, .ui-search-item__title");
          const priceEl = card.querySelector(".andes-money-amount__fraction");
          const linkEl = card.querySelector("a.poly-component__title, a.ui-search-item__group__element");
          const imgEl = card.querySelector("img.poly-component__picture, img.ui-search-result-image__element");
          const freeEl = card.querySelector(".poly-component__shipping, .ui-search-item__shipping");

          if (!titleEl || !linkEl) return;

          const price = priceEl ? parseInt(priceEl.textContent.replace(/\./g, "").replace(",", "")) : 0;
          const freeShipping = freeEl ? /grátis|gratis/i.test(freeEl.textContent) : false;
          const condition = /usado/i.test(card.textContent) ? "used" : "new";
          const img = imgEl ? (imgEl.dataset.src || imgEl.src || "") : "";

          results.push({
            title: titleEl.textContent.trim(),
            price,
            currency_id: "BRL",
            condition,
            thumbnail: img.replace("http://", "https://"),
            permalink: linkEl.href.split("?")[0],
            shipping: { free_shipping: freeShipping },
            sold_quantity: 0,
          });
        } catch(e) {}
      });

      return results;
    });

    const totalText = await page.evaluate(() => {
      const el = document.querySelector(".ui-search-search-result__quantity-results, h2.ui-search-search-result__quantity-results");
      return el ? el.textContent : "";
    });

    const totalMatch = totalText.match(/(\d[\d.]*)/);
    const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g, "")) : items.length;

    await browser.close();
    res.json({ results: items, paging: { total, offset, limit: 24 } });

  } catch (e) {
    if (browser) await browser.close();
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
