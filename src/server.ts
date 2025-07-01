import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import register, { type ToolOptions } from './tool.js';

const server = new McpServer({
  name: 'Demo',
  version: '1.0.0',
});

export async function start(options: ToolOptions) {
  const transport = new StdioServerTransport();
  await register(server, options);
  await server.connect(transport);
}
