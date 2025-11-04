import Apify from "apify";


const { log } = Apify;

const BASE_URL = "https://elegal.cz";
const START_URL = "https://elegal.cz/blog";

Apify.main(async () => {
  const input = await Apify.getInput();
  let categories = input?.categories || [];

  const requestQueue = await Apify.openRequestQueue();

  if (categories.length === 0) {
    await requestQueue.addRequest({
      url: START_URL,
      userData: { label: "START_PAGE" },
    });
  } else {
    for (const url of categories) {
      await requestQueue.addRequest({
        url,
        userData: { label: "CATEGORY_PAGE" },
      });
    }
  }

  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    maxConcurrency: 3,
    proxyUrls: [
            process.env.ROTATING_PROXY_URL,  // optional
            process.env.PREMIUM_PROXY_URL    // optional
        ].filter(Boolean),
    handlePageFunction: async ({ $, request }) => {
      const label = request.userData.label;

      if (label === "START_PAGE") {
        const categoryLinks = $("#blog-categories a").toArray();
        for (const el of categoryLinks) {
          const href = $(el).attr("href");
          if (href) {
            const fullUrl = new URL(href, BASE_URL).href.trim().toLowerCase();
            categories.push(fullUrl);
            await requestQueue.addRequest({
              url: fullUrl,
              userData: { label: "CATEGORY_PAGE" },
            });
          }
        }

        log.info(`Discovered categories: ${categories.length}`);
        return;
      }

      if (label === "CATEGORY_PAGE") {
        const postLinks = $(".blog-box__link").toArray();
        for (const el of postLinks) {
          const href = $(el).attr("href");
          if (href) {
            await requestQueue.addRequest({
              url: new URL(href, BASE_URL).href,
              userData: { label: "DETAIL_PAGE" },
            });
          }
        }

        const nextPage = $('#pagination-list-next a[rel="next"]').attr("href");
        if (nextPage) {
          const nextPageUrl = new URL(nextPage, BASE_URL).href;
          await requestQueue.addRequest({
            url: nextPageUrl,
            userData: { label: "CATEGORY_PAGE" },
          });
        }
      }

      if (label === "DETAIL_PAGE") {
        const title = $("h1").text().trim();
        const perex = $("div.perex p").text().trim();
        const date = $("ul.list-inline.list-date-category-user li")
          .first()
          .text()
          .trim();
        const tags = [];
        $(".blog-box--transparent .active").each((_, el) => {
          const tag = $(el).text().trim();
          if (tag) tags.push(tag);
        });

        let content = "";
        $('[content-type="text"]').each((_, el) => {
          content += $(el).text().trim() + "\n";
        });
        content = content.trim();

        await Apify.pushData({
          title,
          date,
          url: request.url,
          perex,
          tags,
          content,
        });
        log.info(`Scraped: ${title}`);
      }
    },
    handleFailedRequestFunction: async ({ request }) => {
      log.error(`Request failed ${request.url}`);
    },
  });

  await crawler.run();
  log.info("Crawling finished successfully!");
});
