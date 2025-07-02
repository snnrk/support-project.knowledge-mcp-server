import { afterEach, beforeEach, describe, expect, test, it, vi } from 'vitest';
import { getSearchUrl, useBrowserContext, type ToolOptions } from './tool.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { chromium } from 'playwright';
import * as tool from './tool.js';
import { z } from 'zod';

vi.mock('playwright', () => {
  // テキストコンテンツのモック
  const mockTextContent = vi.fn().mockResolvedValue('テストタイトル');
  const mockAuthorTextContent = vi.fn().mockResolvedValue('テスト著者');
  const mockTagTextContent = vi.fn().mockResolvedValue('タグ1');
  const mockCreatedAtTextContent = vi.fn().mockResolvedValue('written by テスト著者 at 2025-01-01 12:00:00');

  // 検索結果アイテムのモック
  const mockKnowledgeItem = {
    locator: vi.fn().mockImplementation((selector) => {
      if (selector === '.insert_info') {
        return {
          getByRole: vi.fn().mockReturnValue({
            locator: vi.fn().mockReturnValue({
              textContent: mockTextContent
            }),
            getAttribute: vi.fn().mockResolvedValue('/test-article')
          }),
          locator: vi.fn().mockReturnValue({
            first: vi.fn().mockReturnValue({
              textContent: mockAuthorTextContent
            })
          })
        };
      }
      if (selector === '.item-info a span.tag.label.label-info') {
        return {
          all: vi.fn().mockResolvedValue([{
            textContent: mockTagTextContent
          }])
        };
      }
      return {
        all: vi.fn().mockResolvedValue([])
      };
    }),
    getByText: vi.fn().mockImplementation((regex) => {
      return {
        textContent: mockCreatedAtTextContent
      };
    })
  };

  // 検索結果リストのモック
  const mockKnowledgeList = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue([mockKnowledgeItem])
    })
  };

  // 検索ボタンのモック
  const mockSearchButton = {
    click: vi.fn().mockResolvedValue(undefined)
  };

  // 検索入力フィールドのモック
  const mockSearchInput = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined)
  };

  // ページオブジェクトのモック
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    getByRole: vi.fn().mockImplementation((role, options) => {
      if (role === 'textbox' && options?.name === 'keyword') {
        return {
          waitFor: vi.fn().mockResolvedValue(undefined),
          fill: vi.fn().mockResolvedValue(undefined)
        };
      }
      return {
        waitFor: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined)
      };
    }),
    locator: vi.fn().mockImplementation((selector) => {
      if (selector === '#knowledgeList') {
        return mockKnowledgeList;
      }
      if (selector === 'button[type=submit].btn-default') {
        return mockSearchButton;
      }
      return {
        waitFor: vi.fn().mockResolvedValue(undefined)
      };
    })
  };

  // ブラウザオブジェクトのモック
  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined)
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser)
    }
  };
});

describe('getSearchUrl', () => {
  it('should return correct search URL for given base URL', () => {
    expect(getSearchUrl('https://example.com')).toBe('https://example.com/open.knowledge/list');
    expect(getSearchUrl('http://localhost:3000')).toBe('http://localhost:3000/open.knowledge/list');
  });
});

describe('useBrowserContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize browser and page properly and return them', async () => {
    const browserContext = await useBrowserContext();

    // Verify chromium.launch is called with proper options
    expect(chromium.launch).toHaveBeenCalledWith({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    });

    // Verify browser and page properties exist
    expect(browserContext).toHaveProperty('browser');
    expect(browserContext).toHaveProperty('page');

    // Verify AsyncDisposable interface is implemented
    expect(typeof browserContext[Symbol.asyncDispose]).toBe('function');

    // Verify browser is closed when disposed
    await browserContext[Symbol.asyncDispose]();
    expect(browserContext.browser.close).toHaveBeenCalled();
  });
});

// Tests for MCP server tool registration
describe('Default export function (MCP server registration)', () => {
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };
  let mockOptions: ToolOptions;
  let registeredCallback: any = null;

  beforeEach(() => {
    // Mock MCP server
    mockServer = {
      registerTool: vi.fn().mockImplementation((_name, _schema, callback) => {
        // Save callback function for later testing
        registeredCallback = callback;
        return { name: 'knowledge-search' };
      })
    };

    // Mock options
    mockOptions = {
      url: 'https://example.com'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    registeredCallback = null;
  });

  it('should register knowledge-search tool to the server', async () => {
    await tool.default(mockServer as unknown as McpServer, mockOptions);

    // Verify registerTool is called
    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);

    // Verify it's registered with correct name and schema
    const calls = mockServer.registerTool.mock.calls;
    expect(calls.length).toBe(1);

    const [name, schema] = calls[0];
    expect(name).toBe('knowledge-search');
    expect(schema).toHaveProperty('description', 'Search for knowledge articles');
    expect(schema).toHaveProperty('title', 'Knowledge Search');
    expect(schema).toHaveProperty('inputSchema');
  });

  it('should return correct results from registered callback function', async () => {
    await tool.default(mockServer as unknown as McpServer, mockOptions);

    // Verify callback function is registered
    expect(registeredCallback).not.toBeNull();

    if (registeredCallback) {
      // Test callback function
      const result = await registeredCallback({ keyword: 'テスト' }, {});

      // Verify structure of returned value
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('structuredContent');
      expect(result.structuredContent).toHaveProperty('items');
      expect(result.structuredContent).toHaveProperty('total');

      // Verify content contains text
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');

      // Verify URL is correctly formatted
      const items = result.structuredContent.items as any[];
      expect(items[0].url).toContain('https://example.com/test-article');
    }
  });
});

// Tests for search functionality
describe('search function (internal function)', () => {
  let mockOptions: ToolOptions;

  beforeEach(() => {
    mockOptions = {
      url: 'https://example.com'
    };
    vi.clearAllMocks();
  });

  it('should indirectly verify the behavior of search function', async () => {
    // Test search function through default export function
    const mockServer = {
      registerTool: vi.fn().mockImplementation((_name, _schema, callback) => {
        // Execute callback
        callback({ keyword: 'テストキーワード' }, {});
        return { name: 'knowledge-search' };
      })
    };

    await tool.default(mockServer as unknown as McpServer, mockOptions);

    // Verify browser is launched
    expect(chromium.launch).toHaveBeenCalled();

    // Verify navigation to correct URL
    const browser = await chromium.launch();
    const page = await browser.newPage();
    expect(page.goto).toHaveBeenCalledWith(
      'https://example.com/open.knowledge/list',
      expect.objectContaining({
        timeout: 30000,
        waitUntil: 'networkidle'
      })
    );
  });
});

