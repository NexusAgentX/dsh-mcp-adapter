export const MCP_ROW_CSS = `
[data-dsh-mcp] .dsh-mcp-sep {
  flex: none;
  width: 2px;
  height: 2px;
  border-radius: 1px;
  margin: 0 8px;
  background: var(--dsw-alias-label-caption);
}
[data-dsh-mcp] .dsh-mcp-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 24px;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp] .dsh-mcp-summary[data-error] {
  color: var(--dsw-alias-state-error-primary);
}
[data-dsh-mcp] .dsh-mcp-actions {
  margin: 6px 0 4px 4px;
}
[data-dsh-mcp] .dsh-mcp-card {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  margin: 4px 0 4px 4px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-markdown-code-block);
}
[data-dsh-mcp] .dsh-mcp-card-head {
  flex: none;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-markdown-code-block-banner);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  color: var(--dsw-alias-label-caption);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
[data-dsh-mcp] .dsh-mcp-pre {
  min-height: 0;
  margin: 0;
  padding: 10px 12px 12px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: var(--dsw-font-markdown-code-block-small);
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp] .dsh-mcp-pre[data-error] {
  color: var(--dsw-alias-state-error-primary);
}
[data-dsh-mcp] .dsh-mcp-pre a {
  color: var(--dsw-alias-label-primary);
}
[data-dsh-mcp] .dsh-mcp-servers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px 10px;
}
[data-dsh-mcp] .dsh-mcp-server {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp] .dsh-mcp-server strong {
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-mcp] .dsh-mcp-inspect {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  margin: 4px 0 2px 4px;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms ease;
}
[data-dsh-mcp]:hover .dsh-mcp-inspect,
[data-dsh-mcp] .dsh-mcp-inspect:focus-visible {
  opacity: 1;
}
[data-dsh-mcp] .dsh-mcp-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
`
