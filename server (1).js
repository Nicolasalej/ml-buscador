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
    // Intentar con la API de ML primero
    const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=24&offset=${offset}${sort ? "&sort=" + sort : ""}`;
    
    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": "https://www.mercadolivre.com.br/",
        "Origin": "https://www.mercadolivre.com.br",
      }
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.results && data.results.length > 0) {
        return res.json(data);
      }
    }

    // Fallback: scraping del sitio web
    const slug = q.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    let url = `https://lista.mercadolivre.com.br/${slug}`;
    if (sort === "price_asc") url += "_OrderId_PRICE";
    if (sort === "price_desc") url += "_OrderId_PRICE_DESC";
    if (offset > 0) url += `_Desde_${offset + 1}`;

    const scrapeRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
      }
    });

    const html = await scrapeRes.text();
    const items = [];

    // Intentar extraer JSON embebido en el HTML
    const jsonPatterns = [
      /window\.__PRELOADED_STATE__\s*=\s*(\{.+?\});/s,
      /window\.__INITIAL_STATE__\s*=\s*(\{.+?\});/s,
      /"results"\s*:\s*(\[[\s\S]+?\])\s*,\s*"paging"/,
    ];

    for (const pattern of jsonPatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          const results = Array.isArray(parsed) ? parsed :
            parsed?.results || parsed?.initialState?.results || 
            parsed?.listingMain?.results || [];
          
          for (const item of results.slice(0, 24)) {
            if (!item.title) continue;
            items.push({
              id: item.id,
              title: item.title,
              price: item.price || 0,
              currency_id: "BRL",
              condition: item.condition || "new",
              thumbnail: (item.thumbnail || item.pictures?.[0]?.url || "").replace("http://", "https://"),
              permalink: item.permalink || `https://www.mercadolivre.com.br/p/${item.id}`,
              shipping: { free_shipping: item.shipping?.free_shipping || false },
              sold_quantity: item.sold_quantity || 0,
            });
          }
          if (items.length > 0) break;
        } catch(e) {}
      }
    }

    const totalMatch = html.match(/(\d[\d.]*)\s*resultados/i);
    const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g, "")) : items.length;

    res.json({
      results: items,
      paging: { total, offset, limit: 24 },
      debug: {
        html_length: html.length,
        url_fetched: url,
        status: scrapeRes.status,
        items_found: items.length,
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
