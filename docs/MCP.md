# USA Map Studio local MCP integration

The MCP server lets a local AI client inspect the project currently open in USA Map Studio and prepare changes. The desktop app must remain open while tools run.

## Safety model

- The Electron bridge binds only to `127.0.0.1` on an ephemeral port.
- Each app launch creates a new random 256-bit token.
- The runtime descriptor is written as a private regular file and rejected if it is a symlink or has broad POSIX permissions.
- Read tools never modify the map.
- Write tools stage one proposal. They do not apply it or write a project file.
- The app compares the proposal's `expectedUpdatedAt` value before staging and again before Apply.
- Removing locations and replacing a project are flagged as destructive to MCP clients, even though they still stop at human review.

When a read tool returns project or CSV-derived content, that returned content becomes part of the AI conversation. Do not use an AI client with material that is not approved for that client.

## Automatic ChatGPT desktop and Codex setup

The macOS and Windows setup scripts add a managed `usa_map_studio` block to the shared Codex configuration. Existing configuration is preserved and backed up before a change.

To register or repair it manually:

```bash
node scripts/configure-map-mcp.mjs install --executable "$(command -v node)"
```

To remove only the setup-managed block:

```bash
node scripts/configure-map-mcp.mjs remove
```

Restart ChatGPT desktop, Codex CLI, or the Codex IDE extension after configuration changes. Use `/mcp` in ChatGPT desktop or Codex to confirm the server is enabled.

## Other local MCP clients

Configure a STDIO server with:

- Command: the absolute path to a Node.js 22.13-or-later executable
- Arguments: the absolute path to `mcp/server.mjs`
- Working directory: the repository root
- Environment: `USA_MAP_MCP_RUNTIME_FILE` set to the app's runtime descriptor

Default runtime paths:

- macOS: `~/Library/Application Support/USA Map Studio/mcp-runtime.json`
- Windows: `%APPDATA%\USA Map Studio\mcp-runtime.json`
- Linux development: `~/.usa-map-studio/mcp-runtime.json`

The runtime descriptor exists only while the desktop app is open. Never copy its token into a static configuration file.

## Recommended AI workflow

1. Call `get_app_status`.
2. Call `get_current_project` or `list_locations` only for the project the user named.
3. Preserve the returned project ID and use its exact `updatedAt` as `expectedUpdatedAt`.
4. Call one stage tool.
5. Tell the user the proposal is waiting in USA Map Studio and has not been applied or saved.
6. Wait for the user to apply or reject it before preparing another proposal.

For city/state lists, prefer `stage_locations_from_csv`; it uses the same bundled 2025 Census place index as the app and returns unresolved rows explicitly. Use `stage_locations_add` only when exact coordinates are known.
