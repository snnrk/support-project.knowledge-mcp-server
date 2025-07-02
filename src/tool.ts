import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { z } from 'zod';

export type ToolOptions = {
  url: string;
};

const searchInputSchema = z.object({ keyword: z.string() });
const searchOutputSchema = z.object({
  author: z.string(),
  createdAt: z.string(),
  tags: z.string().array(),
  title: z.string(),
  url: z.string(),
});

type SearchResult = z.infer<typeof searchOutputSchema>;
type BrowserContext = {
  browser: Browser;
  page: Page;
};

export function getSearchUrl(baseUrl: string) {
  return `${baseUrl}/open.knowledge/list`;
}

export async function useBrowserContext(): Promise<AsyncDisposable & BrowserContext> {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });
  const page = await browser.newPage();

  return {
    browser,
    page,
    async [Symbol.asyncDispose]() {
      await browser.close();
    },
  };
}

async function search({ keyword }: z.infer<typeof searchInputSchema>, options: ToolOptions): Promise<SearchResult[]> {
  await using ctx = await useBrowserContext();

  await ctx.page.goto(getSearchUrl(options.url), {
    timeout: 30000,
    waitUntil: 'networkidle',
  });

  // 検索フォームが表示されるのを待つ
  const searchInput = ctx.page.getByRole('textbox', { name: 'keyword' });
  await searchInput.waitFor({ state: 'visible', timeout: 10000 });

  // 検索を実行
  await searchInput.fill(keyword);
  await ctx.page.locator('button[type=submit].btn-default').click();

  // 検索結果が表示されるのを待つ
  const knowledgeList = ctx.page.locator('#knowledgeList');
  await knowledgeList.waitFor({ state: 'visible', timeout: 30000 });

  const items = await knowledgeList.locator('.knowledge_item').all();

  const results = await Promise.all(
    items.map(async (item) => {
      const insertInfo = item.locator('.insert_info');
      const linkEl = insertInfo.getByRole('link', { name: /^#[0-9]+ .+$/ });
      const titleEl = linkEl.locator('.list-title');
      const authorEl = insertInfo.locator('> div > a').first();
      const dateEl = item.getByText(/written by .+ at/);
      const tagEls = await item.locator('.item-info a span.tag.label.label-info').all();

      const title = (await titleEl.textContent())?.trim().replace(/[\n\s]+/, ' ') || '';
      const url = (await linkEl.getAttribute('href')) || '';
      const author = (await authorEl.textContent()) || '';
      const createdText = (await dateEl.textContent()) || '';
      const createdAt = createdText.match(/written by .+ at (.+?)(?:\s*\(|$)/)?.[1] || '';
      const tags = await Promise.all(tagEls.map(async (tagEl) => (await tagEl.textContent()) || ''));

      return { author, createdAt, tags, title, url };
    }),
  );

  return results;
}

export default async function (server: McpServer, options: ToolOptions) {
  server.registerTool(
    'knowledge-search',
    {
      description: 'Search for knowledge articles',
      inputSchema: searchInputSchema.shape,
      title: 'Knowledge Search',
    },
    async ({ keyword }, _extra) => {
      const results = await search({ keyword }, options);
      const formattedResults = results.map((result) => ({
        author: result.author,
        createdAt: result.createdAt,
        tags: result.tags,
        title: result.title,
        url: `${options.url}${result.url}`,
      }));

      const structuredContent: { [key: string]: unknown } = {
        items: formattedResults,
        total: formattedResults.length,
      };

      return {
        content: [
          {
            text: JSON.stringify(formattedResults, null, 2),
            type: 'text',
          },
        ],
        structuredContent,
      };
    },
  );
}
