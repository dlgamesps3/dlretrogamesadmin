async function generateDescription(name, consoleName) {
  function limitDescription(text) {
    text = String(text || "").replace(/\s+/g, " ").trim();

    if (text.length <= 150) return text;

    let shortened = text.slice(0, 147);
    shortened = shortened.replace(/\s+\S*$/, "");

    return shortened + "...";
  }

  for (const language of ["pt", "en"]) {
    try {
      const searchUrl = new URL(
        `https://${language}.wikipedia.org/w/api.php`
      );

      searchUrl.search = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: `${name} video game`,
        format: "json",
        origin: "*",
        srlimit: "5"
      }).toString();

      const response = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) continue;

      const data = await response.json();
      const results = data?.query?.search || [];

      if (!results.length) continue;

      const normalizedName = slugify(name).replace(/_/g, "");

      const result = results.find(item => {
        const title = slugify(item.title).replace(/_/g, "");
        return title.includes(normalizedName) ||
          normalizedName.includes(title);
      }) || results[0];

      const pageUrl = new URL(
        `https://${language}.wikipedia.org/w/api.php`
      );

      pageUrl.search = new URLSearchParams({
        action: "query",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exchars: "1000",
        pageids: String(result.pageid),
        format: "json",
        origin: "*"
      }).toString();

      const pageResponse = await fetch(pageUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });

      if (!pageResponse.ok) continue;

      const pageData = await pageResponse.json();

      const page = Object.values(
        pageData?.query?.pages || {}
      )[0];

      const extract = String(page?.extract || "")
        .replace(/\s+/g, " ")
        .trim();

      if (extract.length < 40) continue;

      const sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];

      let summary = "";

      for (const sentence of sentences) {
        if ((summary + sentence).length > 300) break;
        summary += sentence.trim() + " ";
      }

      summary = summary.trim();

      if (summary.length >= 40) {
        return limitDescription(summary);
      }

    } catch (error) {
      continue;
    }
  }

  return limitDescription(
    `${name} é um jogo de ${consoleName}. Reviva esse clássico dos videogames no DL RETRO GAMES.`
  );
}
