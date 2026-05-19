const express = require("express");
const app = express();
const path = require("path");

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

  try {
    const slug = q.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    let url = `https://lista.mercadolivre.com.br/${slug}`;
    if (sort === "price_asc") url += "_OrderId_PRICE";
    if (sort === "price_desc") url += "_OrderId_PRICE_DESC";
    if (offset > 0) url += `_Desde_${offset + 1}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      }
    });

    const html = await response.text();

    // Extraer productos del HTML
    const items = [];
    const regex = /<li class="ui-search-layout__item[^"]*"[\s\S]*?<\/li>/g;
    const matches = html.match(regex) || [];

    for (const block of matches.slice(0, 24)) {
      try {
        // Título
        const titleMatch = block.match(/class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();

        // URL
        const urlMatch = block.match(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"]+)"/);
        if (!urlMatch) continue;
        const permalink = urlMatch[1].split("?")[0];

        // Precio
        const priceMatch = block.match(/class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([^<]+)</);
        const price = priceMatch ? parseInt(priceMatch[1].replace(/\./g, "")) : 0;

        // Imagen
        const imgMatch = block.match(/data-src="([^"]+)"|src="(https:\/\/http[^"]+)"/);
        const thumbnail = imgMatch ? (imgMatch[1] || imgMatch[2]) : "";

        // Flete gratis
        const freeShipping = /frete grátis|frete gratis/i.test(block);

        // Condición
        const condition = /usado/i.test(block) ? "used" : "new";

        items.push({ title, price, permalink, thumbnail, free_shipping: freeShipping, condition, currency: "BRL" });
      } catch (e) {
        continue;
      }
    }

    // Total estimado
    const totalMatch = html.match(/(\d[\d.]+)\s+resultados/);
    const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g, "")) : items.length;

    res.json({ results: items, paging: { total, offset, limit: 24 } });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
